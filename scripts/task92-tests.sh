#!/usr/bin/env bash
# Тесты Task 92/93/94:
#   92 — видео при привязке к товару (media/attach) ПЕРЕНОСИТСЯ из папки
#        видео в /uploads/products/<slug>/ (не копируется); если файл уже
#        привязан к другому товару — его ссылки переписываются на новое
#        место; файл в папке товара не переносится повторно; коллизия имён
#        получает суффикс «-2».
#   93 — переименование в media: неиспользуемый файл/папка — можно,
#        используемый товаром файл (и папка с таким файлом внутри) — 403;
#        в списке файлов отдаётся referenced=true/false.
#   94 — «оптимизировать» в проводнике использует существующий эндпоинт
#        /admin/files/compress: mov → mp4, привязки переписываются.
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
PHP="$(command -v php || true)"
[ -z "$PHP" ] && [ -x "$ROOT/.ztools/php" ] && PHP="$ROOT/.ztools/php"
[ -z "$PHP" ] && [ -x "$ROOT/../.ztools/php" ] && PHP="$ROOT/../.ztools/php"
[ -n "$PHP" ] || { echo "php не найден"; exit 1; }
PORT=8014
BASE="http://127.0.0.1:$PORT/api"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  OK  $1"; }
bad()  { FAIL=$((FAIL+1)); echo "FAIL  $1"; }
check(){ if [ "$1" = "$2" ]; then ok "$3"; else bad "$3 (ожидалось '$2', получено '$1')"; fi; }
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
mkmp4(){ ffmpeg -y -loglevel error -f lavfi -i testsrc=duration=1:size=320x240:rate=12 \
         -f lavfi -i sine=frequency=440:duration=1 \
         -c:v libx264 -crf 28 -pix_fmt yuv420p -c:a aac -shortest -f mp4 "$1"; }
mkmov(){ ffmpeg -y -loglevel error -f lavfi -i testsrc=duration=1:size=320x240:rate=12 \
         -f lavfi -i sine=frequency=440:duration=1 \
         -c:v libx264 -crf 28 -pix_fmt yuv420p -c:a aac -shortest -f mov "$1"; }
mkdir -p /tmp/t92

echo "── Подготовка: чистка + посев ──"
rm -rf "public/uploads/видео 92" "public/uploads/папка 92" "public/uploads/папка 92 (новая)" "public/uploads/папка 92 _новая" "public/uploads/папка 92 новая"
$PHP -r '
$pdo = new PDO("sqlite:backend/storage/database.sqlite");
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$ids = $pdo->query("SELECT id FROM products WHERE slug LIKE \"test-92-%\"")->fetchAll(PDO::FETCH_COLUMN);
foreach ($ids as $id) {
  foreach ($pdo->query("SELECT url FROM product_images WHERE product_id = " . (int)$id) as $r) {
    $u = (string)$r["url"];
    if (str_starts_with($u, "/uploads/")) @unlink(getcwd() . "/public" . $u);
  }
  $pdo->exec("DELETE FROM product_images WHERE product_id = " . (int)$id);
  $pdo->exec("DELETE FROM products WHERE id = " . (int)$id);
}
echo "cleaned\n";
' >/tmp/t92-clean.log 2>&1 || { cat /tmp/t92-clean.log; echo "чистка не прошла"; exit 1; }

SLUG_A="test-92-video-$(date +%s)"
SLUG_B="test-92-second-$(date +%s)"
$PHP -r '
$pdo = new PDO("sqlite:backend/storage/database.sqlite");
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$pdo->prepare("INSERT INTO products (name, slug, type) VALUES (?, ?, ?)")->execute(["Тест 92 видео", $argv[1], "simple"]);
$pdo->prepare("INSERT INTO products (name, slug, type) VALUES (?, ?, ?)")->execute(["Тест 92 второй", $argv[2], "simple"]);
echo "seeded\n";
' "$SLUG_A" "$SLUG_B" >/tmp/t92-seed.log 2>&1 || { cat /tmp/t92-seed.log; exit 1; }

mkdir -p "public/uploads/видео 92" "public/uploads/папка 92"
mkmp4 "public/uploads/видео 92/клип 92.mp4"
mkmp4 "public/uploads/видео 92/общий.mp4"
mkmov "public/uploads/видео 92/исходник.mov"
printf 'x' > "public/uploads/видео 92/свободный.txt"
printf 'x' > "public/uploads/папка 92/вложение.txt"
ok "посев: 2 товара, «видео 92» (mp4×2 + mov + txt), «папка 92»"

PID_A=$($PHP -r '$pdo=new PDO("sqlite:backend/storage/database.sqlite"); echo (int)$pdo->query("SELECT id FROM products WHERE slug=\"$argv[1]\"")->fetchColumn();' "$SLUG_A")
PID_B=$($PHP -r '$pdo=new PDO("sqlite:backend/storage/database.sqlite"); echo (int)$pdo->query("SELECT id FROM products WHERE slug=\"$argv[1]\"")->fetchColumn();' "$SLUG_B")

echo "── Старт сервера :$PORT ──"
pkill -f "php.*127.0.0.1:$PORT" 2>/dev/null; sleep 1
( setsid "$PHP" -S 127.0.0.1:$PORT backend/public/index.php >/tmp/t92-php.log 2>&1 & )
for i in $(seq 1 20); do
  curl -s "http://127.0.0.1:$PORT/api/health" | grep -q ok && break
  sleep 0.5
done
curl -s "$BASE/health" | grep -q ok && ok "сервер поднялся" || bad "сервер не поднялся"

CJ=/tmp/t92-cookies.txt
LOGIN=$(curl -s -c "$CJ" -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"admin@lakomka.local","password":"Lakomka2026!"}')
jget "$LOGIN" "data.user.email" >/dev/null
[ -n "$(jget "$LOGIN" "data.token")" ] && ok "админ залогинен" || bad "логин не удался: $LOGIN"

echo "── Task 92. A: видео переносится в папку товара ──"
R=$(curl -s -b "$CJ" -X POST "$BASE/admin/products/$PID_A/media/attach" -H "Content-Type: application/json" \
  -d '{"url":"/uploads/видео 92/клип 92.mp4"}')
UA=$(jget "$R" "data.url")
check "$UA" "/uploads/products/$SLUG_A/клип 92.mp4" "attach вернул URL в папке товара ($UA)"
[ -f "public/uploads/products/$SLUG_A/клип 92.mp4" ] && ok "файл лежит в папке товара" || bad "файла в папке товара нет"
[ ! -f "public/uploads/видео 92/клип 92.mp4" ] && ok "из папки видео файл ИСЧЕЗ (перенос, не копия)" || bad "файл остался в папке видео"

echo "── Task 92. B: общий файл: B → A, записи B переписываются ──"
R2=$(curl -s -b "$CJ" -X POST "$BASE/admin/products/$PID_B/media/attach" -H "Content-Type: application/json" \
  -d '{"url":"/uploads/видео 92/общий.mp4"}')
UB=$(jget "$R2" "data.url")
check "$UB" "/uploads/products/$SLUG_B/общий.mp4" "общий.mp4 → в папку товара B ($UB)"

# Тот же файл (уже в папке B) привязываем к A: он ПЕРЕЕЗЖАЕТ в папку A,
# а запись B переписывается на новое место — видео остаётся у обоих
R3=$(curl -s -b "$CJ" -X POST "$BASE/admin/products/$PID_A/media/attach" -H "Content-Type: application/json" \
  -d "{\"url\":\"$UB\"}")
UA2=$(jget "$R3" "data.url")
check "$UA2" "/uploads/products/$SLUG_A/общий.mp4" "переезд файла от B к A ($UA2)"
BURL=$($PHP -r '$pdo=new PDO("sqlite:backend/storage/database.sqlite"); foreach($pdo->query("SELECT url FROM product_images WHERE product_id = '"$PID_B"'") as $r) echo $r["url"],"\n";' | tr '\n' ' ')
echo "$BURL" | grep -q "$UA2" && ok "запись товара B переписана на новое место (retarget)" || bad "запись B не переписана: $BURL"
[ ! -f "public/uploads/products/$SLUG_B/общий.mp4" ] && ok "у товара B файла больше нет (перенесён, не скопирован)" || bad "дубль остался у B"
[ -f "public/uploads/products/$SLUG_A/общий.mp4" ] && ok "файл лежит в папке товара A" || bad "файла у A нет"

echo "── Task 92. C: коллизия имени в папке товара → суффикс «-2» ──"
mkmp4 "public/uploads/видео 92/общий.mp4"   # ещё один «общий.mp4» в папке видео
R4=$(curl -s -b "$CJ" -X POST "$BASE/admin/products/$PID_A/media/attach" -H "Content-Type: application/json" \
  -d '{"url":"/uploads/видео 92/общий.mp4"}')
UA3=$(jget "$R4" "data.url")
check "$UA3" "/uploads/products/$SLUG_A/общий-2.mp4" "коллизия → суффикс «-2» ($UA3)"
[ -f "public/uploads/products/$SLUG_A/общий-2.mp4" ] && ok "файл «-2» на диске" || bad "файла «-2» нет"

echo "── Task 92. D: повторная привязка того же URL → отказ ──"
R5=$(curl -s -b "$CJ" -X POST "$BASE/admin/products/$PID_A/media/attach" -H "Content-Type: application/json" \
  -d "{\"url\":\"$UA2\"}")
DUP=$(jget "$R5" "error")
[ -n "$DUP" ] && ok "повторная привязка того же URL → отказ ($DUP)" || bad "ожидали 409-дубль, получено: $R5"

echo "── Task 93. E: referenced-флаги в списке файлов ──"
L=$(curl -s -b "$CJ" "$BASE/admin/files?path=media/products/$SLUG_A")
REF1=$(jget "$L" "data.entries.0.referenced")
check "$REF1" "true" "файлы папки товара помечены referenced=true (получено '$REF1')"
L2=$(curl -s -b "$CJ" -G "$BASE/admin/files" --data-urlencode "path=media/видео 92")
REF2=$(echo "$L2" | $PHP -r '$d=json_decode(stream_get_contents(STDIN),true); foreach(($d["data"]["entries"]??[]) as $e) if($e["name"]==="свободный.txt") echo $e["referenced"]?"true":"false";')
check "$REF2" "false" "свободный.txt — referenced=false"

echo "── Task 93. F: переименование в media (пути раздела «media») ──"
RN=$(curl -s -b "$CJ" -X POST "$BASE/admin/files/rename" -H "Content-Type: application/json" \
  -d '{"path":"media/видео 92/свободный.txt","name":"переименован.txt"}')
check "$(jget "$RN" "data.ok")" "true" "свободный файл переименован"
[ -f "public/uploads/видео 92/переименован.txt" ] && ok "файл реально переименован на диске" || bad "файла с новым именем нет"
RN2=$(curl -s -b "$CJ" -X POST "$BASE/admin/files/rename" -H "Content-Type: application/json" \
  -d "{\"path\":\"media/products/$SLUG_A/общий.mp4\",\"name\":\"взлом.mp4\"}")
EC=$(jget "$RN2" "error")
echo "$EC" | grep -q "используется" && ok "referenced-файл: 403 «$EC»" || bad "ожидали отказ, получено: $RN2"
RN3=$(curl -s -b "$CJ" -X POST "$BASE/admin/files/rename" -H "Content-Type: application/json" \
  -d "{\"path\":\"media/products/$SLUG_A\",\"name\":\"украдено\"}")
EC3=$(jget "$RN3" "error")
echo "$EC3" | grep -q "используется" && ok "папка товара (внутри referenced-файл): 403" || bad "папку переименовали?! $RN3"
RN4=$(curl -s -b "$CJ" -X POST "$BASE/admin/files/rename" -H "Content-Type: application/json" \
  -d '{"path":"media/папка 92","name":"папка 92 новая"}')
check "$(jget "$RN4" "data.ok")" "true" "неиспользуемая папка переименована"
[ -d "public/uploads/папка 92 новая" ] && ok "папка реально переименована" || bad "новой папки нет"

echo "── Task 94. G: оптимизация mov из проводника (тот же /files/compress) ──"
CP=$(curl -s -b "$CJ" -X POST "$BASE/admin/files/compress" -H "Content-Type: application/json" \
  -d '{"url":"/uploads/видео 92/исходник.mov"}')
CU=$(jget "$CP" "data.url")
CEXT="${CU##*.}"
check "$CEXT" "mp4" "mov сконвертирован в mp4 ($CU)"
[ -n "$(jget "$CP" "data.note")" ] && ok "note присутствует: $(jget "$CP" "data.note")" || bad "note пуст"
# повторное сжатие mp4 — сервер либо сожмёт, либо честно откажет, но не 500
CP2=$(curl -s -b "$CJ" -X POST "$BASE/admin/files/compress" -H "Content-Type: application/json" \
  -d "{\"url\":\"$CU\"}")
OK2=$(jget "$CP2" "data.ok"); ERR2=$(jget "$CP2" "error")
[ "$OK2" = "True" ] || [ "$OK2" = "true" ] || [ -n "$ERR2" ] && ok "повторное сжатие mp4 отработало корректно (${OK2:-$ERR2})" || bad "$CP2"

echo "── Уборка ──"
$PHP -r '
$pdo = new PDO("sqlite:backend/storage/database.sqlite");
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$ids = $pdo->query("SELECT id FROM products WHERE slug LIKE \"test-92-%\"")->fetchAll(PDO::FETCH_COLUMN);
foreach ($ids as $id) {
  foreach ($pdo->query("SELECT url FROM product_images WHERE product_id = " . (int)$id) as $r) {
    $u = (string)$r["url"];
    if (str_starts_with($u, "/uploads/products/test-92-")) @unlink(getcwd() . "/public" . $u);
  }
  $pdo->exec("DELETE FROM product_images WHERE product_id = " . (int)$id);
  $pdo->exec("DELETE FROM products WHERE id = " . (int)$id);
}
echo "cleaned\n";
' >/dev/null 2>&1
rm -rf "public/uploads/видео 92" "public/uploads/папка 92 новая" "public/uploads/папка 92 (новая)" "public/uploads/папка 92 _новая"
pkill -f "php.*127.0.0.1:$PORT" 2>/dev/null
ok "тестовые товары, файлы и сервер вычищены"

echo
echo "══════ ИТОГ: PASS=$PASS FAIL=$FAIL ══════"
[ "$FAIL" = "0" ]
