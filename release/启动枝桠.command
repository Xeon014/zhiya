#!/bin/bash
# 枝桠启动器（macOS 双击 .command / Linux 终端运行；需系统自带 python3）
cd "$(dirname "$0")"
PORT=8765
while lsof -i :$PORT >/dev/null 2>&1; do PORT=$((PORT+1)); done
echo "枝桠运行中：http://127.0.0.1:$PORT/  （数据保存在浏览器中；Ctrl+C 退出）"
(if command -v open >/dev/null 2>&1; then sleep 1; open "http://127.0.0.1:$PORT/"
 elif command -v xdg-open >/dev/null 2>&1; then sleep 1; xdg-open "http://127.0.0.1:$PORT/"; fi) &
python3 -m http.server $PORT --bind 127.0.0.1
