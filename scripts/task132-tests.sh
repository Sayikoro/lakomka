#!/bin/bash
# Task 132: обложка (первая страница) и последняя страница генеративного PDF.
# Настройки pdf_cover_first/pdf_cover_last (только /uploads/…), загрузка
# POST /api/admin/uploads/pdf-page, страницы встают первой/последней в PDF.
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

echo "── 1. Синтаксис, типы, линт ──"
for f in backend/src/Controllers/AdminSettingsController.php \
         backend/src/Controllers/AdminUploadController.php \
         backend/src/Controllers/AdminProductsController.php \
         backend/public/index.php; do
  $PHP -l "$ROOT/$f" > /dev/null 2>&1 && ok "php -l $(basename $f)" || bad "php -l $(basename $f)"
done
./node_modules/.bin/tsc --noEmit > /tmp/t132-tsc.log 2>&1 && ok "tsc --noEmit чист" || bad "tsc: $(head -3 /tmp/t132-tsc.log)"
./node_modules/.bin/eslint src/components/admin/SettingsForm.tsx src/app/admin/settings/page.tsx > /tmp/t132-eslint.log 2>&1 \
  && ok "eslint SettingsForm/settings чист" || bad "eslint: $(grep -E 'error|warning' /tmp/t132-eslint.log | head -2)"

echo "── 2. Маркеры ──"
rg -q "'pdf_cover_first',\n\s+'pdf_cover_last'," -U "$ROOT/backend/src/Controllers/AdminSettingsController.php" \
  && ok "настройки: ключи pdf_cover_first/last в KEYS" || bad "ключей нет в KEYS"
if rg -q "PUBLIC_KEYS" "$ROOT/backend/src/Controllers/AdminSettingsController.php"; then
  BLOCK=$(sed -n '/private const PUBLIC_KEYS/,/];/p' "$ROOT/backend/src/Controllers/AdminSettingsController.php")
  echo "$BLOCK" | grep -q pdf_cover || ok "настройки: pdf_cover_* НЕ публичные" || bad "обложки утекают в публичные ключи"
fi
rg -q "preg_match\('#\^/uploads/#', \\\$u\)" "$ROOT/backend/src/Controllers/AdminSettingsController.php" \
  && ok "настройки: валидация только /uploads/…" || bad "нет валидации /uploads"
rg -q "public static function savePdfPageImage" "$ROOT/backend/src/Controllers/AdminUploadController.php" \
  && ok "upload: savePdfPageImage()" || bad "нет savePdfPageImage"
rg -q "uploadsRoot\(\) \. '/pdf'" "$ROOT/backend/src/Controllers/AdminUploadController.php" \
  && ok "upload: каталог uploads/pdf" || bad "каталог не uploads/pdf"
rg -q '/api/admin/uploads/pdf-page' "$ROOT/backend/public/index.php" && ok "роут /api/admin/uploads/pdf-page" || bad "нет роута"
rg -q "Auth::requireEditor" "$ROOT/backend/src/Controllers/AdminUploadController.php" \
  && ok "upload: requireEditor" || bad "нет requireEditor"
rg -q 'pdf_cover_first' "$ROOT/backend/src/Controllers/AdminProductsController.php" \
  && ok "pdf: читает настройки обложек" || bad "pdf не читает настройки"
rg -q 'renderPdfImagePage' "$ROOT/backend/src/Controllers/AdminProductsController.php" \
  && ok "pdf: рендер страниц-обложек" || bad "нет renderPdfImagePage"
rg -q 'pdfSettingFile' "$ROOT/backend/src/Controllers/AdminProductsController.php" \
  && ok "pdf: pdfSettingFile (realpath-контейнер)" || bad "нет pdfSettingFile"
rg -q 'uploadPdfPageImage' "$ROOT/src/components/admin/SettingsForm.tsx" \
  && ok "UI: uploadPdfPageImage в SettingsForm" || bad "нет uploadPdfPageImage"
rg -q 'admin/uploads/pdf-page' "$ROOT/src/components/admin/SettingsForm.tsx" \
  && ok "UI: бьёт в /admin/uploads/pdf-page" || bad "нет вызова API загрузки"
rg -qF 'PDF по подаркам' "$ROOT/src/components/admin/SettingsForm.tsx" \
  && ok "UI: блок «PDF по подаркам»" || bad "нет блока"
rg -q 'pdf_cover_first: form.pdf_cover_first.trim()' "$ROOT/src/components/admin/SettingsForm.tsx" \
  && ok "UI: обложки уходят в сохранение настроек" || bad "нет полей в save"
rg -q 'pdf_cover_first: string' "$ROOT/src/app/admin/settings/page.tsx" \
  && ok "UI: тип AdminSettings дополнен" || bad "нет поля в типе"

echo "── 3. Юнит: renderPdfImagePage / pdfSettingFile ──"
mkdir -p /tmp/t132u "$ROOT/public/uploads/pdf"
$PHP -r '
require $argv[1]."/backend/config.php"; require $argv[1]."/backend/src/Database.php";
require $argv[1]."/backend/src/Controllers/AdminProductsController.php";
$m = new ReflectionMethod("AdminProductsController", "renderPdfImagePage");

/* 1) нормальная картинка 800×1131 → страница 1240×1754 */
$im = imagecreatetruecolor(800, 1131); imagefill($im,0,0,imagecolorallocate($im,200,30,30));
imagejpeg($im, "/tmp/t132u/src.jpg", 85);;
$r1 = $m->invoke(null, "/tmp/t132u/src.jpg", "/tmp/t132u/page.jpg");
$s = $r1 ? getimagesize("/tmp/t132u/page.jpg") : [0,0];
echo (int)$r1, "|", $s[0], "x", $s[1];
' "$ROOT" > /tmp/t132u/unit.out 2>&1
U=$(cat /tmp/t132u/unit.out)
echo "$U" | grep -q '^1|1240x1754' && ok "рендер: 800×1131 → страница 1240×1754" || bad "рендер: $U"
$PHP -r '
require $argv[1]."/backend/config.php";
require $argv[1]."/backend/src/Controllers/AdminProductsController.php";
$m = new ReflectionMethod("AdminProductsController", "renderPdfImagePage"); 
file_put_contents("/tmp/t132u/broken.jpg", "это не картинка вовсе");
echo (int)$m->invoke(null, null, "/tmp/t132u/x.jpg"),
     "|", (int)$m->invoke(null, "/tmp/t132u/nope.jpg", "/tmp/t132u/x.jpg"),
     "|", (int)$m->invoke(null, "/tmp/t132u/broken.jpg", "/tmp/t132u/x.jpg");
' "$ROOT" > /tmp/t132u/unit2.out 2>&1
U2=$(cat /tmp/t132u/unit2.out)
[ "$U2" = "0|0|0" ] && ok "fail-soft: null / нет файла / битая → страница пропущена" || bad "fail-soft: $U2"
$PHP -r '
require $argv[1]."/backend/config.php";
require $argv[1]."/backend/src/Controllers/AdminProductsController.php";
$m = new ReflectionMethod("AdminProductsController", "pdfSettingFile"); 
file_put_contents($argv[1]."/public/uploads/pdf/unit-probe.jpg", "jpeg-bytes");
echo $m->invoke(null, "/uploads/pdf/unit-probe.jpg") === null ? "null" : "file",
     "|", $m->invoke(null, "/uploads/pdf/absent-404.jpg") === null ? "null" : "file",
     "|", $m->invoke(null, "https://evil.example.com/x.jpg") === null ? "null" : "file",
     "|", $m->invoke(null, "/uploads/../backend/config.php") === null ? "null" : "file",
     "|", $m->invoke(null, "") === null ? "null" : "file";
' "$ROOT" > /tmp/t132u/unit3.out 2>&1
U3=$(cat /tmp/t132u/unit3.out)
[ "$U3" = "file|null|null|null|null" ] && ok "pdfSettingFile: свой файл → путь; 404/внешний/../пусто → null" || bad "pdfSettingFile: $U3"
rm -f "$ROOT/public/uploads/pdf/unit-probe.jpg"

echo "── 4. API (:8053) ──"
PORT=8053; BASE="http://127.0.0.1:$PORT/api"; LOG=/tmp/t132-php.log
export PHP_CLI_SERVER_WORKERS=8
pkill -f "127.0.0.1:$PORT" 2>/dev/null; sleep 1
( setsid "$PHP" -S 127.0.0.1:$PORT backend/public/index.php >"$LOG" 2>&1 & )
UP=1
for i in $(seq 1 30); do curl -s "$BASE/health" | grep -q ok && { UP=0; break; }; sleep 0.3; done
[ "$UP" = "0" ] && ok "сервер :$PORT поднялся" || { bad "сервер не поднялся"; exit 1; }

ANON=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/admin/uploads/pdf-page" -F "file=@/tmp/t132u/src.jpg;type=image/jpeg")
[ "$ANON" = "401" ] && ok "аноним → загрузка обложки 401" || bad "аноним: $ANON"

CJ=/tmp/t132-cookies.txt
LOGIN=$(curl -s -c "$CJ" -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d '{"email":"admin@lakomka.local","password":"Lakomka2026!"}')
echo "$LOGIN" | grep -q "token\|\"ok\"" && ok "логин администратором" || bad "логин: $LOGIN"

# ── загрузка обложек ──
$PHP -r '
$im = imagecreatetruecolor(800, 1131); imagefill($im,0,0,imagecolorallocate($im,200,30,30));
imagejpeg($im, "/tmp/t132u/cover-red.jpg", 85);;
$im = imagecreatetruecolor(800, 1131); imagefill($im,0,0,imagecolorallocate($im,30,140,50));
imagejpeg($im, "/tmp/t132u/cover-green.jpg", 85);;
' && ok "фикстуры обложек созданы" || bad "фикстуры не создались"
UP1=$(curl -s -b "$CJ" -X POST "$BASE/admin/uploads/pdf-page" -F "file=@/tmp/t132u/cover-red.jpg;type=image/jpeg")
URL1=$(echo "$UP1" | python3 -c "import json,sys; print(json.load(sys.stdin).get('data',{}).get('url',''))" 2>/dev/null)
case "$URL1" in /uploads/pdf/*.jpg|/uploads/pdf/*.webp) ok "upload jpg → $URL1";; *) bad "upload: $UP1";; esac
REL1="$ROOT/public$URL1"
[ -s "$REL1" ] && $PHP -r '$s=@getimagesize($argv[1]); echo $s? "img":"no";' "$REL1" 2>/dev/null | grep -q img \
  && ok "файл обложки на диске, картинка читается" || bad "файла/картинки нет: $REL1"
UP2=$(curl -s -b "$CJ" -X POST "$BASE/admin/uploads/pdf-page" -F "file=@/tmp/t132u/cover-green.jpg;type=image/jpeg")
URL2=$(echo "$UP2" | python3 -c "import json,sys; print(json.load(sys.stdin).get('data',{}).get('url',''))" 2>/dev/null)
case "$URL2" in /uploads/pdf/*) ok "upload второй обложки → $URL2";; *) bad "upload2: $UP2";; esac
echo "не картинка" > /tmp/t132u/fake.jpg
UP3=$(curl -s -b "$CJ" -o /dev/null -w '%{http_code}' -X POST "$BASE/admin/uploads/pdf-page" -F "file=@/tmp/t132u/fake.jpg;type=image/jpeg")
[ "$UP3" = "422" ] && ok "текст вместо картинки → 422" || bad "мусор принят: $UP3"

# ── валидация настроек ──
V1=$(curl -s -b "$CJ" -o /dev/null -w '%{http_code}' -X POST "$BASE/admin/settings" -H "Content-Type: application/json" -d '{"pdf_cover_first":"https://evil.example.com/x.jpg"}')
[ "$V1" = "422" ] && ok "внешний URL обложки → 422" || bad "внешний URL принят: $V1"
V2=$(curl -s -b "$CJ" -o /dev/null -w '%{http_code}' -X POST "$BASE/admin/settings" -H "Content-Type: application/json" -d '{"pdf_cover_first":"/uploads/../backend/config.php"}')
[ "$V2" = "422" ] && ok "обход пути ../ → 422" || bad "../ принят: $V2"
SAVED=$(curl -s -b "$CJ" -X POST "$BASE/admin/settings" -H "Content-Type: application/json" -d "{\"pdf_cover_first\":\"$URL1\",\"pdf_cover_last\":\"$URL2\"}")
echo "$SAVED" | grep -q '"ok":true' && ok "обложки сохранены в настройках" || bad "save: $SAVED"
GOT=$(curl -s -b "$CJ" "$BASE/admin/settings")
echo "$GOT" | grep -q "$URL1" && echo "$GOT" | grep -q "$URL2" && ok "GET настроек отдаёт обложки" || bad "GET не отдаёт обложки"
PUB=$(curl -s "$BASE/settings/public")
echo "$PUB" | grep -q pdf_cover && bad "утечка: pdf_cover в /settings/public" || ok "витрина НЕ получает pdf_cover_*"

# ── сид: 7 товаров → 2 карточные страницы ──
$PHP -r '
require $argv[1]."/backend/config.php"; require $argv[1]."/backend/src/Database.php";
$pdo = Database::get();
$pdo->prepare("DELETE FROM products WHERE slug LIKE \"t132-%\"")->execute();
for ($i = 1; $i <= 7; $i++) {
  $pdo->prepare("INSERT INTO products (name, type, slug, price_kopecks, stock_qty, show_in_catalog, is_published) VALUES (?, \"simple\", ?, 120000, 2, 1, 1)")
      ->execute(["Тест-132 Подарок $i", sprintf("t132-p%02d", $i)]);
}
foreach ($pdo->query("SELECT id FROM products WHERE slug LIKE \"t132-%\"") as $r) echo $r["id"], " ";
' "$ROOT" > /tmp/t132-ids.out 2>&1
IDS=$(tr ' ' ',' < /tmp/t132-ids.out | sed 's/,$//;s/,*$//')
[ "$(wc -w < /tmp/t132-ids.out)" = "7" ] && ok "7 тестовых товаров созданы" || bad "сид: $(cat /tmp/t132-ids.out)"

# ── PDF без обложек ──
curl -s -b "$CJ" -X POST "$BASE/admin/settings" -H "Content-Type: application/json" \
  -d '{"pdf_cover_first":"","pdf_cover_last":""}' > /dev/null
P0=/tmp/t132-nocover.pdf
C0=$(curl -s -b "$CJ" -o "$P0" -w '%{http_code}' -X POST "$BASE/admin/products/pdf" \
  -H "Content-Type: application/json" -d "{\"ids\":[$IDS]}")
[ "$C0" = "200" ] && ok "PDF без обложек → 200" || bad "PDF: HTTP $C0"
N0=$(grep -ac "/Type /Page " "$P0"); [ "$N0" = "2" ] && ok "7 товаров → 2 страницы" || bad "страниц: $N0"

# ── PDF с обложками: первая — красная, последняя — зелёная ──
curl -s -b "$CJ" -X POST "$BASE/admin/settings" -H "Content-Type: application/json" \
  -d "{\"pdf_cover_first\":\"$URL1\",\"pdf_cover_last\":\"$URL2\"}" > /dev/null
P1=/tmp/t132-covered.pdf
C1=$(curl -s -b "$CJ" -o "$P1" -w '%{http_code}' -X POST "$BASE/admin/products/pdf" \
  -H "Content-Type: application/json" -d "{\"ids\":[$IDS]}")
[ "$C1" = "200" ] && ok "PDF с обложками → 200" || bad "PDF с обложками: HTTP $C1"
N1=$(grep -ac "/Type /Page " "$P1"); [ "$N1" = "4" ] && ok "обложка + 2 карточных + финал = 4 страницы" || bad "страниц: $N1"
rm -rf /tmp/t132-render && mkdir -p /tmp/t132-render
pdftoppm -r 30 -jpeg "$P1" /tmp/t132-render/pg 2>/dev/null
if [ -f /tmp/t132-render/pg-1.jpg ] && [ -f /tmp/t132-render/pg-4.jpg ]; then
  $PHP -r '
$px = function($f) { $im = imagecreatefromjpeg($f); $w = imagesx($im); $h = imagesy($im);
  $c = imagecolorat($im, (int)($w / 2), (int)($h / 2));
  $r = ($c >> 16) & 0xFF; $g = ($c >> 8) & 0xFF; $b = $c & 0xFF;; return [$r,$g,$b]; };
$p1 = $px($argv[1]); /* центр первой страницы */
$p2 = $px($argv[2]); /* центр второй (карточки) */
$p4 = $px($argv[3]); /* центр последней */
printf("%s|%s|%s",
  ($p1[0] > 150 && $p1[1] < 110 && $p1[2] < 110) ? "red" : "no",
  ($p2[0] > 190 && $p2[1] > 190 && $p2[2] > 190) ? "white" : "no",
  ($p4[1] > 100 && $p4[0] < 110 && $p4[2] < 110) ? "green" : "no");
' /tmp/t132-render/pg-1.jpg /tmp/t132-render/pg-2.jpg /tmp/t132-render/pg-4.jpg > /tmp/t132-pix.out 2>&1
  PX=$(cat /tmp/t132-pix.out)
  [ "$PX" = "red|white|green" ] \
    && ok "порядок страниц: красная обложка → карточки → зелёный финал" || bad "пиксели: $PX"
else
  bad "poppler не отрендерил страницы"
fi

# ── fail-soft: файл обложки удалён с диска ──
rm -f "$ROOT/public$URL1"
P2=/tmp/t132-broken.pdf
C2=$(curl -s -b "$CJ" -o "$P2" -w '%{http_code}' -X POST "$BASE/admin/products/pdf" \
  -H "Content-Type: application/json" -d "{\"ids\":[$IDS]}")
N2=$(grep -ac "/Type /Page " "$P2")
[ "$C2" = "200" ] && [ "$N2" = "3" ] \
  && ok "битая обложка: PDF собирается без неё (3 стр.), HTTP 200" || bad "fail-soft: HTTP $C2, страниц $N2"

# ── журнал ──
$PHP -r '
require $argv[1]."/backend/config.php"; require $argv[1]."/backend/src/Database.php";
$r = Database::get()->query("SELECT details FROM admin_log WHERE action = \"products.pdf\" ORDER BY id DESC LIMIT 1")->fetchColumn();
echo (strpos((string)$r, "обложка/финал") !== false) ? "log-ok" : "log-no:" . $r;
' "$ROOT" > /tmp/t132-log.out 2>&1
grep -q log-ok /tmp/t132-log.out && ok "AdminLog помечает страницы обложек" || bad "журнал: $(cat /tmp/t132-log.out)"

# ── уборка ──
curl -s -b "$CJ" -X POST "$BASE/admin/settings" -H "Content-Type: application/json" \
  -d '{"pdf_cover_first":"","pdf_cover_last":""}' > /dev/null
$PHP -r '
require $argv[1]."/backend/config.php"; require $argv[1]."/backend/src/Database.php";
Database::get()->prepare("DELETE FROM products WHERE slug LIKE \"t132-%\"")->execute();
echo "clean";
' "$ROOT" > /dev/null 2>&1
rm -rf "$ROOT/public/uploads/pdf" && ok "уборка: товары/обложки/настройки сброшены" || bad "уборка не удалась"

echo
echo "═══ Итог: PASS=$PASS FAIL=$FAIL ═══"
[ "$FAIL" = "0" ]
