#!/bin/bash
# 启动后端服务（后台运行）
echo "[start] 启动后端服务 (port 3001)..."
cd /workspace/backend && node src/index.js &
BACKEND_PID=$!

# 等待后端启动
sleep 1

# 启动前端服务（前台运行，暴露 5173 端口供预览）
echo "[start] 启动前端服务 (port 5173)..."
cd /workspace/frontend && npx vite --host 0.0.0.0 --port 5173

# 清理
trap "kill $BACKEND_PID 2>/dev/null" EXIT
