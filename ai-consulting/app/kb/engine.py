"""Local knowledge base engine — ChromaDB + FastEmbed + BM25 hybrid search + Reranker"""
from __future__ import annotations
import os
import re
import math
import hashlib
import time
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path

# Offline mode: use local model cache only (avoids network download on startup).
# Must be set BEFORE fastembed is imported anywhere.
os.environ.setdefault("HF_HUB_OFFLINE", "1")

# Import reranker module (lazy model loading)
try:
    from reranker import rerank as _rerank_fn, is_available as _reranker_available
except ImportError:
    _rerank_fn = None
    _reranker_available = lambda: False

# ── Constants ───────────────────────────────────────────

_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
_LOCAL_KB_ROOT = os.path.join(_THIS_DIR, '..')
DEFAULT_PERSIST_DIR = os.path.join(_LOCAL_KB_ROOT, 'chroma_data')
DEFAULT_COLLECTION = "arbitral_agent_kb"
EMBEDDING_MODEL = "BAAI/bge-small-zh-v1.5"

# 永久缓存目录 — 使用项目本地路径，避免系统临时目录被清理导致重新下载
FASTEMBED_CACHE_DIR = os.path.join(_LOCAL_KB_ROOT, 'fastembed_cache')

def _setup_cache_dir():
    """设置 FASTEMBED_CACHE_PATH 环境变量，指向项目本地永久目录。"""
    os.makedirs(FASTEMBED_CACHE_DIR, exist_ok=True)
    os.environ['FASTEMBED_CACHE_PATH'] = FASTEMBED_CACHE_DIR

# 模块加载时立即设置缓存目录（在 fastembed 首次 import 之前）
_setup_cache_dir()

# ── Lazy dependency loader ──────────────────────────────

class MissingDependencyError(ImportError):
    """Raised when chromadb or fastembed is not installed."""
    pass

def _ensure_deps():
    try:
        import chromadb
        from fastembed import TextEmbedding
        return chromadb, TextEmbedding
    except ImportError as e:
        msg = (
            f"Local KB dependencies not installed: {e}\n"
            "Install with: pip install -r requirements.txt\n"
            "Slow download? Use mirror: pip install -r requirements.txt -i https://mirrors.aliyun.com/pypi/simple/"
        )
        raise MissingDependencyError(msg) from e
MAX_CHUNK_CHARS = 2000
CHUNK_OVERLAP = 200

TEXT_EXTENSIONS = {
    '.txt', '.md', '.py', '.js', '.ts', '.json', '.yaml', '.yml',
    '.toml', '.cfg', '.ini', '.csv', '.html', '.css', '.xml', '.sql',
    '.sh', '.bash', '.zsh', '.ps1', '.rst', '.tex', '.java', '.c',
    '.cpp', '.h', '.hpp', '.rs', '.go', '.rb', '.php', '.swift',
    '.kt', '.scala', '.r', '.jl', '.lua', '.bat', '.log',
}


# ── Data models ─────────────────────────────────────────

@dataclass
class ChunkDocument:
    doc_id: str
    content: str
    source_path: str
    chunk_index: int = 0
    total_chunks: int = 1
    file_mtime: float = 0.0
    token_count: int = 0

@dataclass
class SearchResult:
    content: str
    source_path: str
    score: float
    chunk_index: int = 0
    metadata: dict = field(default_factory=dict)


# ── BM25 keyword search ──────────────────────────────────

# Regex: split on non-alphanumeric/non-CJK boundaries
_TOKEN_RE = re.compile(
    r'[a-zA-Z0-9]+|[一-鿿㐀-䶿]'  # English words | single CJK chars
)

def tokenize_zh(text: str) -> list[str]:
    """Tokenize Chinese/English text into searchable terms.
    - CJK characters: each char as a token + bigrams for phrase matching
    - English/numbers: whole words (lowercased)
    - Also extracts number+unit patterns (e.g., "563条", "第585条")
    """
    text = text.lower()
    tokens = []

    # Extract number+article patterns first (e.g., "第563条", "585条", "第三条")
    for m in re.finditer(r'第?[\d一二三四五六七八九十百千]+条', text):
        tokens.append(m.group())

    # Standard tokenization
    for m in _TOKEN_RE.finditer(text):
        tok = m.group()
        tokens.append(tok)

    # Add CJK bigrams for phrase-level matching
    cjk_chars = [t for t in tokens if len(t) == 1 and '一' <= t <= '鿿']
    for i in range(len(cjk_chars) - 1):
        tokens.append(cjk_chars[i] + cjk_chars[i + 1])

    return tokens


class BM25Index:
    """In-memory BM25 inverted index for keyword search."""

    def __init__(self, k1: float = 1.5, b: float = 0.75):
        self.k1 = k1
        self.b = b
        # doc_id -> (content, source_path, chunk_index, metadata)
        self._docs: dict[str, tuple[str, str, int, dict]] = {}
        # term -> {doc_id: tf}
        self._index: dict[str, dict[str, int]] = defaultdict(dict)
        # doc_id -> doc length (in tokens)
        self._doc_lengths: dict[str, int] = {}
        self._avg_dl: float = 0.0
        self._doc_count: int = 0

    def add_document(self, doc_id: str, content: str, source_path: str,
                     chunk_index: int = 0, metadata: dict | None = None):
        """Add a document to the BM25 index."""
        tokens = tokenize_zh(content)
        if not tokens:
            return

        self._docs[doc_id] = (content, source_path, chunk_index, metadata or {})
        tf = Counter(tokens)
        for term, count in tf.items():
            self._index[term][doc_id] = count
        self._doc_lengths[doc_id] = len(tokens)

    def build(self):
        """Recompute derived statistics after adding documents."""
        self._doc_count = len(self._docs)
        if self._doc_count > 0:
            self._avg_dl = sum(self._doc_lengths.values()) / self._doc_count
        else:
            self._avg_dl = 0

    def search(self, query: str, top_k: int = 5) -> list[tuple[str, float]]:
        """Search and return (doc_id, score) pairs sorted by score desc."""
        if self._doc_count == 0:
            return []

        query_tokens = tokenize_zh(query)
        if not query_tokens:
            return []

        scores: dict[str, float] = defaultdict(float)
        N = self._doc_count
        avg_dl = self._avg_dl if self._avg_dl > 0 else 1

        for term in query_tokens:
            if term not in self._index:
                continue
            posting = self._index[term]
            df = len(posting)
            # IDF with floor to avoid negative values
            idf = math.log((N - df + 0.5) / (df + 0.5) + 1.0)

            for doc_id, tf in posting.items():
                dl = self._doc_lengths.get(doc_id, avg_dl)
                numerator = tf * (self.k1 + 1)
                denominator = tf + self.k1 * (1 - self.b + self.b * dl / avg_dl)
                scores[doc_id] += idf * numerator / denominator

        ranked = sorted(scores.items(), key=lambda x: -x[1])
        return ranked[:top_k]

    def get_doc(self, doc_id: str) -> tuple[str, str, int, dict] | None:
        return self._docs.get(doc_id)


def rrf_fuse(
    *ranked_lists: list[tuple[str, float]],
    k: int = 60,
    top_k: int = 5,
) -> list[tuple[str, float]]:
    """Reciprocal Rank Fusion over multiple ranked lists.
    Each list is [(doc_id, score), ...] sorted by score desc.
    Returns [(doc_id, rrf_score), ...] sorted by rrf_score desc.
    """
    rrf_scores: dict[str, float] = defaultdict(float)
    for ranked in ranked_lists:
        for rank, (doc_id, _) in enumerate(ranked):
            rrf_scores[doc_id] += 1.0 / (k + rank + 1)
    merged = sorted(rrf_scores.items(), key=lambda x: -x[1])
    return merged[:top_k]


class LocalKBError(Exception):
    pass


# ── Core engine ─────────────────────────────────────────

class LocalKB:
    """Local vector knowledge base backed by ChromaDB."""

    def __init__(self, persist_dir=None, collection_name=None):
        self._persist_dir = persist_dir or DEFAULT_PERSIST_DIR
        self._collection_name = collection_name or DEFAULT_COLLECTION
        self._client = None
        self._collection = None
        self._embed_fn = None
        self._initialized = False
        self._bm25: BM25Index | None = None

    def _ensure_collection(self):
        if self._initialized:
            return
        chromadb, TextEmbedding = _ensure_deps()

        os.makedirs(self._persist_dir, exist_ok=True)
        self._client = chromadb.PersistentClient(path=self._persist_dir)

        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            fut = pool.submit(TextEmbedding, model_name=EMBEDDING_MODEL)
            try:
                self._embed_fn = fut.result(timeout=15)
            except concurrent.futures.TimeoutError:
                raise RuntimeError(
                    f"嵌入模型 {EMBEDDING_MODEL} 加载超时（>30秒），"
                    "请检查网络是否可访问 HuggingFace，或手动下载模型到本地缓存。"
                )
            except Exception as e:
                raise RuntimeError(
                    f"嵌入模型加载失败: {e}\n"
                    f"请手动下载: pip install -U fastembed && python3 -c "
                    f"\"from fastembed import TextEmbedding; TextEmbedding('{EMBEDDING_MODEL}')\""
                )

        try:
            self._collection = self._client.get_collection(self._collection_name)
        except Exception:
            self._collection = self._client.create_collection(
                name=self._collection_name,
                metadata={"hnsw:space": "cosine"},
            )
        self._initialized = True

        # Build BM25 index from ChromaDB documents
        self._build_bm25_index()

    def _build_bm25_index(self):
        """Load all ChromaDB documents into the BM25 inverted index."""
        if self._collection.count() == 0:
            self._bm25 = BM25Index()
            self._bm25.build()
            return

        bm25 = BM25Index()
        all_data = self._collection.get(include=["documents", "metadatas"])
        for doc_id, doc, meta in zip(all_data['ids'], all_data['documents'], all_data['metadatas']):
            bm25.add_document(
                doc_id=doc_id,
                content=doc,
                source_path=meta.get('source_path', ''),
                chunk_index=meta.get('chunk_index', 0),
                metadata=meta,
            )
        bm25.build()
        self._bm25 = bm25

    # ── Indexing ─────────────────────────────────────────

    def index(self, path, recursive=True, glob_pattern=None):
        self._ensure_collection()
        t0 = time.time()

        path = os.path.abspath(path)
        files = self._collect_files(path, recursive, glob_pattern)

        indexed, skipped, errors = 0, 0, []
        for fpath in files:
            try:
                chunks = self._chunk_file(fpath)
                if not chunks:
                    skipped += 1
                    continue
                self._index_chunks(chunks)
                indexed += len(chunks)
            except Exception as e:
                errors.append({"path": fpath, "error": str(e)})

        return {
            "indexed_count": indexed,
            "skipped_count": skipped,
            "error_count": len(errors),
            "errors": errors[:20],
            "elapsed_sec": round(time.time() - t0, 1),
        }

    def _collect_files(self, path, recursive, glob_pattern):
        from fnmatch import fnmatch

        if os.path.isfile(path):
            return [path] if self._is_text_file(path) else []
        if not os.path.isdir(path):
            raise LocalKBError(f"Path does not exist: {path}")

        files = []
        for root, dirs, fnames in os.walk(path):
            dirs[:] = [d for d in dirs if not d.startswith('.')]
            for fn in fnames:
                if not self._is_text_file(fn):
                    continue
                if glob_pattern and not fnmatch(fn, glob_pattern):
                    continue
                files.append(os.path.join(root, fn))
            if not recursive:
                break
        return files

    @staticmethod
    def _is_text_file(filename):
        ext = os.path.splitext(filename)[1].lower()
        return ext in TEXT_EXTENSIONS

    def _chunk_file(self, fpath):
        try:
            with open(fpath, 'r', encoding='utf-8', errors='replace') as f:
                text = f.read()
        except Exception:
            return []

        mtime = os.path.getmtime(fpath)
        if len(text) <= MAX_CHUNK_CHARS:
            doc_id = self._make_doc_id(fpath, 0)
            return [ChunkDocument(
                doc_id=doc_id, content=text, source_path=fpath,
                chunk_index=0, total_chunks=1, file_mtime=mtime,
                token_count=len(text),
            )]

        chunks = []
        start = 0
        while start < len(text):
            end = min(start + MAX_CHUNK_CHARS, len(text))
            chunk_text = text[start:end]
            chunks.append(ChunkDocument(
                doc_id=self._make_doc_id(fpath, len(chunks)),
                content=chunk_text, source_path=fpath,
                chunk_index=len(chunks), file_mtime=mtime,
                token_count=len(chunk_text),
            ))
            if end >= len(text):
                break
            start = end - CHUNK_OVERLAP

        for c in chunks:
            c.total_chunks = len(chunks)
        return chunks

    @staticmethod
    def _make_doc_id(path, chunk_idx):
        key = f"{os.path.abspath(path)}::{chunk_idx}"
        return hashlib.sha256(key.encode()).hexdigest()[:32]

    def _index_chunks(self, chunks):
        doc_ids = [c.doc_id for c in chunks]
        existing = self._collection.get(ids=doc_ids)['ids']
        new_chunks = [c for c in chunks if c.doc_id not in set(existing)]

        if not new_chunks:
            return

        texts = [c.content for c in new_chunks]
        embeddings = list(self._embed_fn.embed(texts))

        self._collection.add(
            ids=[c.doc_id for c in new_chunks],
            embeddings=embeddings,
            documents=texts,
            metadatas=[{
                "source_path": c.source_path,
                "rel_path": os.path.relpath(c.source_path, os.getcwd()),
                "chunk_index": c.chunk_index,
                "total_chunks": c.total_chunks,
                "mtime": c.file_mtime,
                "chars": c.token_count,
            } for c in new_chunks],
        )

        # Also add to BM25 index
        if self._bm25:
            for c in new_chunks:
                self._bm25.add_document(
                    doc_id=c.doc_id,
                    content=c.content,
                    source_path=c.source_path,
                    chunk_index=c.chunk_index,
                )
            self._bm25.build()

    # ── Searching ─────────────────────────────────────────

    def search(self, query, top_k=5):
        self._ensure_collection()
        if self._collection.count() == 0:
            return []

        query_embedding = list(self._embed_fn.embed([query]))[0]

        results = self._collection.query(
            query_embeddings=[query_embedding],
            n_results=min(top_k * 3, 50),
            include=["documents", "metadatas", "distances"],
        )

        out = []
        seen_files = set()
        for doc, meta, dist in zip(
            results['documents'][0],
            results['metadatas'][0],
            results['distances'][0],
        ):
            src = meta.get('source_path', '')
            if src in seen_files:
                continue
            seen_files.add(src)
            out.append(SearchResult(
                content=doc[:1500],
                source_path=src,
                score=round(dist, 4),
                chunk_index=meta.get('chunk_index', 0),
                metadata=meta,
            ))
            if len(out) >= top_k:
                break

        return out

    def search_keyword(self, query, top_k=5):
        """BM25 keyword search — excels at exact term/article matching."""
        self._ensure_collection()
        if not self._bm25 or self._collection.count() == 0:
            return []

        ranked = self._bm25.search(query, top_k=top_k * 3)
        out = []
        seen_files = set()
        for doc_id, bm25_score in ranked:
            doc_info = self._bm25.get_doc(doc_id)
            if not doc_info:
                continue
            content, source_path, chunk_index, metadata = doc_info
            if source_path in seen_files:
                continue
            seen_files.add(source_path)
            out.append(SearchResult(
                content=content[:1500],
                source_path=source_path,
                score=round(bm25_score, 4),
                chunk_index=chunk_index,
                metadata=metadata,
            ))
            if len(out) >= top_k:
                break
        return out

    def search_hybrid(self, query, top_k=5):
        """Hybrid search: vector semantic + BM25 keyword, fused with RRF."""
        self._ensure_collection()
        if self._collection.count() == 0:
            return []

        # Vector search
        vector_results = self.search(query, top_k=top_k * 2)
        vector_ranked = [(r.source_path, r.score) for r in vector_results]

        # BM25 keyword search
        bm25_ranked = []
        if self._bm25:
            bm25_ranked = self._bm25.search(query, top_k=top_k * 2)

        # RRF fusion
        fused = rrf_fuse(vector_ranked, bm25_ranked, top_k=top_k * 2)

        # Build result lookup from both result sets
        result_map: dict[str, SearchResult] = {}
        for r in vector_results:
            result_map[r.source_path] = r
        for doc_id, bm25_score in (bm25_ranked or []):
            doc_info = self._bm25.get_doc(doc_id) if self._bm25 else None
            if doc_info and doc_info[1] not in result_map:
                content, source_path, chunk_index, metadata = doc_info
                result_map[source_path] = SearchResult(
                    content=content[:1500],
                    source_path=source_path,
                    score=bm25_score,
                    chunk_index=chunk_index,
                    metadata=metadata,
                )

        # Assemble fused results
        out = []
        seen_files = set()
        for path, rrf_score in fused:
            if path in seen_files or path not in result_map:
                continue
            seen_files.add(path)
            r = result_map[path]
            out.append(SearchResult(
                content=r.content,
                source_path=r.source_path,
                score=round(rrf_score, 4),
                chunk_index=r.chunk_index,
                metadata=r.metadata,
            ))
            if len(out) >= top_k:
                break
        return out

    def search_hybrid_rerank(self, query, top_k=5):
        """Hybrid search with reranker refinement.

        Pipeline: vector + BM25 → RRF fusion (top 15) → BGE-reranker cross-encoder → top_k.
        Falls back to regular search_hybrid if reranker is unavailable.
        """
        if not _reranker_available():
            # Reranker not available, fall back to regular hybrid
            return self.search_hybrid(query, top_k)

        # Step 1: Get more candidates from hybrid search (3x for reranking pool)
        pool_size = max(top_k * 3, 15)
        candidates = self.search_hybrid(query, top_k=pool_size)

        if len(candidates) <= top_k:
            return candidates

        # Step 2: Rerank candidates using cross-encoder
        documents = [c.content for c in candidates]
        reranked = _rerank_fn(query, documents, top_n=top_k)

        if not reranked:
            # Reranker failed, fall back
            return candidates[:top_k]

        # Step 3: Map reranked results back to SearchResult objects
        out = []
        for r in reranked:
            idx = r["index"]
            if idx < len(candidates):
                orig = candidates[idx]
                out.append(SearchResult(
                    content=orig.content,
                    source_path=orig.source_path,
                    score=round(r["score"], 4),
                    chunk_index=orig.chunk_index,
                    metadata={**orig.metadata, "reranked": True},
                ))
        return out

    # ── Management ────────────────────────────────────────

    def stats(self):
        self._ensure_collection()
        count = self._collection.count()
        if count == 0:
            return {"total_documents": 0, "collection": self._collection_name}

        all_meta = self._collection.get(include=["metadatas"])
        sources = set(m.get('source_path', '') for m in all_meta['metadatas'])
        return {
            "total_documents": count,
            "total_source_files": len(sources),
            "collection": self._collection_name,
            "persist_dir": self._persist_dir,
        }

    def list_documents(self, limit=100):
        self._ensure_collection()
        if self._collection.count() == 0:
            return {"documents": [], "tree": []}

        all_meta = self._collection.get(include=["metadatas"])
        from collections import Counter
        source_counts = Counter(m.get('source_path', '') for m in all_meta['metadatas'])

        docs = []
        for path_val, count in source_counts.most_common(limit):
            docs.append({
                "path": path_val,
                "rel_path": os.path.relpath(path_val, os.getcwd()),
                "chunks": count,
            })

        # Build tree structure
        tree = self._build_tree(source_counts)

        return {"documents": docs, "tree": tree}

    def _build_tree(self, source_counts):
        """Build a hierarchical tree from source file paths."""
        # Determine the docs root directory
        if not source_counts:
            return []
        first_path = next(iter(source_counts))
        # Find the 'docs' directory in the path
        parts = first_path.split(os.sep)
        docs_idx = -1
        for i, p in enumerate(parts):
            if p == 'docs':
                docs_idx = i
                break
        if docs_idx < 0:
            return []

        docs_root = os.sep.join(parts[:docs_idx + 1])

        # Build tree
        tree = []
        dir_map = {}  # dir_path -> node

        for fpath, count in sorted(source_counts.items()):
            rel = os.path.relpath(fpath, docs_root)
            rel_parts = rel.split(os.sep)

            # Navigate/create directory nodes
            current_children = tree
            current_path = docs_root

            for i, part in enumerate(rel_parts[:-1]):
                current_path = os.path.join(current_path, part)
                if current_path not in dir_map:
                    dir_node = {
                        "name": part,
                        "path": current_path,
                        "type": "dir",
                        "children": [],
                        "file_count": 0,
                        "chunk_count": 0,
                    }
                    dir_map[current_path] = dir_node
                    current_children.append(dir_node)
                dir_node = dir_map[current_path]
                dir_node["file_count"] += 1
                dir_node["chunk_count"] += count
                current_children = dir_node["children"]

            # Add file node
            file_name = rel_parts[-1]
            current_children.append({
                "name": file_name,
                "path": fpath,
                "rel_path": os.path.relpath(fpath, os.getcwd()),
                "type": "file",
                "chunks": count,
            })

        return tree

    def remove(self, path):
        self._ensure_collection()
        path = os.path.abspath(path)
        all_data = self._collection.get(include=["metadatas"])
        ids_to_remove = [
            id_ for id_, meta in zip(all_data['ids'], all_data['metadatas'])
            if meta.get('source_path') == path
        ]
        if ids_to_remove:
            self._collection.delete(ids=ids_to_remove)
        # Rebuild BM25 index after removal
        self._build_bm25_index()
        return {"removed": len(ids_to_remove), "path": path}


# ── Singleton factory ────────────────────────────────────

_kb_instance = None

def get_kb(persist_dir=None, collection_name=None):
    global _kb_instance
    if _kb_instance is None or persist_dir or collection_name:
        _kb_instance = LocalKB(
            persist_dir=persist_dir or DEFAULT_PERSIST_DIR,
            collection_name=collection_name or DEFAULT_COLLECTION,
        )
    return _kb_instance
