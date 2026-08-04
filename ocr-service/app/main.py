"""OCR microservice — text extraction + DeepSeek structured field extraction.

Standalone FastAPI service on port 8701, consumed by mediation-workbench (6080)
via server-side proxy (server/api/ocr.post.ts).

Endpoints:
  GET  /health
  POST /api/ocr   multipart field `file` → {success, method, used_ocr, text_length, fields}
"""
from __future__ import annotations

import asyncio
import os
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from .ocr import extract_fields_with_llm, extract_text

# ── .env loading (no python-dotenv dependency) ─────────────
def _load_env() -> None:
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip()
        if key and key not in os.environ:
            os.environ[key] = value

_load_env()

app = FastAPI(title="OCR Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:6080",
        "http://localhost:4321",
        "http://127.0.0.1:6080",
        "http://127.0.0.1:4321",
    ],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?$",
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "service": "ocr-service", "port": 8701}


@app.post("/api/ocr")
async def ocr(file: UploadFile = File(...)):
    """Extract text from uploaded file and pull structured fields via DeepSeek."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="缺少文件名")

    try:
        file_bytes = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"读取文件失败: {e}")

    if not file_bytes:
        raise HTTPException(status_code=400, detail="文件为空")

    # extract_text（RapidOCR / pdf2image / pdfplumber）与 extract_fields_with_llm
    # （同步 OpenAI 调用）均为 CPU/IO 密集的阻塞操作；放入线程池执行，
    # 避免阻塞事件循环导致并发请求串行化（并发 DoS）。
    text, method, used_ocr = await asyncio.to_thread(extract_text, file.filename, file_bytes)
    if not text.strip():
        return {
            "success": False,
            "error": f"未能从文件中提取到文本 (method={method})，请上传清晰的 PDF/Word/图片文件",
            "method": method,
            "used_ocr": used_ocr,
            "text_length": 0,
            "fields": {},
        }

    fields = await asyncio.to_thread(extract_fields_with_llm, text)
    if "error" in fields:
        return {
            "success": False,
            "error": fields["error"],
            "method": method,
            "used_ocr": used_ocr,
            "text_length": len(text),
            "fields": {},
        }

    return {
        "success": True,
        "method": method,
        "used_ocr": used_ocr,
        "text_length": len(text),
        "fields": fields,
    }
