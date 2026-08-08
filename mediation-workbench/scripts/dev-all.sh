#!/bin/bash
# 一键启动调解工作台全部服务（Nuxt + KB + OCR）
# 用法：bash scripts/dev-all.sh
# 依赖：mediation-workbench 与 ocr-service 在同一父目录下

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKBENCH="$ROOT/mediation-workbench"
OCR="$ROOT/ocr-service"

echo "==> 启动 KB 知识库服务 (8700)..."
if curl -s -m 2 -o /dev/null http://localhost:8700/ 2>/dev/null; then
  echo "    KB 已在运行，跳过"
else
  (cd "$WORKBENCH" && nohup .venv-kb/bin/python3 server/kb/server.py 8700 > /tmp/kb-service.log 2>&1 &)
  echo "    KB 已启动 (日志: /tmp/kb-service.log)"
fi

echo "==> 启动 OCR 服务 (8701)..."
if curl -s -m 2 -o /dev/null http://localhost:8701/docs 2>/dev/null; then
  echo "    OCR 已在运行，跳过"
else
  (cd "$OCR" && nohup ./run.sh > /tmp/ocr-service.log 2>&1 &)
  echo "    OCR 已启动 (日志: /tmp/ocr-service.log)"
fi

echo "==> 启动 Nuxt 工作台 (6080)..."
if curl -s -m 2 -o /dev/null http://localhost:6080/ 2>/dev/null; then
  echo "    Nuxt 已在运行，跳过"
else
  (cd "$WORKBENCH" && nohup npm run dev > /tmp/nuxt-dev.log 2>&1 &)
  echo "    Nuxt 已启动 (日志: /tmp/nuxt-dev.log)"
fi

echo ""
echo "全部服务启动完成："
echo "  - 调解工作台: http://localhost:6080"
echo "  - KB 知识库:   http://localhost:8700"
echo "  - OCR 服务:    http://localhost:8701"