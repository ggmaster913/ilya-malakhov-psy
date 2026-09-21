#!/bin/bash
# Запуск сайта локально: двойной клик по этому файлу.
# Откроется браузер с сайтом; чтобы остановить — закройте окно Терминала.
cd "$(dirname "$0")"
PORT=8080
while lsof -i :$PORT >/dev/null 2>&1; do PORT=$((PORT + 1)); done
echo "Сайт запущен: http://localhost:$PORT  (Ctrl+C или закройте окно, чтобы остановить)"
(sleep 1; open "http://localhost:$PORT") &
python3 -m http.server $PORT
