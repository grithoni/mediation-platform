"""Local knowledge base engine — ChromaDB + FastEmbed (BAAI/bge-small-zh-v1.5)"""
from __future__ import annotations
import os
import hashlib
import time
from dataclasses import dataclass, field
from pathlib import Path

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
            "Install with: pip install chromadb fastembed"
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
            return {"documents": []}

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
        return {"documents": docs}

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
