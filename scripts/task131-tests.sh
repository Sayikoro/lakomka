#!/bin/bash
# Task 131: PDF по выбранным подаркам (название + картинка + цена, 6 на страницу A4).
# Кнопка «Сформировать PDF» в bulk-bar таблицы товаров, POST /api/admin/products/pdf.
# Библиотека ImgPdf: PDF из JPEG-страниц (текст отрисован GD, DejaVu из public/fonts).
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
for f in backend/src/Controllers/AdminProductsController.php backend/src/ImgPdf.php backend/public/index.php; do
  $PHP -l "$ROOT/$f" > /dev/null 2>&1 && ok "php -l $f" || bad "php -l $f"
done
./node_modules/.bin/tsc --noEmit > /tmp/t131-tsc.log 2>&1 && ok "tsc --noEmit чист" || bad "tsc: $(head -3 /tmp/t131-tsc.log)"
./node_modules/.bin/eslint src/components/admin/ProductsTable.tsx > /tmp/t131-eslint.log 2>&1 \
  && ok "eslint ProductsTable чист" || bad "eslint: $(grep -E 'error|warning' /tmp/t131-eslint.log | head -2)"

echo "── 2. Маркеры ──"
rg -q 'public static function pdf\(' "$ROOT/backend/src/Controllers/AdminProductsController.php" && ok "контроллер: pdf()" || bad "нет pdf()"
rg -q 'AdminProductsController::pdf' "$ROOT/backend/public/index.php" && ok "роут /api/admin/products/pdf" || bad "нет роута pdf"
rg -q 'ImgPdf::fromJpegs' "$ROOT/backend/src/Controllers/AdminProductsController.php" && ok "контроллер: сборка через ImgPdf" || bad "нет ImgPdf::fromJpegs"
rg -q 'fonts/DejaVuSans.ttf' "$ROOT/backend/src/Controllers/AdminProductsController.php" && ok "шрифт: DejaVu из public/fonts (кириллица + ₽)" || bad "DejaVu не подключён"
rg -q 'str_starts_with\(\$file, \$root' "$ROOT/backend/src/Controllers/AdminProductsController.php" && ok "mainImageFile: realpath не выходит за public/" || bad "нет защиты пути картинки"
rg -q 'AND deleted_at IS NULL' "$ROOT/backend/src/Controllers/AdminProductsController.php" && ok "pdf: удалённые товары не попадают" || bad "нет фильтра deleted_at"
rg -q 'array_unique' "$ROOT/backend/src/Controllers/AdminProductsController.php" && ok "pdf: дубликаты ids схлопываются" || bad "нет array_unique"
[ -f "$ROOT/public/fonts/DejaVuSans.ttf" ] && [ -f "$ROOT/public/fonts/DejaVuSans-Bold.ttf" ] \
  && ok "в репо лежат DejaVuSans(.Bold).ttf" || bad "шрифты не в репо"
rg -q 'data-testid="pdf-btn"' "$ROOT/src/components/admin/ProductsTable.tsx" && ok "UI: кнопка pdf-btn в bulk-bar" || bad "нет pdf-btn"
rg -qF 'Сформировать PDF' "$ROOT/src/components/admin/ProductsTable.tsx" && ok "UI: надпись «Сформировать PDF»" || bad "нет надписи кнопки"
rg -q 'admin/products/pdf' "$ROOT/src/components/admin/ProductsTable.tsx" && ok "UI: бьёт в /admin/products/pdf" || bad "нет вызова API"
rg -q 'lakomka-podarki-' "$ROOT/src/components/admin/ProductsTable.tsx" && ok "UI: имя файла lakomka-podarki-<дата>.pdf" || bad "нет имени скачивания"

echo "── 3. Юнит ImgPdf ──"
mkdir -p /tmp/t131u
$PHP -r '
require $argv[1]."/backend/src/ImgPdf.php";
$im = imagecreatetruecolor(300, 424); imagefill($im,0,0,imagecolorallocate($im,200,60,60));
imagejpeg($im, "/tmp/t131u/a.jpg", 80); imagedestroy($im);
$im = imagecreatetruecolor(300, 424); imagefill($im,0,0,imagecolorallocate($im,60,60,200));
imagejpeg($im, "/tmp/t131u/b.jpg", 80); imagedestroy($im);
$pdf = ImgPdf::fromJpegs(["/tmp/t131u/a.jpg", "/tmp/t131u/b.jpg"]);
file_put_contents("/tmp/t131u/two.pdf", $pdf);
echo substr($pdf,0,8), "|", substr_count($pdf, "/Type /Page "), "|", (int)(strpos($pdf,"/DCTDecode")!==false), "|", (int)(str_ends_with($pdf,"%%EOF\n"));
' "$ROOT" > /tmp/t131u/unit.out 2>&1
U=$(cat /tmp/t131u/unit.out)
echo "$U" | grep -q '^%PDF-1.4|' && ok "ImgPdf: %PDF-заголовок" || bad "ImgPdf: $U"
echo "$U" | grep -q '|2|' && ok "ImgPdf: 2 файла → 2 страницы" || bad "ImgPdf: страниц не 2 ($U)"
echo "$U" | grep -q '|1|1$' && ok "ImgPdf: DCTDecode и %%EOF на месте" || bad "ImgPdf: $U"
$PHP -r '
require $argv[1]."/backend/src/ImgPdf.php";
try { ImgPdf::fromJpegs([]); echo "no-exception"; } catch (InvalidArgumentException $e) { echo "exception"; }
' "$ROOT" > /tmp/t131u/unit2.out 2>&1
grep -q exception /tmp/t131u/unit2.out && ok "ImgPdf: пустой список → InvalidArgumentException" || bad "пустой список не отброшен"
pdftoppm -r 40 -jpeg /tmp/t131u/two.pdf /tmp/t131u/pp 2>/dev/null && \
  [ -f /tmp/t131u/pp-1.jpg ] && [ -f /tmp/t131u/pp-2.jpg ] && ok "ImgPdf: poppler рендерит обе страницы" || bad "poppler не отрендерил"

echo "── 4. API (:8052) ──"
PORT=8052; BASE="http://127.0.0.1:$PORT/api"; LOG=/tmp/t131-php.log
export PHP_CLI_SERVER_WORKERS=8
pkill -f "127.0.0.1:$PORT" 2>/dev/null; sleep 1
( setsid "$PHP" -S 127.0.0.1:$PORT backend/public/index.php >"$LOG" 2>&1 & )
UP=1
for i in $(seq 1 30); do curl -s "$BASE/health" | grep -q ok && { UP=0; break; }; sleep 0.3; done
[ "$UP" = "0" ] && ok "сервер :$PORT поднялся" || { bad "сервер не поднялся"; exit 1; }

ANON=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/admin/products/pdf" -H "Content-Type: application/json" -d '{"ids":[1]}')
[ "$ANON" = "401" ] && ok "аноним → pdf 401" || bad "аноним: $ANON"

CJ=/tmp/t131-cookies.txt
LOGIN=$(curl -s -c "$CJ" -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d '{"email":"admin@lakomka.local","password":"Lakomka2026!"}')
echo "$LOGIN" | grep -q "token\|\"ok\"" && ok "логин администратором" || bad "логин: $LOGIN"

# ── сид: два товара (с картинкой и без) + один удалённый ──
$PHP -r '
require $argv[1]."/backend/config.php"; require $argv[1]."/backend/src/Database.php";
$pdo = Database::get();
foreach (["t131-a","t131-b","t131-dead"] as $s) {
  $pdo->prepare("DELETE FROM product_images WHERE product_id IN (SELECT id FROM products WHERE slug = ?)")->execute([$s]);
  $pdo->prepare("DELETE FROM products WHERE slug = ?")->execute([$s]);
}
$pdo->exec("INSERT INTO products (name, type, slug, price_kopecks, stock_qty, show_in_catalog, is_published) VALUES (\"Тест-131 Подарок С Фото\", \"simple\", \"t131-a\", 150000, 5, 1, 1)");
$pdo->exec("INSERT INTO products (name, type, slug, price_kopecks, stock_qty, show_in_catalog, is_published) VALUES (\"Тест-131 Без Фото — очень длинное название подарка которое точно не влезет в две строки и будет обрезано многоточием правильно\", \"simple\", \"t131-b\", 99999, 3, 1, 1)");
$pdo->exec("INSERT INTO products (name, type, slug, price_kopecks, stock_qty, show_in_catalog, is_published, deleted_at) VALUES (\"Тест-131 Удалённый\", \"simple\", \"t131-dead\", 100, 1, 1, 1, \"2026-01-01 00:00:00\")");
echo "db-ok";
' "$ROOT" > /dev/null 2>&1 && ok "тестовые товары созданы" || bad "товары не создались"

UPD="$ROOT/public/uploads"
mkdir -p "$UPD/products/t131-a"
$PHP -r '
$im = imagecreatetruecolor(600, 400);
imagefill($im,0,0,imagecolorallocate($im,46,139,87));
imagejpeg($im, $argv[1]."/public/uploads/products/t131-a/img-0.jpg", 88);
' "$ROOT" && ok "картинка тестового товара записана" || bad "картинка не записалась"
IDA=$($PHP -r 'require $argv[1]."/backend/config.php"; require $argv[1]."/backend/src/Database.php"; echo Database::get()->query("SELECT id FROM products WHERE slug=\"t131-a\"")->fetchColumn();' "$ROOT" 2>/dev/null)
IDB=$($PHP -r 'require $argv[1]."/backend/config.php"; require $argv[1]."/backend/src/Database.php"; echo Database::get()->query("SELECT id FROM products WHERE slug=\"t131-b\"")->fetchColumn();' "$ROOT" 2>/dev/null)
IDD=$($PHP -r 'require $argv[1]."/backend/config.php"; require $argv[1]."/backend/src/Database.php"; echo Database::get()->query("SELECT id FROM products WHERE slug=\"t131-dead\"")->fetchColumn();' "$ROOT" 2>/dev/null)
$PHP -r '
require $argv[1]."/backend/config.php"; require $argv[1]."/backend/src/Database.php";
Database::get()->prepare("INSERT INTO product_images (product_id, url, alt, media_type, sort_order) VALUES (?, ?, ?, ?, ?)")
  ->execute([(int)$argv[2], "/uploads/products/t131-a/img-0.jpg", "тест", "image", 0]);
' "$ROOT" "$IDA" > /dev/null 2>&1 && ok "product_images: картинка привязана к $IDA" || bad "product_images не записан"

# ── PDF по двум товарам ──
PDFOUT=/tmp/t131-two.pdf
CODE=$(curl -s -b "$CJ" -o "$PDFOUT" -w '%{http_code}' -X POST "$BASE/admin/products/pdf" \
  -H "Content-Type: application/json" -d "{\"ids\":[$IDA,$IDB]}")
[ "$CODE" = "200" ] && ok "pdf по 2 товарам → 200" || bad "pdf: HTTP $CODE"
CT=$(curl -s -b "$CJ" -o /dev/null -w '%{content_type}' -X POST "$BASE/admin/products/pdf" -H "Content-Type: application/json" -d "{\"ids\":[$IDA]}")
echo "$CT" | grep -qi "application/pdf" && ok "Content-Type: application/pdf" || bad "content-type: $CT"
CD=$(curl -s -b "$CJ" -o /dev/null -D - -X POST "$BASE/admin/products/pdf" -H "Content-Type: application/json" -d "{\"ids\":[$IDA]}" 2>/dev/null | grep -i content-disposition)
echo "$CD" | grep -q 'lakomka-podarki-' && echo "$CD" | grep -qi 'attachment' && ok "Content-Disposition: attachment, lakomka-podarki-*.pdf" || bad "disposition: $CD"
head -c 4 "$PDFOUT" | grep -q '%PDF' && ok "тело начинается с %PDF" || bad "не PDF на выходе"
grep -aq "/DCTDecode" "$PDFOUT" && ok "страницы-картинки DCTDecode внутри" || bad "нет DCTDecode"
PGCNT=$(grep -ac "/Type /Page " "$PDFOUT"); [ "$PGCNT" = "1" ] && ok "2 товара → 1 страница A4" || bad "страниц: $PGCNT"
SIZE=$(stat -c%s "$PDFOUT" 2>/dev/null); [ "${SIZE:-0}" -gt 20000 ] && ok "размер PDF разумный ($SIZE б)" || bad "PDF подозрительно мал ($SIZE)"

# ── ошибки ──
E1=$(curl -s -b "$CJ" -o /dev/null -w '%{http_code}' -X POST "$BASE/admin/products/pdf" -H "Content-Type: application/json" -d '{"ids":[]}')
[ "$E1" = "422" ] && ok "пустой ids → 422" || bad "пустой ids: $E1"
E2=$(curl -s -b "$CJ" -o /dev/null -w '%{http_code}' -X POST "$BASE/admin/products/pdf" -H "Content-Type: application/json" -d '{"ids":[99999999]}')
[ "$E2" = "422" ] && ok "несуществующий id → 422" || bad "несуществующий: $E2"
E3=$(curl -s -b "$CJ" -o /dev/null -w '%{http_code}' -X POST "$BASE/admin/products/pdf" -H "Content-Type: application/json" -d "{\"ids\":[$IDD]}")
[ "$E3" = "422" ] && ok "удалённый товар → 422 (не попадает в PDF)" || bad "удалённый: $E3"
E4=$(curl -s -b "$CJ" -o /dev/null -w '%{http_code}' -X POST "$BASE/admin/products/pdf" -H "Content-Type: application/json" -d 'not-json')
[ "$E4" = "400" ] && ok "битый JSON → 400" || bad "битый JSON: $E4"
E5=$(curl -s -b "$CJ" -o /dev/null -w '%{http_code}' -X POST "$BASE/admin/products/pdf" -H "Content-Type: application/json" -d "{\"ids\":[$IDA,$IDA,$IDA]}")
[ "$E5" = "200" ] && ok "дубликаты ids схлопнулись → 200" || bad "дубликаты: $E5"

# ── журнал ──
$PHP -r '
require $argv[1]."/backend/config.php"; require $argv[1]."/backend/src/Database.php";
echo (int)Database::get()->query("SELECT COUNT(*) FROM admin_log WHERE action = \"products.pdf\"")->fetchColumn();
' "$ROOT" > /tmp/t131-log.out 2>&1
[ "$(cat /tmp/t131-log.out)" != "0" ] && ok "AdminLog: записи products.pdf есть ($(cat /tmp/t131-log.out))" || bad "admin_log пуст"

# ── визуальная проверка страницы PDF через poppler ──
pdftoppm -r 40 -jpeg "$PDFOUT" /tmp/t131-api 2>/dev/null && [ -f /tmp/t131-api-1.jpg ] \
  && ok "poppler рендерит API-страницу" || bad "poppler не отрендерил"

# ── уборка ──
$PHP -r '
require $argv[1]."/backend/config.php"; require $argv[1]."/backend/src/Database.php";
$pdo = Database::get();
foreach (["t131-a","t131-b","t131-dead"] as $s) {
  $pdo->prepare("DELETE FROM product_images WHERE product_id IN (SELECT id FROM products WHERE slug = ?)")->execute([$s]);
  $pdo->prepare("DELETE FROM products WHERE slug = ?")->execute([$s]);
}
echo "clean";
' "$ROOT" > /dev/null 2>&1 && rm -rf "$UPD/products/t131-a" && ok "уборка: товары и картинки удалены" || bad "уборка не удалась"

echo
echo "═══ Итог: PASS=$PASS FAIL=$FAIL ═══"
[ "$FAIL" = "0" ]
