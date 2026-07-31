#!/bin/bash
# OCR microservice launcher (port 8701)
cd "$(dirname "$0")"

if [ ! -d .venv ]; then
  echo "[ocr-service] Creating venv..."
  python3 -m venv .venv
  echo "[ocr-service] Installing dependencies (aliyun mirror)..."
  ./.venv/bin/pip install -r requirements.txt -i https://mirrors.aliyun.com/pypi/simple/
fi

exec ./.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8701
