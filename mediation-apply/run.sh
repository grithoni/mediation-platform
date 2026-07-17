#!/usr/bin/env bash
# Start the Mediation Application Service
set -e

cd "$(dirname "$0")"

# Create venv if needed
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv .venv
    echo "Installing dependencies (use mirror if slow)..."
    .venv/bin/pip install -r requirements.txt -i https://mirrors.aliyun.com/pypi/simple/
fi

echo "Starting Mediation Application Service on port 3006..."
exec .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 3006 --reload