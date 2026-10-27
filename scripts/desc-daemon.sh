#!/bin/bash
# Демон-цикл генерации описаний: крутит desc-generate.mjs до пометки DONE в прогрессе.
# Генератор умеет докачивать (resume по desc-results.jsonl), перезапуски безопасны.
cd /home/z/my-project
while true; do
  if grep -q "^DONE" scripts/desc-progress.txt 2>/dev/null; then
    echo "[$(date '+%F %T')] DONE — демон завершается" >> scripts/desc-run.log
    break
  fi
  echo "[$(date '+%F %T')] запуск генератора (pid $$)" >> scripts/desc-run.log
  node scripts/desc-generate.mjs >> scripts/desc-run.log 2>&1
  echo "[$(date '+%F %T')] генератор вышел (код $?), перезапуск через 10с" >> scripts/desc-run.log
  sleep 10
done
