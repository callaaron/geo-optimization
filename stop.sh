#!/bin/bash
# GEO 优化系统 —— 停止脚本
PIDFILE="/Users/panda/Geo-System/geo-optimization/geo-server.pid"
if [ -f "$PIDFILE" ]; then
  PID=$(cat "$PIDFILE")
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID"
    echo "已停止服务 (PID=$PID)"
  else
    echo "PID $PID 已不存在，服务可能已停止"
  fi
  rm -f "$PIDFILE"
else
  echo "未找到 PID 文件，尝试按端口查找并停止..."
  pkill -f "server/index.mjs" && echo "已停止" || echo "未发现运行中的服务"
fi
