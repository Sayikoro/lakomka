#!/bin/bash
# Ретрай-демон для 31 оставшегося описания.
# Каждые 30 минут пробует LIMIT=1; как только API оживает (429 пропал) —
# прогоняет весь остаток batch и завершается.
cd /home/z/my-project

LOG=/home/z/my-project/scripts/desc-retry.log
say() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }

for i in $(seq 1 48); do  # максимум 24 часа
  # Если всё готово — выходим
  LEFT=$(node -e '
    const fs=require("fs");
    const batch=JSON.parse(fs.readFileSync("scripts/desc-batch.json","utf8"));
    const done=new Set();
    for(const l of fs.readFileSync("scripts/desc-results.jsonl","utf8").split("\n")){
      if(l.trim()){try{done.add(JSON.parse(l).id)}catch{}}
    }
    console.log(batch.filter(g=>!done.has(g.id)).length);
  ')
  if [ "$LEFT" = "0" ]; then
    say "ВСЁ ГОТОВО — описания сгенерированы, демон останавливается"
    .ztools/php scripts/desc-import.php >> "$LOG" 2>&1
    exit 0
  fi

  say "попытка $i: осталось $LEFT, пробую 1 товар"
  OUT=$(LIMIT=1 timeout 400 node scripts/desc-generate.mjs 2>&1 | tail -2)
  say "$OUT" | tr '\n' ' '; say ""

  if echo "$OUT" | grep -q "успешно 1"; then
    say "API ожил — запускаю полный прогон остатка"
    for j in $(seq 1 24); do
      OUT2=$(timeout 3600 node scripts/desc-generate.mjs 2>&1 | tail -2)
      say "полный прогон $j: $OUT2" | tr '\n' ' '; say ""
      if echo "$OUT2" | grep -q "с ошибками 0"; then break; fi
      sleep 120
    done
    .ztools/php scripts/desc-import.php >> "$LOG" 2>&1
    say "ИМПОРТ ЗАВЕРШЁН"
    exit 0
  fi
  sleep 1800  # 30 минут
done
say "24 часа истекли — выхожу"
