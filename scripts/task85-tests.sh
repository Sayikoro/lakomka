#!/usr/bin/env bash
# Тесты Task 85: при импорте файлов, которых нет в ZIP, сервер сначала ищет их
# в /uploads (видео — в /uploads/video) и привязывает без копии; «не найдено» —
# только если файла нет нигде. Уровень 1 — sandbox (applyImport напрямую),
# уровень 2 — e2e через HTTP (чанковая загрузка ZIP → import-zip).
set -u
cd /home/z/my-project
PHP=/home/z/my-project/.ztools/php
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  OK  $1"; }
bad()  { FAIL=$((FAIL+1)); echo "FAIL  $1"; }
check(){ if [ "$1" = "$2" ]; then ok "$3"; else bad "$3 (ожидалось '$2', получено '$1')"; fi; }

echo "── Уровень 1: sandbox (БД-копия + свои uploads, живой сайт не трогаем) ──"
"$PHP" scripts/task85-sandbox-test.php
S1=$?
check "$S1" "0" "sandbox-тест applyImport ($([ $S1 = 0 ] && echo 'все проверки внутри скрипта' || echo 'см. FAIL выше'))"

echo
echo "── Уровень 2: e2e через HTTP (лёгкий ZIP → import-zip) ──"
pkill -f "php.*127.0.0.1:8010" 2>/dev/null; sleep 1
( setsid "$PHP" -S 127.0.0.1:8010 -d post_max_size=256M -d upload_max_filesize=256M backend/public/index.php >/tmp/t85-php.log 2>&1 & ) || true
UP=0
for i in $(seq 1 30); do
  curl -s -o /dev/null -m 2 http://127.0.0.1:8010/api/health && UP=1 && break
  sleep 0.5
done
check "$UP" "1" "PHP-бэкенд поднялся на :8010"

TOKEN=$("$PHP" -r 'require_once "backend/src/Auth.php"; echo Auth::issueToken(2, "admin@lakomka.local", "super_admin");')
AUTH="Authorization: Bearer $TOKEN"

# медиа на сервере (папки пользователя — создаём, если их ещё нет)
mkdir -p public/uploads/video public/uploads/media
ffmpeg -y -loglevel error -f lavfi -i testsrc2=duration=0.5:size=128x96:rate=10 \
       -c:v libx264 -preset ultrafast -pix_fmt yuv420p "public/uploads/video/t85-e2e.mp4"
ffmpeg -y -loglevel error -f lavfi -i testsrc2=duration=0.1:size=64x64:rate=10 -frames:v 1 -q:v 4 \
       "public/uploads/media/t85-e2e.jpg"
[ -s "public/uploads/video/t85-e2e.mp4" ] && [ -s "public/uploads/media/t85-e2e.jpg" ] \
  && ok "тестовые медиа созданы в video/ и media/" || bad "ffmpeg/GD не создали медиа"

# лёгкий ZIP: только CSV
TMPZ=$(mktemp -d)
"$PHP" -r '$z=new ZipArchive(); $z->open($argv[1], ZipArchive::CREATE|ZipArchive::OVERWRITE);
$csv="\xEF\xBB\xBFНАЗВАНИЕ;ТИП;КАРТИНКИ;ВИДЕО\nТест 85 e2e;simple;t85-e2e.jpg;t85-e2e.mp4\n";
$z->addFromString("__data.csv", $csv); $z->close();' "$TMPZ/t85.zip"
[ -s "$TMPZ/t85.zip" ] && ok "лёгкий ZIP собран (только CSV)" || bad "ZIP не собрался"

B64=$(base64 -w0 "$TMPZ/t85.zip")
UID85="t85-$(date +%s)"
UPL=$(curl -s -X POST http://127.0.0.1:8010/api/admin/upload/chunk -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"upload_id\":\"$UID85\",\"chunk_index\":0,\"total_chunks\":1,\"filename\":\"t85.zip\",\"chunk_base64\":\"$B64\"}")
DONE85=$("$PHP" -r '$d=json_decode($argv[1],true); echo ($d["data"]["done"]??false) ? $d["data"]["file_name"] : "";' "$UPL")
[ -n "$DONE85" ] && ok "ZIP залит чанком ($DONE85)" || { bad "чанк-загрузка: $UPL"; exit 1; }

RES=$(curl -s -m 600 -X POST http://127.0.0.1:8010/api/admin/products/import-zip -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"file_path\":\"$DONE85\"}")
echo "$RES" | head -c 500; echo
CR=$("$PHP" -r '$d=json_decode($argv[1],true); echo $d["data"]["created"]??"";' "$RES")
IA=$("$PHP" -r '$d=json_decode($argv[1],true); echo $d["data"]["images_attached"]??"";' "$RES")
VA=$("$PHP" -r '$d=json_decode($argv[1],true); echo $d["data"]["videos_attached"]??"";' "$RES")
IM=$("$PHP" -r '$d=json_decode($argv[1],true); echo count($d["data"]["images_missing"]??["-1"]);' "$RES")
VM=$("$PHP" -r '$d=json_decode($argv[1],true); echo count($d["data"]["videos_missing"]??["-1"]);' "$RES")
check "$CR" "1" "товар создан"
check "$IA" "1" "картинка найдена на сервере (media/)"
check "$VA" "1" "видео найдено на сервере (video/)"
check "$IM" "0" "картинок missing: 0"
check "$VM" "0" "видео missing: 0"

NEWID=$("$PHP" -r '$pdo=new PDO("sqlite:backend/storage/database.sqlite"); $s=$pdo->prepare("SELECT id FROM products WHERE name=?"); $s->execute(["Тест 85 e2e"]); echo $s->fetchColumn();')
NEWSLUG=$("$PHP" -r '$pdo=new PDO("sqlite:backend/storage/database.sqlite"); $s=$pdo->prepare("SELECT slug FROM products WHERE id=?"); $s->execute([$argv[1]]); echo $s->fetchColumn();' "$NEWID")
DBURLS=$("$PHP" -r '$pdo=new PDO("sqlite:backend/storage/database.sqlite"); $s=$pdo->prepare("SELECT url FROM product_images WHERE product_id=? ORDER BY sort_order"); $s->execute([$argv[1]]); echo implode("|", $s->fetchAll(PDO::FETCH_COLUMN));' "$NEWID")
check "$DBURLS" "/uploads/video/t85-e2e.mp4|/uploads/media/t85-e2e.jpg" "в БД — существующие URL с сервера (порядок: видео, картинка)"
LEFTF=$(ls "public/uploads/products/$NEWSLUG" 2>/dev/null | wc -l)
check "$LEFTF" "0" "папка товара пуста — копий нет"
[ -f "public/uploads/video/t85-e2e.mp4" ] && ok "видео в video/ на месте (один экземпляр)" || bad "видео пропало из video/"

echo "── Уборка e2e ──"
curl -s -X DELETE "http://127.0.0.1:8010/api/admin/products/$NEWID" -H "$AUTH" > /dev/null
LEFTDB=$("$PHP" -r '$pdo=new PDO("sqlite:backend/storage/database.sqlite"); echo $pdo->query("SELECT COUNT(*) FROM product_images WHERE url LIKE \"%t85-e2e%\"")->fetchColumn();')
check "$LEFTDB" "0" "тестовых привязок в БД не осталось"
rm -rf "public/uploads/products/$NEWSLUG" public/uploads/video/t85-e2e.mp4 public/uploads/media/t85-e2e.jpg "$TMPZ"
LEFTF2=$(find public/uploads -name "*t85-e2e*" 2>/dev/null | wc -l)
check "$LEFTF2" "0" "тестовых файлов не осталось"
# живой архив пересобирается без тестового товара (import добавлял его)
SYNC=$(curl -s -m 600 -X POST http://127.0.0.1:8010/api/admin/products/export-zip -H "$AUTH")
ARC_OK=$("$PHP" -r '$d=json_decode($argv[1],true); echo isset($d["data"]["size"]) ? "ok" : substr(json_encode($d),0,120);' "$SYNC")
[ "$ARC_OK" = "ok" ] && ok "живой архив пересинхронизирован (без тестового товара)" || bad "архив: $ARC_OK"

pkill -f "php.*127.0.0.1:8010" 2>/dev/null || true
echo
echo "ИТОГО: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
