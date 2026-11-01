#!/bin/bash
# Task 112: тесты второго раунда починки видео + «Текст на страницах».
#   Видео: реальный файл владельца (LA_v006.mov), битый файл → media-debug.log,
#          новые попытки каскада (mux queue / threads 1 / без фильтров),
#          unit-тесты диагностики (без «using SAR=1/1» в ответе).
#   Тексты: вкладка /admin/page-texts — API page-texts (чтение/запись/права),
#          /settings/public отдаёт свежие text_*.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PHP="$(command -v php 2>/dev/null || true)"
[ -z "$PHP" ] && [ -x "$ROOT/.ztools/php" ] && PHP="$ROOT/.ztools/php"
[ -z "$PHP" ] && [ -x "$ROOT/../.ztools/php" ] && PHP="$ROOT/../.ztools/php"
[ -n "$PHP" ] || { echo "php не найден"; exit 1; }
FF="$(command -v ffmpeg 2>/dev/null || true)"
[ -z "$FF" ] && { echo "ffmpeg не найден"; exit 1; }
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  OK  $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  FAIL $1"; }
chk()  { if [ "$2" = "1" ]; then ok "$1"; else bad "$1"; fi; }
jget(){ python3 -c "
import json,sys
try:
    d=json.loads(sys.argv[1])
    for k in sys.argv[2].split('.'):
        d=d[int(k)] if k.lstrip('-').isdigit() else d[k]
    if isinstance(d,bool): d=str(d).lower()
    print(d)
except Exception:
    print('')" "$1" "$2" 2>/dev/null; }
DBG="$ROOT/backend/storage/media-debug.log"

echo "── 1. Синтаксис и unit-тесты диагностики ──"
$PHP -l "$ROOT/backend/src/MediaOptimizer.php" > /dev/null 2>&1 && ok "php -l MediaOptimizer" || bad "php -l MediaOptimizer"
$PHP -l "$ROOT/backend/src/Controllers/PageTextsController.php" > /dev/null 2>&1 && ok "php -l PageTextsController" || bad "php -l PageTextsController"
$PHP "$ROOT/scripts/test-probe-112.php" > /tmp/t112-probe.log 2>&1
rg -q "PROBE-112 TESTS OK" /tmp/t112-probe.log && ok "pickProbeReason/trimErr/ffmpegError unit ($(rg -c 'OK' /tmp/t112-probe.log) кейсов)" || { bad "unit-тесты диагностики"; cat /tmp/t112-probe.log; }

echo "── 2. Реальный файл владельца (HEVC yuvj420p 516x516) ──"
T=$(mktemp -d)
REAL=/home/z/my-project/upload/LA_v006.mov
if [ -s "$REAL" ]; then
  cp "$REAL" "$T/real.mov"
  $PHP -r "require '$ROOT/backend/src/MediaOptimizer.php'; \$r=MediaOptimizer::optimizeVideoFile('$T/real.mov'); echo (\$r['converted']?'CONVERTED':'FAIL').'|'.\$r['note'];" > "$T/real.res" 2>&1
  rg -q "^CONVERTED" "$T/real.res" && ok "LA_v006.mov → mp4: $(cut -d'|' -f2- "$T/real.res" | head -c 70)…" || bad "реальный файл: $(cat "$T/real.res")"
  rg -q "h264" <($FF -hide_banner -i "$T/real.mp4" 2>&1 || true) && ok "результат — H.264 (играбельный)" || bad "кодек результата не h264"
else
  bad "файл владельца не найден ($REAL)"
fi

echo "── 3. Битый файл → все попытки в media-debug.log ──"
rm -f "$DBG"
printf 'это не видео, а текст' > "$T/broken.mov"
$PHP -r "require '$ROOT/backend/src/MediaOptimizer.php'; \$r=MediaOptimizer::optimizeVideoFile('$T/broken.mov'); echo \$r['converted']?'CONVERTED':\$r['note'];" > "$T/broken.res" 2>&1
rg -q "не удалось перекодировать видео" "$T/broken.res" && ok "честный отказ: $(head -c 90 "$T/broken.res")…" || bad "ответ по битому файлу: $(cat "$T/broken.res")"
[ -s "$DBG" ] && ok "media-debug.log создан" || bad "media-debug.log не создан"
rg -q "probe \(-f null\)" "$DBG" && ok "в журнале есть полная проба" || bad "в журнале нет пробы"
rg -q "Invalid data" "$DBG" && ok "в журнале видна реальная причина (Invalid data)" || bad "причина не видна в журнале"

echo "── 4. Новые попытки каскада понимаются ffmpeg ──"
$FF -y -v error -f lavfi -i "testsrc2=d=0.6:s=516x516:r=25" -f lavfi -i "sine=d=0.6" -c:v libx265 -pix_fmt yuv420p -tag:v hvc1 -c:a aac -shortest "$T/src.mov" 2>/dev/null
$FF -y -v error -nostdin -i "$T/src.mov" -map '0:v:0' -map '0:a:0?' -c:v libx264 -preset veryfast -crf 26 -vf 'pad=ceil(iw/2)*2:ceil(ih/2)*2,setsar=1,fps=30,format=yuv420p' -c:a aac -b:a 128k -max_muxing_queue_size 2048 -f mp4 "$T/q.mp4" 2>/dev/null
[ -s "$T/q.mp4" ] && ok "попытка с -max_muxing_queue_size 2048" || bad "max_muxing_queue_size"
$FF -y -v error -nostdin -i "$T/src.mov" -map '0:v:0' -map '0:a:0?' -threads 1 -an -c:v libx264 -preset ultrafast -crf 28 -pix_fmt yuv420p -f mp4 "$T/t1.mp4" 2>/dev/null
[ -s "$T/t1.mp4" ] && ok "попытка -threads 1 без фильтров" || bad "threads 1 без фильтров"

echo "── 5. Тексты страниц: API на :8021 ──"
PORT=8021; BASE="http://127.0.0.1:$PORT/api"; LOG=/tmp/t112-php.log
pkill -f "127.0.0.1:$PORT" 2>/dev/null; sleep 1
( setsid "$PHP" -S 127.0.0.1:$PORT backend/public/index.php >"$LOG" 2>&1 & )
for i in $(seq 1 30); do curl -s "$BASE/health" | grep -q ok && break; sleep 0.3; done
curl -s "$BASE/health" | grep -q ok && ok "сервер поднялся" || bad "сервер не поднялся"
CJ=/tmp/t112-cookies.txt; rm -f "$CJ"
LOGIN=$(curl -s -c "$CJ" -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d '{"email":"admin@lakomka.local","password":"Lakomka2026!"}')
[ -n "$(jget "$LOGIN" "data.token")" ] && ok "админ залогинен" || bad "логин: $LOGIN"

GET1=$(curl -s -b "$CJ" "$BASE/admin/page-texts")
[ "$(jget "$GET1" "data")" != "" ] || [ "$GET1" = '{"data":[]}' ] && ok "GET /admin/page-texts отвечает" || bad "GET page-texts: $GET1"
SAVE=$(curl -s -b "$CJ" -X POST "$BASE/admin/page-texts" -H "Content-Type: application/json" -d '{"global_footer_address":"ул. Тестовая 112, каб. 112"}')
check_saved=$(jget "$SAVE" "data.saved")
[ "$check_saved" = "1" ] && ok "POST page-texts сохранил адрес" || bad "POST page-texts: $SAVE"
PUB=$(curl -s "$BASE/settings/public")
[ "$(jget "$PUB" "data.texts.global_footer_address")" = "ул. Тестовая 112, каб. 112" ] && ok "витрина отдаёт свежий text_* (без пересборки)" || bad "texts в /settings/public: $(echo "$PUB" | head -c 120)"
NOAUTH=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/admin/page-texts" -H "Content-Type: application/json" -d '{"x":"y"}')
[ "$NOAUTH" = "401" ] || [ "$NOAUTH" = "403" ] && ok "без авторизации запись запрещена ($NOAUTH)" || bad "анонимный POST: $NOAUTH"
BADKEY=$(curl -s -o /dev/null -w '%{http_code}' -b "$CJ" -X POST "$BASE/admin/page-texts" -H "Content-Type: application/json" -d '{"БАД-КЛЮЧ":"x"}')
[ "$BADKEY" = "422" ] && ok "кривой ключ → 422" || bad "кривой ключ: $BADKEY"

echo "── 6. Уборка ──"
$PHP -r '$pdo=new PDO("sqlite:backend/storage/database.sqlite");$pdo->prepare("DELETE FROM settings WHERE key=?")->execute(["text_global_footer_address"]);echo "cleaned\n";' > /dev/null 2>&1 && ok "тестовый адрес удалён из БД" || bad "чистка БД"
pkill -f "127.0.0.1:$PORT" 2>/dev/null
rm -rf "$T" /tmp/t112-probe.log /tmp/t112-php.log /tmp/t112-cookies.txt "$DBG"
ok "временные файлы и журнал удалены"

echo "── 7. Регресс Task 110 (каскад видео) ──"
bash "$ROOT/scripts/task110-tests.sh" > /tmp/t112-regress.log 2>&1
TAIL=$(tail -1 /tmp/t112-regress.log)
rg -q "FAIL=0" /tmp/t112-regress.log && ok "task110-tests: $TAIL" || { bad "регресс 110: $TAIL"; tail -20 /tmp/t112-regress.log; }

echo "════════ ИТОГ: PASS=$PASS FAIL=$FAIL ════════"
[ "$FAIL" = "0" ]
