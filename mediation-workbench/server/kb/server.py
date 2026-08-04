"""Knowledge Base Server - FastAPI wrapper for local_kb engine"""
import sys, os, re, json

# Paths relative to project root
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CHROMA_DIR = os.path.join(PROJECT_ROOT, '.data', 'kb', 'chroma_data')
CACHE_DIR = os.path.join(PROJECT_ROOT, '.data', 'kb', 'fastembed_cache')
DOCS_DIR = os.path.join(PROJECT_ROOT, '.data', 'kb', 'docs')
UPLOAD_DIR = os.path.join(PROJECT_ROOT, '.data', 'kb', 'uploads')

# KB-managed roots: any file read/write/delete must stay inside these.
# /delete only operates on these directories (docs = built-in docs, uploads = user uploads).
KB_MANAGED_ROOTS = tuple(os.path.realpath(p) for p in (DOCS_DIR, UPLOAD_DIR))

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
# Path-safety helpers (defense in depth, unit self-checked)
# ============================================================

def _safe_filename(name: str) -> str:
    """Sanitize an uploaded filename to a plain basename with safe characters.

    - Strips any directory components (both / and \\ separators).
    - Rejects/neutralizes control chars, separators and empty names.
    - Returns the safe basename or raises ValueError.
    """
    if not name:
        raise ValueError("文件名不能为空")
    # Normalize Windows separators, then take the basename on any platform
    base = os.path.basename(str(name).replace("\\", "/"))
    # Strip control chars, path separators and Windows drive-colon leftovers
    base = re.sub(r"[\x00-\x1f\x7f/\\]", "_", base)
    base = base.strip(" .")
    if not base or base in (".", ".."):
        raise ValueError("文件名不合法")
    if len(base) > 255:
        raise ValueError("文件名过长")
    return base


def _is_within(root: str, path: str) -> bool:
    """True if `path` resolves (symlinks included) inside `root`."""
    root = os.path.realpath(root)
    path = os.path.realpath(path)
    return path == root or path.startswith(root + os.sep)


def _has_dotdot(path: str) -> bool:
    """True if any path component is '..' (path traversal marker)."""
    return any(part == ".." for part in path.replace("\\", "/").split("/"))


def _resolve_delete_path(path) -> str | None:
    """Resolve a /delete target to an absolute path confined to a KB managed root.

    Contract note: /list returns absolute source paths, so absolute paths inside
    a KB managed root are accepted; any absolute path outside the managed roots,
    any '..' traversal, and any relative path escaping the roots is rejected.
    Returns the resolved absolute path, or None if not permitted.
    """
    if not path or not isinstance(path, str):
        return None
    path = path.strip()
    if not path:
        return None
    if "\x00" in path:
        return None
    if _has_dotdot(path):
        return None

    candidates = []
    if os.path.isabs(path):
        candidates.append(os.path.abspath(path))
    else:
        # Resolve relative paths against each managed root
        for r in KB_MANAGED_ROOTS:
            candidates.append(os.path.abspath(os.path.join(r, path)))

    for cand in candidates:
        for r in KB_MANAGED_ROOTS:
            if _is_within(r, cand):
                return cand
    return None


def run_path_self_check():
    """Unit-level self checks for the path-safety helpers.

    Returns (all_ok, [(name, ok), ...]).
    """
    checks = []
    def check(name, cond):
        checks.append((name, bool(cond)))
        return bool(cond)

    # _safe_filename
    name = _safe_filename("../../etc/passwd")       # traversal neutralized via basename
    check("safe_filename_rejects_traversal", name == "passwd" and "/" not in name and "\\" not in name)
    try:
        _safe_filename("..")
        check("safe_filename_rejects_dotdot", False)
    except ValueError:
        check("safe_filename_rejects_dotdot", True)
    try:
        _safe_filename("")
        check("safe_filename_rejects_empty", False)
    except ValueError:
        check("safe_filename_rejects_empty", True)

    name = _safe_filename("a/b\\c.txt")
    check("safe_filename_strips_separators", name == "c.txt" and "/" not in name and "\\" not in name)
    name = _safe_filename("  normal file.md  ")
    check("safe_filename_keeps_normal", name == "normal file.md")

    # _is_within (pure path logic, no fs access required)
    check("is_within_self", _is_within(DOCS_DIR, DOCS_DIR))
    inner = os.path.join(DOCS_DIR, "sub", "doc.md")
    check("is_within_child", _is_within(DOCS_DIR, inner))
    outside = os.path.join(PROJECT_ROOT, "apikey.json")
    check("is_within_outside", not _is_within(DOCS_DIR, outside))
    sibling = os.path.join(UPLOAD_DIR, "x.md")
    check("is_within_other_root", not _is_within(DOCS_DIR, sibling))
    # symlink escape — use an isolated temp dir (create symlink pointing outside)
    try:
        import tempfile, shutil
        tmp = tempfile.mkdtemp(prefix="kb_selfcheck_")
        root = os.path.join(tmp, "root")
        os.makedirs(root)
        outside = os.path.join(tmp, "outside")
        os.makedirs(outside)
        link = os.path.join(root, "escape")
        os.symlink(outside, link)
        check("is_within_symlink_escape", not _is_within(root, os.path.join(link, "pwn")))
        check("is_within_symlink_ok", _is_within(root, os.path.join(root, "a.md")))
        shutil.rmtree(tmp, ignore_errors=True)
    except (OSError, NotImplementedError):
        check("is_within_symlink_escape", True)  # platform without symlink support

    # _resolve_delete_path
    check("delete_rejects_absolute_outside", _resolve_delete_path(os.path.join(PROJECT_ROOT, "apikey.json")) is None)
    check("delete_rejects_relative_escape", _resolve_delete_path("../../.env") is None)
    check("delete_rejects_dotdot", _resolve_delete_path(os.path.join(DOCS_DIR, "..", "secret.txt")) is None)
    check("delete_rejects_empty", _resolve_delete_path("   ") is None)
    check("delete_rejects_none", _resolve_delete_path(None) is None)
    abs_in = os.path.join(DOCS_DIR, "guide.md")
    check("delete_accepts_abs_inside", _resolve_delete_path(abs_in) == os.path.abspath(abs_in))
    rel_in = "uploads/sample.txt"
    check("delete_accepts_rel_inside", _resolve_delete_path(rel_in) is not None)

    return all(ok for _, ok in checks), checks


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


def _cors_origins():
    """CORS allow-list. Configurable via KB_CORS_ORIGINS (comma separated).

    Defaults to localhost dev origins — never '*' unless explicitly set.
    """
    raw = os.environ.get("KB_CORS_ORIGINS", "").strip()
    if raw:
        return [o.strip() for o in raw.split(",") if o.strip()]
    return ["http://localhost:6080", "http://127.0.0.1:6080"]


app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_methods=["GET", "POST", "OPTIONS"],
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
    ok, report = run_path_self_check()
    return {
        "status": "ok",
        "kb_available": _DEPS_AVAILABLE,
        "self_check": "pass" if ok else "fail",
        "self_check_items": [{"name": n, "ok": o} for n, o in report],
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

    # Sanitize filename: basename + safe chars only (rejects path traversal)
    try:
        safe_name = _safe_filename(file.filename or "uploaded_file")
    except ValueError as e:
        return JSONResponse(status_code=400, content={
            "success": False, "error": f"非法文件名：{e}"})

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    target = os.path.abspath(os.path.join(UPLOAD_DIR, safe_name))
    # Defense in depth: final path must stay inside the KB uploads root
    if not _is_within(UPLOAD_DIR, target):
        return JSONResponse(status_code=400, content={
            "success": False, "error": "非法文件名：路径越界"})

    with open(target, "wb") as f:
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
    return {"success": True, "path": target, "index": result}

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
    """Upload API key JSON file.

    SECURITY: disabled. Previously this wrote an arbitrary file to the project
    root (apikey.json), which is a file-write primitive with no containment.
    No current caller uses this endpoint. If key management is ever needed,
    use environment variables or a dedicated secret store instead.
    """
    return JSONResponse(
        status_code=403,
        content={
            "success": False,
            "error": "接口已禁用：不允许通过 /upload-key 向项目根目录写入文件。",
            "detail": "请改用环境变量或专用密钥管理方案，例如 NUXT_OPENAI_API_KEY / JWT_SECRET。",
        },
    )

class DeleteRequest(BaseModel):
    paths: list[str]

@app.post("/delete")
def delete_documents(body: DeleteRequest):
    """Delete documents from the knowledge base by file paths.

    Only files inside the KB managed directories (.data/kb/docs, .data/kb/uploads)
    may be deleted. Absolute paths outside the managed roots, '..' traversal and
    relative paths escaping the roots are rejected.
    """
    k = get_kb()
    if k is None:
        return _deps_error_response("文档删除")
    removed = 0
    errors = []
    rejected = 0
    for path in body.paths:
        resolved = _resolve_delete_path(path)
        if resolved is None:
            rejected += 1
            errors.append({"path": path, "error": "路径不允许：仅允许删除 KB 管理目录（.data/kb/docs、.data/kb/uploads）下的文件，拒绝绝对路径越界、.. 路径与目录外路径。"})
            continue
        try:
            result = k.remove(resolved)
            removed += result.get("removed", 0)
            # Also delete the physical file if it exists (resolved is confined)
            if os.path.isfile(resolved):
                os.remove(resolved)
        except Exception as e:
            errors.append({"path": path, "error": str(e)})

    if rejected and not removed and not (len(errors) - rejected):
        # Everything was rejected — report 400 so callers surface a real error
        return JSONResponse(status_code=400, content={
            "success": False, "removed_chunks": 0, "errors": errors})
    return {"success": True, "removed_chunks": removed, "errors": errors}

if __name__ == "__main__":
    import uvicorn

    if "--self-check" in sys.argv:
        ok, report = run_path_self_check()
        for name, passed in report:
            print(f"[KB] self-check {'PASS' if passed else 'FAIL'}: {name}")
        print(f"[KB] self-check overall: {'PASS' if ok else 'FAIL'}")
        sys.exit(0 if ok else 1)

    # Binding: default to loopback only. Override with KB_HOST / KB_PORT env vars.
    # Priority for port: KB_PORT env > argv[1] (npm run kb passes 8700) > 8700.
    host = os.environ.get("KB_HOST", "127.0.0.1")
    port_env = os.environ.get("KB_PORT", "").strip()
    if port_env.isdigit():
        port = int(port_env)
    else:
        port = int(sys.argv[1]) if len(sys.argv) > 1 else 8700

    ok, report = run_path_self_check()
    if not ok:
        print("[KB] ❌ 路径安全检查失败，拒绝启动。请修复后重试。")
        for name, passed in report:
            print(f"[KB] self-check {'PASS' if passed else 'FAIL'}: {name}")
        sys.exit(1)

    print(f"[KB] Starting KB server on {host}:{port}...")
    if _DEPS_AVAILABLE:
        get_kb()  # Load model on startup
    else:
        print("[KB] Running in DISABLED mode (deps missing). /health will report status.")
    uvicorn.run(app, host=host, port=port, log_level="warning")
