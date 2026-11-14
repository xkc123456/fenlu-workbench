#!/usr/bin/env bash
cd "$(dirname "$0")" || exit 1
PORT=8787
echo "分录工坊：http://127.0.0.1:$PORT"
(sleep 1; command -v open >/dev/null && open "http://127.0.0.1:$PORT/index.html" || (command -v xdg-open >/dev/null && xdg-open "http://127.0.0.1:$PORT/index.html")) &
python3 -m http.server "$PORT"
