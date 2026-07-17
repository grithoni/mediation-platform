#!/usr/bin/env bash
# Start the Case MCP Server
set -e

cd "$(dirname "$0")"

# Load .env
if [ -f .env ]; then
    set -a
    source .env
    set +a
fi

# Create venv if needed
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv .venv
    echo "Installing dependencies (use mirror if slow)..."
    .venv/bin/pip install -r requirements.txt -i https://mirrors.aliyun.com/pypi/simple/
fi

if [ -z "${CASE_MCP_TRANSPORT+x}" ]; then
    export CASE_MCP_TRANSPORT=streamable-http
    echo "Using default CASE_MCP_TRANSPORT=streamable-http for standalone service."
fi

echo "Starting Case MCP Server..."
echo "  CASE_DB_URL = $CASE_DB_URL"
echo "  CASE_DB_TABLE = $CASE_DB_TABLE"
echo "  CASE_MCP_TRANSPORT = $CASE_MCP_TRANSPORT"
echo "  CASE_MCP_HOST = ${CASE_MCP_HOST:-127.0.0.1}"
echo "  CASE_MCP_PORT = ${CASE_MCP_PORT:-8000}"
exec .venv/bin/python server.py
