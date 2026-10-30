#!/usr/bin/env bash
# Тесты Task 84: ручное «Сжать» — POST /api/admin/files/compress
# mov/m4v → mp4 (remux/перекодирование) + mp4 → перекодирование,
# обновление привязок product_images / products.video_url.
set -u
# корень репо — по положению самого скрипта (scripts/..), не по старому абсолютному пути
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
PHP="$(command -v php || true)"
[ -z "$PHP" ] && [ -x "$ROOT/.ztools/php" ] && PHP="$ROOT/.ztools/php"
[ -z "$PHP" ] && [ -x "$ROOT/../.ztools/php" ] && PHP="$ROOT/../.ztools/php"
[ -n "$PHP" ] || { echo "php не найден"; exit 1; }
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  OK  $1"; }
bad()  { FAIL=$((FAIL+1)); echo "FAIL  $1"; }
check(){ if [ "$1" = "$2" ]; then ok "$3"; else bad "$3 (ожидалось '$2', получено '$1')"; fi; }

echo "── 1. Подготовка ──"
pkill -f "php.*127.0.0.1:8010" 2>/dev/null; sleep 1
( setsid "$PHP" -S 127.0.0.1:8010 backend/public/index.php >/tmp/t84-php.log 2>&1 & ) || true
UP=0
for i in $(seq 1 30); do
  curl -s -o /dev/null -m 2 http://127.0.0.1:8010/api/health && UP=1 && break
  sleep 0.5
done
check "$UP" "1" "PHP-бэкенд поднялся на :8010"

TOKEN=$("$PHP" -r 'require_once "backend/src/Auth.php"; echo Auth::issueToken(2, "admin@lakomka.local", "super_admin");')
[ -n "$TOKEN" ] && ok "токен выдан" || bad "токен пустой"
AUTH="Authorization: Bearer $TOKEN"

mkdir -p public/uploads/media-test
ffmpeg -y -loglevel error -f lavfi -i testsrc2=duration=12:size=1280x720:rate=24 \
       -f lavfi -i sine=frequency=440:duration=12 \
       -c:v libx264 -preset ultrafast -crf 18 -pix_fmt yuv420p -c:a aac -b:a 96k \
       "public/uploads/media-test/тест клип.mov"
[ -s "public/uploads/media-test/тест клип.mov" ] && ok "тестовый MOV создан ($(du -h 'public/uploads/media-test/тест клип.mov' | cut -f1))" || bad "MOV не создан"

PROD=$(curl -s -X POST http://127.0.0.1:8010/api/admin/products -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name":"Тест 84 сжатие","type":"simple"}')
PID=$("$PHP" -r '$d=json_decode($argv[1],true); echo $d["data"]["id"]??"";' "$PROD")
[ -n "$PID" ] && ok "тестовый товар id=$PID" || { bad "товар не создан: $PROD"; exit 1; }

# Привязка видео напрямую в БД (attach сам бы его сжал — нам нужен несжатый mov)
"$PHP" -r '$pdo=new PDO("sqlite:backend/storage/database.sqlite"); $pdo->prepare("INSERT INTO product_images (product_id, url, alt, media_type, sort_order) VALUES (?, ?, NULL, \"video\", 0)")->execute([$argv[1], "/uploads/media-test/тест клип.mov"]);' "$PID"
"$PHP" -r '$pdo=new PDO("sqlite:backend/storage/database.sqlite"); $pdo->prepare("UPDATE products SET video_url = ? WHERE id = ?")->execute(["/uploads/media-test/тест клип.mov", $argv[1]]);' "$PID"
ok "видео привязано к товару (product_images + video_url)"

MOV_URL="/uploads/media-test/тест клип.mov"

echo "── 2. Сжатие mov → mp4 (remux) ──"
RES=$(curl -s -X POST http://127.0.0.1:8010/api/admin/files/compress -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"url\":\"$MOV_URL\"}")
echo "$RES" | head -c 400; echo
NEWURL=$("$PHP" -r '$d=json_decode($argv[1],true); echo $d["data"]["url"]??"";' "$RES")
REFS=$("$PHP" -r '$d=json_decode($argv[1],true); echo $d["data"]["refs_updated"]??"";' "$RES")
BEFORE=$("$PHP" -r '$d=json_decode($argv[1],true); echo $d["data"]["before"]??0;' "$RES")
AFTER=$("$PHP" -r '$d=json_decode($argv[1],true); echo $d["data"]["after"]??0;' "$RES")
check "$REFS" "2" "привязки переписаны (product_images + video_url = 2)"
[ "${BEFORE:-0}" -ge "${AFTER:-999999}" ] && ok "размер: $BEFORE → $AFTER (не вырос)" || bad "mp4 тяжелее оригинала: $BEFORE → $AFTER"
[ -f "public${NEWURL}" ] && ok "mp4 на диске: public${NEWURL}" || bad "mp4 нет на диске: $NEWURL"
[ ! -f "public${MOV_URL}" ] && ok "исходный mov удалён" || bad "mov остался"
"$PHP" -r '$pdo=new PDO("sqlite:backend/storage/database.sqlite"); $s=$pdo->prepare("SELECT url FROM product_images WHERE product_id=?"); $s->execute([$argv[1]]); echo $s->fetchColumn();' "$PID" > /tmp/t84-dburl
grep -q '\.mp4$' /tmp/t84-dburl && ok "product_images.url теперь mp4: $(cat /tmp/t84-dburl)" || bad "в БД не mp4: $(cat /tmp/t84-dburl)"
ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of csv=p=0 "public${NEWURL}" > /tmp/t84-codec
check "$(cat /tmp/t84-codec)" "h264" "кодек видео в mp4 — h264"

echo "── 3. Повторное «Сжать» на mp4 ──"
RES2=$(curl -s -m 120 -X POST http://127.0.0.1:8010/api/admin/files/compress -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"url\":\"$NEWURL\"}")
echo "$RES2" | head -c 300; echo
"$PHP" -r '$d=json_decode($argv[1],true); if (isset($d["data"]["ok"])) echo "COMPRESSED"; elseif (isset($d["error"])) echo "REFUSED: ".$d["error"]; else echo "GARBAGE";' "$RES2" > /tmp/t84-second
grep -qE "^COMPRESSED|^REFUSED" /tmp/t84-second && ok "повторное сжатие ответило честно: $(cat /tmp/t84-second)" || bad "странный ответ: $(cat /tmp/t84-second)"

echo "── 4. Отказы и защита ──"
C1=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://127.0.0.1:8010/api/admin/files/compress -H "$AUTH" -H "Content-Type: application/json" -d '{"url":"/uploads/../backend/config.php"}')
check "$C1" "422" "traversal отвергнут"
C2=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://127.0.0.1:8010/api/admin/files/compress -H "$AUTH" -H "Content-Type: application/json" -d '{"url":"/uploads/hero/test-slide-2.jpg"}')
check "$C2" "422" "jpg не сжимается видео-кодеком"
C3=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://127.0.0.1:8010/api/admin/files/compress -H "$AUTH" -H "Content-Type: application/json" -d '{"url":"/uploads/media-test/missing.mov"}')
check "$C3" "404" "несуществующий файл — 404"
C4=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://127.0.0.1:8010/api/admin/files/compress -H "Content-Type: application/json" -d "{\"url\":\"$MOV_URL\"}")
check "$C4" "401" "без токена — 401"

echo "── 5. Уборка ──"
curl -s -X DELETE "http://127.0.0.1:8010/api/admin/products/$PID" -H "$AUTH" > /dev/null
LEFT=$("$PHP" -r '$pdo=new PDO("sqlite:backend/storage/database.sqlite"); echo $pdo->query("SELECT COUNT(*) FROM product_images WHERE url LIKE \"%media-test%\"")->fetchColumn();')
check "$LEFT" "0" "тестовых привязок не осталось"
rm -rf public/uploads/media-test
LEFTF=$(find public/uploads -name "*тест клип*" 2>/dev/null | wc -l)
check "$LEFTF" "0" "тестовых файлов не осталось"

echo
echo "ИТОГО: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
