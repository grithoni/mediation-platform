#!/usr/bin/env bash
# 珠江国际商事调解院 · AI 智能咨询后端启动脚本
set -e
cd "$(dirname "$0")"

if [ ! -d .venv ]; then
  echo "[run] 创建虚拟环境..."
  python3 -m venv .venv
  .venv/bin/pip install -r requirements.txt -i https://mirrors.aliyun.com/pypi/simple/
fi

if [ -z "$DEEPSEEK_API_KEY" ] && [ ! -f .env ]; then
  echo "[run] 提示: 未检测到 DEEPSEEK_API_KEY，请先创建 .env（参考 .env.example）"
fi

echo "[run] 启动服务: http://localhost:3005"
exec .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 3005 --reload
