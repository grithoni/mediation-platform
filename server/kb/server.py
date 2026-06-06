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

from engine import LocalKB

kb = None

def get_kb():
    global kb
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

sys.path.insert(0, os.path.join(PROJECT_ROOT, 'server', 'kb'))

# ============================================================
# Monkey-patch FastAPI/uvicorn only if not already imported
# (allows the server to work with or without explicit pip install)
# ============================================================
try:
    from fastapi import FastAPI, UploadFile, File
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel
except ImportError:
    print("Installing fastapi/uvicorn...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "fastapi", "uvicorn", "python-multipart"])
    from fastapi import FastAPI, UploadFile, File
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel

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

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/stats")
def stats():
    kb = get_kb()
    return kb.stats()

@app.get("/list")
def list_docs(limit: int = 200):
    kb = get_kb()
    return kb.list_documents(limit)

@app.post("/search")
def search(body: SearchQuery):
    kb = get_kb()
    results = kb.search(body.query, body.top_k)
    return {"results": [{"path": r.source_path, "content": r.content, "score": r.score} for r in results]}

@app.post("/upload")
async def upload(file: UploadFile = File(...)):
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    path = os.path.join(UPLOAD_DIR, file.filename)
    with open(path, "wb") as f:
        f.write(await file.read())
    kb = get_kb()
    kb.index(UPLOAD_DIR, glob_pattern="*")
    return {"success": True, "path": path}

@app.post("/upload-key")
async def upload_key(file: UploadFile = File(...)):
    """Upload API key JSON file"""
    path = os.path.join(PROJECT_ROOT, "apikey.json")
    with open(path, "wb") as f:
        f.write(await file.read())
    return {"success": True}

if __name__ == "__main__":
    import uvicorn
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8700
    print(f"Starting KB server on port {port}...")
    get_kb()  # Load model on startup
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="warning")
