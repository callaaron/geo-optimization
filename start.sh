#!/bin/bash
# GEO 优化系统 —— 局域网部署启动脚本
# 用法: bash start.sh   (停止: bash stop.sh)
set -e
APP_DIR="/Users/panda/Geo-System/geo-optimization/app"
ROOT_DIR="/Users/panda/Geo-System/geo-optimization"
LOG="$ROOT_DIR/geo-server.log"
PIDFILE="$ROOT_DIR/geo-server.pid"
PORT="${PORT:-8787}"

cd "$APP_DIR"
NPM="/Users/panda/.workbuddy/binaries/node/versions/22.22.2/bin/npm"

# 仅当 dist 不存在时才重新构建（加快构建/重启速度）
if [ ! -d "$APP_DIR/dist" ]; then
  echo "[start] 首次运行，构建前端 (npm run build) ..."
  "$NPM" run build
else
  echo "[start] dist 已存在，跳过构建。"
fi

echo "[start] 启动后端服务 (端口 $PORT) ..."
nohup "$NPM" run server > "$LOG" 2>&1 &
echo $! > "$PIDFILE"
sleep 2
if kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  echo "[start] 已启动, PID=$(cat "$PIDFILE")"
else
  echo "[start] 启动失败，请查看日志: $LOG"
  exit 1
fi

LAN_IP=$(ipconfig getifaddr en1 2>/dev/null || ipconfig getifaddr en0 2>/dev/null || echo "未知")
echo "----------------------------------------"
echo " 本机访问:   http://localhost:$PORT"
echo " 局域网访问: http://$LAN_IP:$PORT"
echo " 健康检查:   http://$LAN_IP:$PORT/api/ai/health"
echo " 日志文件:   $LOG"
echo "----------------------------------------"
