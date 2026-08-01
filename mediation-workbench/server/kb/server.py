"""Knowledge Base Server - FastAPI wrapper for local_kb engine"""
import sys, os, json

# Paths relative to project root
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CHROMA_DIR = os.path.join(PROJECT_ROOT, '.data', 'kb', 'chroma_data')
CACHE_DIR = os.path.join(PROJECT_ROOT, '.data', 'kb', 'fastembed_cache')
DOCS_DIR = os.path.join(PROJECT_ROOT, '.data', 'kb', 'docs')
UPLOAD_DIR = os.path.join(PROJECT_ROOT, '.data', 'kb', 'uploads')

# Set cache path before importing fastembed
os.environ["FASTEMBED_CACHE_PATH"] = CACHE_DIR

sys.path.insert(0, os.path.join(PROJECT_ROOT, 'server', 'kb'))

# ── Check if KB deps are available ───────────────────────
_DEPS_AVAILABLE = False
_DEPS_ERROR = ""

try:
    import chromadb  # noqa: F401
    from fastembed import TextEmbedding  # noqa: F401
    _DEPS_AVAILABLE = True
except ImportError as e:
    _DEPS_ERROR = str(e)
    print(f"[KB] ⚠️  Python deps missing: {e}")
    print("[KB]    Knowledge base will be DISABLED.")
    print("[KB]    Install with: pip install -r requirements.txt")
    print("[KB]    (slow download? try: pip install -r requirements.txt -i https://mirrors.aliyun.com/pypi/simple/)")

from engine import LocalKB

kb = None

def get_kb():
    global kb
    if not _DEPS_AVAILABLE:
        return None
    if kb is None:
        kb = LocalKB(persist_dir=CHROMA_DIR)
        # Ensure index exists
        if os.path.isdir(DOCS_DIR) and len(os.listdir(DOCS_DIR)) > 0:
            try:
                stats = kb.stats()
                if stats["total_documents"] == 0:
                    kb.index(DOCS_DIR, glob_pattern="*.md")
            except:
                pass
    return kb

# ============================================================
# FastAPI app
# ============================================================
try:
    from fastapi import FastAPI, UploadFile, File, Form
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel
except ImportError:
    print("Installing fastapi/uvicorn...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "fastapi", "uvicorn", "python-multipart"])
    from fastapi import FastAPI, UploadFile, File, Form
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel

from fastapi.responses import JSONResponse

app = FastAPI(title="Mediation KB Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class SearchQuery(BaseModel):
    query: str
    top_k: int = 5
    mode: str = "hybrid"  # "hybrid" | "vector" | "keyword" | "rerank"

def _deps_error_response(action: str = "此操作"):
    """Return a friendly JSON error when KB deps are missing."""
    return JSONResponse(
        status_code=503,
        content={
            "success": False,
            "error": f"知识库 Python 依赖未安装，{action}不可用。",
            "detail": _DEPS_ERROR,
            "fix": "pip install -r requirements.txt",
            "fix_mirror": "pip install -r requirements.txt -i https://mirrors.aliyun.com/pypi/simple/",
        },
    )

@app.get("/health")
def health():
    return {
        "status": "ok",
        "kb_available": _DEPS_AVAILABLE,
        **({"deps_error": _DEPS_ERROR} if not _DEPS_AVAILABLE else {}),
    }

@app.get("/stats")
def stats():
    k = get_kb()
    if k is None:
        return _deps_error_response("知识库统计")
    return k.stats()

@app.get("/list")
def list_docs(limit: int = 200):
    k = get_kb()
    if k is None:
        return _deps_error_response("文档列表")
    return k.list_documents(limit)

@app.post("/search")
def search(body: SearchQuery):
    k = get_kb()
    if k is None:
        return _deps_error_response("知识库搜索")

    mode = body.mode
    if mode == "keyword":
        results = k.search_keyword(body.query, body.top_k)
    elif mode == "vector":
        results = k.search(body.query, body.top_k)
    elif mode == "rerank":
        results = k.search_hybrid_rerank(body.query, body.top_k)
    else:  # "hybrid" (default)
        results = k.search_hybrid(body.query, body.top_k)

    return {
        "results": [{"path": r.source_path, "content": r.content, "score": r.score} for r in results],
        "mode": mode,
    }


@app.get("/rerank-status")
def rerank_status():
    """Check if reranker model is available."""
    try:
        from reranker import is_available
        available = is_available()
    except ImportError:
        available = False
    return {"available": available}

@app.post("/upload")
async def upload(file: UploadFile = File(...),
                 chunk_size: int = Form(0),
                 overlap: int = Form(-1),
                 separator: str = Form(""),
                 clean_rules: str = Form("")):
    """Upload a document. Optional Dify-style chunking config:
      - chunk_size: max chars per chunk (0 = engine default 2000)
      - overlap: overlap chars (-1 = engine default 200)
      - separator: text separator for pre-splitting ('' = whole-text)
      - clean_rules: comma-separated list, e.g. "clean_whitespace,remove_urls,remove_emails"
    """
    k = get_kb()
    if k is None:
        return _deps_error_response("文档上传")
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    path = os.path.join(UPLOAD_DIR, file.filename or "uploaded_file")
    with open(path, "wb") as f:
        f.write(await file.read())

    rules = [r.strip() for r in clean_rules.split(",") if r.strip()]
    kwargs = {}
    if chunk_size and chunk_size > 0:
        kwargs["chunk_size"] = chunk_size
    if overlap >= 0:
        kwargs["overlap"] = overlap
    if separator:
        kwargs["separator"] = separator
    if rules:
        kwargs["clean_rules"] = rules

    result = k.index(UPLOAD_DIR, glob_pattern="*", **kwargs)
    return {"success": True, "path": path, "index": result}

class PreviewRequest(BaseModel):
    text: str = ""
    chunk_size: int = 0
    overlap: int = -1
    separator: str = ""
    clean_rules: str = ""

@app.post("/preview")
def preview_document(body: PreviewRequest):
    """Preview how text would be chunked (no persistence).
    Returns {"success", "chunks": [{index, content, token_count}], ...}.
    """
    k = get_kb()
    if k is None:
        return _deps_error_response("分段预览")
    rules = [r.strip() for r in body.clean_rules.split(",") if r.strip()]
    kwargs = {}
    if body.chunk_size and body.chunk_size > 0:
        kwargs["chunk_size"] = body.chunk_size
    if body.overlap >= 0:
        kwargs["overlap"] = body.overlap
    if body.separator:
        kwargs["separator"] = body.separator
    if rules:
        kwargs["clean_rules"] = rules
    return k.preview(text=body.text, **kwargs)

@app.post("/upload-key")
async def upload_key(file: UploadFile = File(...)):
    """Upload API key JSON file"""
    path = os.path.join(PROJECT_ROOT, "apikey.json")
    with open(path, "wb") as f:
        f.write(await file.read())
    return {"success": True}

class DeleteRequest(BaseModel):
    paths: list[str]

@app.post("/delete")
def delete_documents(body: DeleteRequest):
    """Delete documents from the knowledge base by file paths."""
    k = get_kb()
    if k is None:
        return _deps_error_response("文档删除")
    removed = 0
    errors = []
    for path in body.paths:
        try:
            result = k.remove(path)
            removed += result.get("removed", 0)
            # Also delete the physical file if it exists
            if os.path.isfile(path):
                os.remove(path)
        except Exception as e:
            errors.append({"path": path, "error": str(e)})
    return {"success": True, "removed_chunks": removed, "errors": errors}

if __name__ == "__main__":
    import uvicorn
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8700
    print(f"Starting KB server on port {port}...")
    if _DEPS_AVAILABLE:
        get_kb()  # Load model on startup
    else:
        print("[KB] Running in DISABLED mode (deps missing). /health will report status.")
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="warning")
