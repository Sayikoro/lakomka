#!/bin/bash
# Task 122: ZIP-отчёт по проблемным файлам (архитектура импорта) + состояние видео:
#   1) MediaOptimizer::videoHealth — детект «нулевых»/битых файлов БЕЗ ffmpeg;
#      пре-чек в optimizeVideoFile/recompressMp4File → честная причина вместо
#      11 попыток каскада («Invalid data found» на файлах-дырах с прода);
#   2) videos()/images() отдают used/status/product (название подарка + обложка);
#   3) POST /admin/files/media-report-zip — ZIP с products.csv (формат импорта)
#      + images/ + videos/ по товарам проблемных файлов: владелец заменяет битые
#      видео и загружает архив через «Импорт товаров»;
#   4) MassMediaOptimizer: миниатюры + названия подарков, бейджи «повреждено»/
#      «не подключена», «в корзину» для неиспользуемых, ZIP-кнопка в отчёте.
# Регрессии запускаются отдельно: task121/120/118/117/116/115/114/112-tests.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PHP="$(command -v php 2>/dev/null || true)"
[ -z "$PHP" ] && [ -x "$ROOT/.ztools/php" ] && PHP="$ROOT/.ztools/php"
[ -z "$PHP" ] && [ -x "$ROOT/../.ztools/php" ] && PHP="$(readlink -f "$ROOT/../.ztools/php")"
[ -n "$PHP" ] || { echo "php не найден"; exit 1; }
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); echo "  OK  $1"; }
bad(){ FAIL=$((FAIL+1)); echo "  FAIL $1"; }
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

echo "── 1. Синтаксис, типы, линт ──"
for f in backend/src/MediaOptimizer.php backend/src/Controllers/AdminFilesController.php backend/public/index.php; do
  $PHP -l "$ROOT/$f" > /dev/null 2>&1 && ok "php -l $f" || bad "php -l $f"
done
if npx tsc --noEmit > /tmp/t122-tsc.log 2>&1; then ok "tsc --noEmit чист"; else bad "tsc: $(head -3 /tmp/t122-tsc.log)"; fi
if npx eslint src/components/admin/MassMediaOptimizer.tsx > /tmp/t122-eslint.log 2>&1; then ok "eslint MassMediaOptimizer чист"; else bad "eslint: $(grep -E 'error' /tmp/t122-eslint.log | head -2)"; fi

echo "── 2. Маркеры ──"
rg -q "public static function videoHealth" "$ROOT/backend/src/MediaOptimizer.php" && ok "MediaOptimizer: videoHealth()" || bad "нет videoHealth"
rg -q "videoHealthNote" "$ROOT/backend/src/MediaOptimizer.php" && ok "MediaOptimizer: videoHealthNote()" || bad "нет videoHealthNote"
rg -q 'self::videoHealth\(\$path\)' "$ROOT/backend/src/MediaOptimizer.php" && ok "optimizeVideoFile: пре-чек состояния" || bad "нет пре-чека в optimizeVideoFile"
rg -q 'self::videoHealth\(\$path\)' "$ROOT/backend/src/MediaOptimizer.php" && rg -q "меньше 1 МБ" "$ROOT/backend/src/MediaOptimizer.php" && ok "recompressMp4File: пре-чек до лимита 1 МБ" || bad "нет пре-чека в recompressMp4File"
rg -q "public static function mediaReportZip" "$ROOT/backend/src/Controllers/AdminFilesController.php" && ok "контроллер: mediaReportZip()" || bad "нет mediaReportZip"
rg -q "AdminFilesController::mediaReportZip" "$ROOT/backend/public/index.php" && ok "роут /api/admin/files/media-report-zip" || bad "нет роута"
rg -q "private static function productContext" "$ROOT/backend/src/Controllers/AdminFilesController.php" && ok "контроллер: productContext()" || bad "нет productContext"
rg -q "private static function productFor" "$ROOT/backend/src/Controllers/AdminFilesController.php" && ok "контроллер: productFor() (база + папка)" || bad "нет productFor"
rg -q "'status' => MediaOptimizer::videoHealth" "$ROOT/backend/src/Controllers/AdminFilesController.php" && ok "videos(): поле status" || bad "нет status в videos()"
rg -qF "'used'   => isset(\$ctx['videoUsed']" "$ROOT/backend/src/Controllers/AdminFilesController.php" && ok "videos(): поле used" || bad "нет used в videos()"
rg -q "'product' => self::productFor" "$ROOT/backend/src/Controllers/AdminFilesController.php" && ok "videos()+images(): поле product" || bad "нет product"
rg -q "lakomka-media-report-" "$ROOT/backend/src/Controllers/AdminFilesController.php" && ok "ZIP: имя lakomka-media-report-<дата>" || bad "нет имени архива"
rg -q "addFromString\('products.csv'" "$ROOT/backend/src/Controllers/AdminFilesController.php" && ok "ZIP: products.csv внутри" || bad "нет products.csv"
rg -q "media-report-zip" "$ROOT/src/components/admin/MassMediaOptimizer.tsx" && ok "UI: ZIP-кнопка бьёт в новый эндпоинт" || bad "UI без ZIP"
rg -q "void purgeEntry" "$ROOT/src/components/admin/MassMediaOptimizer.tsx" && ok "UI: удаление неиспользуемых (purgeEntry)" || bad "нет purgeEntry"
rg -qF 'повреждено (нули)' "$ROOT/src/components/admin/MassMediaOptimizer.tsx" && ok "UI: бейдж «повреждено (нули)»" || bad "нет бейджа нулей"
rg -q "e.product?.thumb" "$ROOT/src/components/admin/MassMediaOptimizer.tsx" && ok "UI: обложка подарка в списке" || bad "нет обложки"
rg -q "r.product && <b" "$ROOT/src/components/admin/MassMediaOptimizer.tsx" && ok "UI: название подарка в отчёте" || bad "нет названия в отчёте"
rg -q '"товар"' "$ROOT/src/components/admin/MassMediaOptimizer.tsx" && ok "UI: колонка «товар» в CSV" || bad "нет колонки товара в CSV"

echo "── 3. Юнит: videoHealth и пре-чек ──"
T=/tmp/t122-unit; rm -rf "$T"; mkdir -p "$T"
# файл-дыра: правильный размер, сплошные нули (точно как на проде)
head -c 2097152 /dev/zero > "$T/zero.mov"
# мусорный заголовок (не ISO-BMFF)
head -c 65536 /dev/urandom > "$T/garbage.mov"
# коротыш: 2 НЕнулевых байта — меньше минимального бокса → broken
printf '\x12\x34' > "$T/short.mov"
# нулевой файл (0 байт)
: > "$T/empty.mov"
# валидный mp4 — только при наличии ffmpeg в песочнице
FF="$(command -v ffmpeg 2>/dev/null || true)"
[ -z "$FF" ] && [ -x /usr/bin/ffmpeg ] && FF=/usr/bin/ffmpeg
if [ -n "$FF" ]; then
  "$FF" -y -loglevel error -f lavfi -i testsrc=duration=4:size=640x360:rate=24 \
    -c:v libx264 -preset veryfast -b:v 1500k -pix_fmt yuv420p "$T/valid.mp4" 2>/dev/null \
    && ok "ffmpeg: тестовый mp4 создан ($(stat -c%s "$T/valid.mp4") б)" || bad "ffmpeg не смог создать mp4"
else
  bad "ffmpeg в песочнице не найден — валидный mp4 не проверить"
fi
$PHP -r '
require $argv[1]."/backend/src/MediaOptimizer.php";
$t = $argv[2];
$h0 = MediaOptimizer::videoHealth("$t/empty.mov");
$h1 = MediaOptimizer::videoHealth("$t/zero.mov");
$h2 = MediaOptimizer::videoHealth("$t/garbage.mov");
$h3 = MediaOptimizer::videoHealth("$t/short.mov");
$h4 = is_file("$t/valid.mp4") ? MediaOptimizer::videoHealth("$t/valid.mp4") : "-";
$n = MediaOptimizer::videoHealthNote("empty");
echo ($h0==="empty" && $h1==="empty" && $h2==="broken" && $h3==="broken" && ($h4==="ok"||$h4==="-") && str_contains($n, "нулей")) ? "unit-ok" : "unit-fail:$h0:$h1:$h2:$h3:$h4";
' "$ROOT" "$T" > /tmp/t122-health.txt 2>&1
grep -q "^unit-ok$" /tmp/t122-health.txt && ok "videoHealth: 0б/нули=empty, мусор/коротыш=broken, mp4=ok" || bad "videoHealth: $(cat /tmp/t122-health.txt)"
# пре-чек: нулевой mov отдаёт честную причину и НЕ запускает каскад (моментально)
T0=$(date +%s%N)
$PHP -r '
require $argv[1]."/backend/src/MediaOptimizer.php";
$r = MediaOptimizer::optimizeVideoFile($argv[2]."/zero.mov");
echo ($r["converted"] === false && str_contains($r["note"], "повреждено") && str_contains($r["note"], "нулей")) ? "precheck-ok" : "precheck-fail:".json_encode($r);
' "$ROOT" "$T" > /tmp/t122-precheck.txt 2>&1
T1=$(date +%s%N)
MS=$(( (T1 - T0) / 1000000 ))
grep -q "^precheck-ok$" /tmp/t122-precheck.txt && ok "optimizeVideoFile(нули): note «повреждено», без каскада (${MS} мс)" || bad "пре-чек: $(cat /tmp/t122-precheck.txt)"
[ "$MS" -lt 3000 ] && ok "пре-чек быстрый (<3 с — каскад не гонялся)" || bad "пре-чек медленный: ${MS} мс"
if [ -f "$T/valid.mp4" ]; then
  $PHP -r '
  require $argv[1]."/backend/src/MediaOptimizer.php";
  $r = MediaOptimizer::recompressMp4File($argv[2]."/valid.mp4");
  echo (!str_contains($r["note"], "повреждено")) ? "ok-note" : "fail:".json_encode($r);
  ' "$ROOT" "$T" > /tmp/t122-mp4.txt 2>&1
  grep -q "^ok-note$" /tmp/t122-mp4.txt && ok "recompressMp4File(валидный mp4): без ложного «повреждено»" || bad "recompress: $(cat /tmp/t122-mp4.txt)"
fi

echo "── 4. API (:8031) — списки, ZIP-отчёт, сжатие битого ──"
PORT=8031; BASE="http://127.0.0.1:$PORT/api"; LOG=/tmp/t122-php.log
export PHP_CLI_SERVER_WORKERS=8
pkill -f "127.0.0.1:$PORT" 2>/dev/null; sleep 1
( setsid "$PHP" -S 127.0.0.1:$PORT backend/public/index.php >"$LOG" 2>&1 & )
UP=1
for i in $(seq 1 30); do curl -s "$BASE/health" | grep -q ok && { UP=0; break; }; sleep 0.3; done
[ "$UP" = "0" ] && ok "сервер :$PORT поднялся" || bad "сервер не поднялся"

ANON=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/admin/files/media-report-zip" -H "Content-Type: application/json" -d '{"urls":["/uploads/products/t122-test/video-0.mov"]}')
[ "$ANON" = "401" ] && ok "аноним → media-report-zip 401" || bad "аноним: $ANON"

CJ=/tmp/t122-cookies.txt
LOGIN=$(curl -s -c "$CJ" -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d '{"email":"admin@lakomka.local","password":"Lakomka2026!"}')
echo "$LOGIN" | grep -q "super_admin\|\"ok\"\|token" && ok "логин администратором" || bad "логин: $LOGIN"

# ── песочница: товар + файлы (нули + картинка + осиротевшая папка) ──
PID=$($PHP -r '
require $argv[1]."/backend/config.php"; require $argv[1]."/backend/src/Database.php";
$pdo = Database::get();
$pdo->exec("INSERT INTO products (name, type, slug, price_kopecks, stock_qty, show_in_catalog, is_published) VALUES (\"Тест-122 Подарок\", \"simple\", \"t122-test\", 150000, 5, 1, 1)");
echo (int)$pdo->lastInsertId();
' "$ROOT")
[ -n "$PID" ] && [ "$PID" != "0" ] && ok "тестовый товар создан (id=$PID)" || { bad "товар не создан: $PID"; PID=1; }
UPD=$ROOT/public/uploads/products/t122-test
ORPH=$ROOT/public/uploads/products/t122-orphan
mkdir -p "$UPD" "$ORPH"
head -c 1048576 /dev/zero > "$UPD/video-0.mov"
$PHP -r '
$im = imagecreatetruecolor(80, 60); imagefill($im, 0, 0, imagecolorallocate($im, 200, 60, 60));
imagejpeg($im, $argv[1], 90);
' "$UPD/0.jpg" 2>/dev/null
head -c 524288 /dev/zero > "$ORPH/video-0.mov"
$PHP -r '
require $argv[1]."/backend/config.php"; require $argv[1]."/backend/src/Database.php";
$pdo = Database::get();
$st = $pdo->prepare("INSERT INTO product_images (product_id, url, alt, media_type, sort_order) VALUES (?, \"/uploads/products/t122-test/video-0.mov\", \"Видео\", \"video\", 0)");
$st->execute([(int)$argv[2]]);
$st = $pdo->prepare("INSERT INTO product_images (product_id, url, alt, media_type, sort_order) VALUES (?, \"/uploads/products/t122-test/0.jpg\", \"Тест-122 Подарок\", \"image\", 1)");
$st->execute([(int)$argv[2]]);
echo "db-ok";
' "$ROOT" "$PID" > /dev/null 2>&1 && ok "привязки product_images вставлены" || bad "привязки не вставились"

VIDEOS=$(curl -s -b "$CJ" "$BASE/admin/files/videos?folder=products")
E_ENTRY=$(echo "$VIDEOS" | python3 -c "
import json,sys
d=json.load(sys.stdin)['data']['entries']
for e in d:
    if e['url']=='/uploads/products/t122-test/video-0.mov':
        print(json.dumps(e, ensure_ascii=False)); break
else:
    print('MISSING')
" 2>/dev/null)
[ "$E_ENTRY" != "MISSING" ] && [ -n "$E_ENTRY" ] && ok "videos: запись тестового файла найдена" || bad "запись не найдена: $(echo "$VIDEOS" | head -c 200)"
[ "$(jget "$E_ENTRY" used)" = "true" ] && ok "videos: привязанное видео used=true" || bad "videos used: $(jget "$E_ENTRY" used)"
[ "$(jget "$E_ENTRY" status)" = "empty" ] && ok "videos: статус нулевого файла empty" || bad "videos status: $(jget "$E_ENTRY" status)"
[ "$(jget "$E_ENTRY" product.name)" = "Тест-122 Подарок" ] && ok "videos: товар опознан по привязке из базы" || bad "videos product: $(jget "$E_ENTRY" product.name)"
THUMB=$(jget "$E_ENTRY" product.thumb)
[ "$THUMB" = "/uploads/products/t122-test/0.jpg" ] && ok "videos: обложка = первая картинка товара" || bad "videos thumb: $THUMB"
E_ORPH=$(echo "$VIDEOS" | python3 -c "
import json,sys
d=json.load(sys.stdin)['data']['entries']
for e in d:
    if e['url']=='/uploads/products/t122-orphan/video-0.mov':
        print((str(e['used']).lower(), e['status'] or '', 'none' if e['product'] is None else e['product']['name'])); break
else:
    print('MISSING')
" 2>/dev/null)
echo "$E_ORPH" | grep -qF "('false', 'empty', 'none')" && ok "videos: осиротевший файл used=false, product=null (папка не опознана)" || bad "orphan: $E_ORPH"

IMAGES=$(curl -s -b "$CJ" "$BASE/admin/files/images?folder=products")
I_ENTRY=$(echo "$IMAGES" | python3 -c "
import json,sys
d=json.load(sys.stdin)['data']['entries']
for e in d:
    if e['url']=='/uploads/products/t122-test/0.jpg':
        print(json.dumps(e, ensure_ascii=False)); break
else:
    print('MISSING')
" 2>/dev/null)
[ "$(jget "$I_ENTRY" used)" = "true" ] && ok "images: used=true (как раньше)" || bad "images used: $(jget "$I_ENTRY" used)"
[ "$(jget "$I_ENTRY" product.name)" = "Тест-122 Подарок" ] && ok "images: товар тоже подставляется" || bad "images product: $(jget "$I_ENTRY" product.name)"

# ── ZIP-отчёт ──
ERRZIP=$(curl -s -b "$CJ" -X POST "$BASE/admin/files/media-report-zip" -H "Content-Type: application/json" -d '{"urls":["/uploads/products/t122-orphan/video-0.mov"]}')
echo "$ERRZIP" | grep -q "не найдено товаров" && ok "ZIP: файл без товара → честный отказ" || bad "ZIP orphan: $ERRZIP"
ZIPRES=$(curl -s -b "$CJ" -X POST "$BASE/admin/files/media-report-zip" -H "Content-Type: application/json" -d "{\"urls\":[\"/uploads/products/t122-test/video-0.mov\"]}")
[ "$(jget "$ZIPRES" data.ok)" = "true" ] && ok "ZIP: собран по товару битого видео" || bad "ZIP сборка: $(echo "$ZIPRES" | head -c 300)"
ZIPFILE=$(jget "$ZIPRES" data.file)
ZIPSIZE=$(jget "$ZIPRES" data.size)
[ -f "$ROOT/public/exports/$ZIPFILE" ] && ok "ZIP: файл лежит в exports ($ZIPSIZE б)" || bad "файла нет: $ZIPFILE"
[ "$(jget "$ZIPRES" data.videos_packed)" = "1" ] && ok "ZIP: видео упаковано" || bad "videos_packed: $(jget "$ZIPRES" data.videos_packed)"
[ "$(jget "$ZIPRES" data.images_packed)" = "1" ] && ok "ZIP: картинка упакована" || bad "images_packed: $(jget "$ZIPRES" data.images_packed)"
TR=$(jget "$ZIPRES" data.to_replace.0.zip)
[ "$TR" = "videos/${PID}-v0.mov" ] && ok "ZIP: to_replace указывает на videos/${PID}-v0.mov" || bad "to_replace: $TR"
DLURL=$(jget "$ZIPRES" data.download_url)
DL=$(curl -s -b "$CJ" -o /tmp/t122-dl.zip -w '%{http_code}' "$BASE/../..${DLURL}" 2>/dev/null)
# download_url начинается с /api — качаем через BASE-корень
DL=$(curl -s -b "$CJ" -o /tmp/t122-dl.zip -w '%{http_code}' "http://127.0.0.1:$PORT${DLURL}")
[ "$DL" = "200" ] && ok "ZIP: скачивание по download_url → 200" || bad "download: $DL"
cmp -s /tmp/t122-dl.zip "$ROOT/public/exports/$ZIPFILE" && ok "ZIP: скачанное = файлу на диске" || bad "скачанное отличается"
# содержимое архива (проверка через python — имена со слэшами)
ZC=$($PHP -r '
$z = new ZipArchive();
if ($z->open($argv[1]) !== true) { echo "open-fail"; exit; }
$names = [];
for ($i = 0; $i < $z->numFiles; $i++) $names[] = $z->getNameIndex($i);
$csv = $z->getFromName("products.csv");
echo json_encode(["names"=>$names, "csv_has_name"=>str_contains($csv, "Тест-122 Подарок"), "csv_has_video"=>str_contains($csv, "-v0.mov")], JSON_UNESCAPED_UNICODE);
' "/tmp/t122-dl.zip" 2>/dev/null)
echo "$ZC" | python3 -c '
import json,sys
d=json.load(sys.stdin)
names=d["names"]
assert "products.csv" in names, "нет products.csv"
assert any(n.endswith("-v0.mov") and n.startswith("videos/") for n in names), "нет видео"
assert any(n.endswith("-0.jpg") and n.startswith("images/") for n in names), "нет картинки"
assert d["csv_has_name"] and d["csv_has_video"], "CSV неполный"
print("zip-contents-ok")
' > /tmp/t122-zc.txt 2>&1
grep -q "^zip-contents-ok$" /tmp/t122-zc.txt && ok "ZIP: products.csv + videos/ + images/ + CSV полный" || bad "содержимое: $(cat /tmp/t122-zc.txt)"
# нулевое видео в архиве = нулевое на диске (аддин addFile не портит)
$PHP -r '
$z = new ZipArchive(); $z->open($argv[1]);
$data = $z->getFromName("videos/".$argv[2]."-v0.mov");
echo (strlen($data) === 1048576 && strspn($data, "\x00") === strlen($data)) ? "zeros-ok" : "zeros-fail:".strlen($data);
' "/tmp/t122-dl.zip" "$PID" > /tmp/t122-zeros.txt 2>&1
grep -q "^zeros-ok$" /tmp/t122-zeros.txt && ok "ZIP: битое видео внутри = нули (владелец заменит содержимое)" || bad "нули: $(cat /tmp/t122-zeros.txt)"

# ── сжатие битого файла: честная причина без каскада ──
CPR=$(curl -s -b "$CJ" -X POST "$BASE/admin/files/compress" -H "Content-Type: application/json" -d '{"url":"/uploads/products/t122-test/video-0.mov"}')
echo "$CPR" | grep -q "повреждено" && echo "$CPR" | grep -q "нулей" && ok "compress(нули): 422 с понятной причиной" || bad "compress: $(echo "$CPR" | head -c 200)"

# ── уборка ──
$PHP -r '
require $argv[1]."/backend/config.php"; require $argv[1]."/backend/src/Database.php";
$pdo = Database::get();
$pdo->prepare("DELETE FROM product_images WHERE product_id = ?")->execute([(int)$argv[2]]);
$pdo->prepare("DELETE FROM products WHERE id = ?")->execute([(int)$argv[2]]);
echo "cleanup-ok";
' "$ROOT" "$PID" > /dev/null 2>&1
rm -rf "$UPD" "$ORPH" "$ROOT/public/exports/$ZIPFILE"
pkill -f "127.0.0.1:$PORT" 2>/dev/null
rm -f /tmp/t122-cookies.txt /tmp/t122-dl.zip
rm -rf "$T"
echo "уборка: тестовый товар (id=$PID), файлы и ZIP удалены"

echo "── ИТОГ: PASS=$PASS FAIL=$FAIL ──"
[ "$FAIL" = "0" ] && echo "ALL OK" || exit 1
