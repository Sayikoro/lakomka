#!/bin/bash
# Task 130: пагинация товаров без бесконечного цикла (20/страница, обновление после импорта),
# корзина файлов: названия подарков + обложки, скачивание именем подарка, крепкое
# восстановление (фолбэк имени/rename→копия/meta-до-переноса), «Очистить корзину».
# Регрессии отдельно: task121/122/120/118/117/116/115/114/112/110-tests.
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
for f in backend/src/Controllers/AdminFilesController.php backend/public/index.php; do
  $PHP -l "$ROOT/$f" > /dev/null 2>&1 && ok "php -l $f" || bad "php -l $f"
done
if npx tsc --noEmit > /tmp/t130-tsc.log 2>&1; then ok "tsc --noEmit чист"; else bad "tsc: $(head -3 /tmp/t130-tsc.log)"; fi
# eslint: только правленные чистые файлы (ProductsImportExport имеет 2 ДОСЕШНЫХ
# ошибки set-state-in-effect ещё на master — проверить не ломая их нельзя, типы гоняет tsc)
if npx eslint src/components/admin/ProductsTable.tsx src/components/admin/FilesManager.tsx > /tmp/t130-eslint.log 2>&1; then
  ok "eslint ProductsTable+FilesManager чист"
else
  bad "eslint: $(grep -E 'error|warning' /tmp/t130-eslint.log | head -2)"
fi

echo "── 2. Маркеры ──"
# пагинация
rg -q 'useState\(20\)' "$ROOT/src/components/admin/ProductsTable.tsx" && ok "таблица: 20 товаров на странице по умолчанию" || bad "нет per_page=20"
rg -q 'priceActive, priceLo, priceHi, weightActive, weightLo, weightHi' "$ROOT/src/components/admin/ProductsTable.tsx" && ok "таблица: deps из примитивов (без facets)" || bad "deps не исправлены"
DEPSBLOCK=$(sed -n '/eslint-disable-next-line react-hooks\/exhaustive-deps/,/^  \]);/p' "$ROOT/src/components/admin/ProductsTable.tsx" | head -12)
echo "$DEPSBLOCK" | grep -vE '^\s*(\*|/\*)' | grep -q 'facets' && bad "в deps остался объект facets — цикл вернётся" || ok "в deps нет объекта facets"
rg -q 'lakomka-products-changed' "$ROOT/src/components/admin/ProductsTable.tsx" && ok "таблица: слушает lakomka-products-changed" || bad "нет слушателя события"
rg -qF 'dispatchEvent(new Event("lakomka-products-changed"))' "$ROOT/src/components/admin/ProductsImportExport.tsx" && ok "импорт: шлёт lakomka-products-changed" || bad "импорт не шлёт событие"
# корзина: бэкенд
rg -q 'meta.json ДО переноса' "$ROOT/backend/src/Controllers/AdminFilesController.php" && ok "корзина: meta.json пишется ДО переноса" || bad "meta после переноса"
rg -q 'public static function trashEmpty' "$ROOT/backend/src/Controllers/AdminFilesController.php" && ok "контроллер: trashEmpty()" || bad "нет trashEmpty"
rg -q 'AdminFilesController::trashEmpty' "$ROOT/backend/public/index.php" && ok "роут /api/admin/files/trash-empty" || bad "нет роута trash-empty"
rg -qF 'count($entries) === 1' "$ROOT/backend/src/Controllers/AdminFilesController.php" && ok "restore: фолбэк на единственный файл позиции" || bad "нет фолбэка имени"
rg -q 'private static function copyRecursive' "$ROOT/backend/src/Controllers/AdminFilesController.php" && ok "restore: копия при неудачном rename" || bad "нет copyRecursive"
rg -qF 'scandir($dir, SCANDIR_SORT_NONE)' "$ROOT/backend/src/Controllers/AdminFilesController.php" && ok "rrmdir: scandir (видит точечные файлы)" || bad "rrmdir на glob"
rg -q "no_meta" "$ROOT/backend/src/Controllers/AdminFilesController.php" && ok "trashList: позиции без meta.json показываются" || bad "нет no_meta"
rg -qF "'thumb' => \$product['thumb']" "$ROOT/backend/src/Controllers/AdminFilesController.php" && ok "trashList: подарок с обложкой в позициях" || bad "нет product в trashList"
rg -q '\$_GET\[.as.\]' "$ROOT/backend/src/Controllers/AdminFilesController.php" && ok "download: ?as= переименование при скачивании" || bad "нет as="
# корзина: фронт
rg -q 'trash-empty' "$ROOT/src/components/admin/FilesManager.tsx" && ok "корзина UI: бьёт в trash-empty" || bad "нет вызова trash-empty"
rg -qF 'Очистить корзину' "$ROOT/src/components/admin/FilesManager.tsx" && ok "корзина UI: кнопка «Очистить корзину»" || bad "нет кнопки"
rg -q 'trashDownloadUrl' "$ROOT/src/components/admin/FilesManager.tsx" && ok "корзина UI: скачивание с именем подарка (as=)" || bad "нет trashDownloadUrl"
rg -q 'product\?\.thumb' "$ROOT/src/components/admin/FilesManager.tsx" && ok "корзина UI: обложка подарка в строке" || bad "нет обложки"
rg -qF '🎁' "$ROOT/src/components/admin/FilesManager.tsx" && ok "корзина UI: название подарка в строке" || bad "нет названия подарка"
rg -q 'без meta' "$ROOT/src/components/admin/FilesManager.tsx" && ok "корзина UI: бейдж «без meta»" || bad "нет бейджа"

echo "── 3. API (:8042) ──"
PORT=8042; BASE="http://127.0.0.1:$PORT/api"; LOG=/tmp/t130-php.log
export PHP_CLI_SERVER_WORKERS=8
pkill -f "127.0.0.1:$PORT" 2>/dev/null; sleep 1
( setsid "$PHP" -S 127.0.0.1:$PORT backend/public/index.php >"$LOG" 2>&1 & )
UP=1
for i in $(seq 1 30); do curl -s "$BASE/health" | grep -q ok && { UP=0; break; }; sleep 0.3; done
[ "$UP" = "0" ] && ok "сервер :$PORT поднялся" || { bad "сервер не поднялся"; exit 1; }

ANON=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/admin/files/trash-empty")
[ "$ANON" = "401" ] && ok "аноним → trash-empty 401" || bad "аноним: $ANON"

CJ=/tmp/t130-cookies.txt
LOGIN=$(curl -s -c "$CJ" -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d '{"email":"admin@lakomka.local","password":"Lakomka2026!"}')
echo "$LOGIN" | grep -q "token\|\"ok\"" && ok "логин администратором" || bad "логин: $LOGIN"

# ── пагинация: 20/страница, pages, легаси ──
PG=$(curl -s -b "$CJ" "$BASE/admin/products?page=1&per_page=20")
CNT=$(echo "$PG" | python3 -c "import json,sys; print(len(json.load(sys.stdin)['data']))" 2>/dev/null)
[ "${CNT:-0}" = "20" ] && ok "пагинация: per_page=20 отдаёт 20 строк ($CNT)" || bad "строк на странице: $CNT"
TOTAL=$(jget "$PG" total); PAGES=$(jget "$PG" pages)
EXPECT_PAGES=$(python3 -c "import math; print(math.ceil($TOTAL/20))" 2>/dev/null)
[ "$PAGES" = "$EXPECT_PAGES" ] && ok "пагинация: pages=$PAGES согласован с total=$TOTAL" || bad "pages=$PAGES, ожидалось $EXPECT_PAGES"
LEG=$(curl -s -b "$CJ" "$BASE/admin/products")
echo "$LEG" | grep -q '"pages"' && bad "легаси-режим неожиданно отдал pages" || ok "легаси-режим (без page=) жив — без pages"

# ── песочница: товары и файлы ──
$PHP -r '
require $argv[1]."/backend/config.php"; require $argv[1]."/backend/src/Database.php";
$pdo = Database::get();
foreach (["t130-test","t130-dir"] as $s) {
  $pdo->prepare("DELETE FROM product_images WHERE product_id IN (SELECT id FROM products WHERE slug = ?)")->execute([$s]);
  $pdo->prepare("DELETE FROM products WHERE slug = ?")->execute([$s]);
}
$pdo->exec("INSERT INTO products (name, type, slug, price_kopecks, stock_qty, show_in_catalog, is_published) VALUES (\"Тест-130 Подарок\", \"simple\", \"t130-test\", 150000, 5, 1, 1)");
$pdo->exec("INSERT INTO products (name, type, slug, price_kopecks, stock_qty, show_in_catalog, is_published) VALUES (\"Тест-130 Из Папки\", \"simple\", \"t130-dir\", 90000, 3, 1, 1)");
echo "db-ok";
' "$ROOT" > /dev/null 2>&1 && ok "тестовые товары созданы" || bad "товары не создались"
UPD="$ROOT/public/uploads"
rm -rf "$UPD/products/t130-test" "$UPD/products/t130-dir" "$UPD/products/t130-orphan" "$UPD/products/t130-dl"
mkdir -p "$UPD/products/t130-test" "$UPD/products/t130-dir" "$UPD/products/t130-orphan" "$UPD/products/t130-dl"
echo "video" > "$UPD/products/t130-test/video-0.mov"
$PHP -r '$im = imagecreatetruecolor(60, 45); imagefill($im, 0, 0, imagecolorallocate($im, 90, 160, 220)); imagejpeg($im, $argv[1], 90);' "$UPD/products/t130-test/0.jpg" 2>/dev/null
echo "folderfile" > "$UPD/products/t130-dir/manual.pdf"
echo "orphan" > "$UPD/products/t130-orphan/1.jpg"
echo "dl" > "$UPD/products/t130-dl/x.jpg"
# картинка привязана (даёт обложку), видео — НЕ привязано (иначе в корзину нельзя)
$PHP -r '
require $argv[1]."/backend/config.php"; require $argv[1]."/backend/src/Database.php";
$pdo = Database::get();
$pid = (int)$pdo->query("SELECT id FROM products WHERE slug = \"t130-test\"")->fetchColumn();
$st = $pdo->prepare("INSERT INTO product_images (product_id, url, alt, media_type, sort_order) VALUES (?, \"/uploads/products/t130-test/0.jpg\", \"Тест-130 Подарок\", \"image\", 1)");
$st->execute([$pid]);
echo "bind-ok";
' "$ROOT" > /dev/null 2>&1 && ok "обложка привязана к товару" || bad "привязка не встала"

DEL=$(curl -s -b "$CJ" -X POST "$BASE/admin/files/delete" -H "Content-Type: application/json" -d '{"path":"media/products/t130-test/video-0.mov"}')
echo "$DEL" | grep -q '"trashed":true' && ok "видео убрано в корзину" || bad "delete: $DEL"

TR=$(curl -s -b "$CJ" "$BASE/admin/files/trash")
ITEM=$(echo "$TR" | python3 -c "
import json,sys
its=json.load(sys.stdin)['data']['items']
print(json.dumps(next((i for i in its if i.get('orig')=='products/t130-test/video-0.mov'), {}), ensure_ascii=False))")
[ "$(jget "$ITEM" product.name)" = "Тест-130 Подарок" ] && ok "корзина: позиция знает подарок по папке" || bad "product.name: $(jget "$ITEM" product.name)"
[ "$(jget "$ITEM" product.thumb)" = "/uploads/products/t130-test/0.jpg" ] && ok "корзина: обложка подарка = первая картинка" || bad "thumb: $(jget "$ITEM" product.thumb)"
IDA=$(jget "$ITEM" id)
RES=$(curl -s -b "$CJ" -X POST "$BASE/admin/files/restore" -H "Content-Type: application/json" -d "{\"id\":\"$IDA\"}")
echo "$RES" | grep -q '"ok":true' && [ -f "$UPD/products/t130-test/video-0.mov" ] && ok "восстановление: файл вернулся на место" || bad "restore: $RES"

# фолбэк имени: файл внутри позиции переименован (meta.name не совпадает)
curl -s -b "$CJ" -X POST "$BASE/admin/files/delete" -H "Content-Type: application/json" -d '{"path":"media/products/t130-test/video-0.mov"}' > /dev/null
TR=$(curl -s -b "$CJ" "$BASE/admin/files/trash")
IDA=$(echo "$TR" | python3 -c "
import json,sys
its=json.load(sys.stdin)['data']['items']
print(next((i['id'] for i in its if i.get('orig')=='products/t130-test/video-0.mov'),''))")
ITEMDIR="$UPD/.trash/$IDA"
mv "$ITEMDIR/video-0.mov" "$ITEMDIR/wrong-name.mov" 2>/dev/null
RES=$(curl -s -b "$CJ" -X POST "$BASE/admin/files/restore" -H "Content-Type: application/json" -d "{\"id\":\"$IDA\"}")
echo "$RES" | grep -q '"ok":true' && [ -f "$UPD/products/t130-test/video-0.mov" ] && ok "фолбэк: восстановлено при несовпавшем meta.name" || bad "фолбэк restore: $RES"

# позиция без meta.json: видна в списке, restore даёт внятный отказ, стереть можно
FAKE="20990101-000001-abcdef"
mkdir -p "$UPD/.trash/$FAKE"; echo "lost" > "$UPD/.trash/$FAKE/0.jpg"
TR=$(curl -s -b "$CJ" "$BASE/admin/files/trash")
NOM=$(echo "$TR" | python3 -c "
import json,sys
its=json.load(sys.stdin)['data']['items']
print(json.dumps(next((i for i in its if i['id']=='$FAKE'), {}), ensure_ascii=False))")
[ "$(jget "$NOM" no_meta)" = "true" ] && ok "позиция без meta видна в списке (no_meta)" || bad "no_meta: $(jget "$NOM" no_meta)"
RES=$(curl -s -b "$CJ" -X POST "$BASE/admin/files/restore" -H "Content-Type: application/json" -d "{\"id\":\"$FAKE\"}")
echo "$RES" | grep -q "meta.json" && ok "restore без meta: внятная ошибка с подсказкой" || bad "restore no-meta: $RES"
curl -s -b "$CJ" -X POST "$BASE/admin/files/delete" -H "Content-Type: application/json" -d "{\"path\":\"media/.trash/$FAKE\"}" | grep -q '"purged":true' && ok "позицию без meta можно стереть" || bad "purge no-meta"

# скачивание с as= (имя подарка)
DL=$(curl -s -b "$CJ" -D - -o /dev/null "$BASE/admin/files/download?path=media%2Fproducts%2Ft130-dl%2Fx.jpg&as=%D0%9D%D0%B0%D0%B7%D0%B2%D0%B0%D0%BD%D0%B8%D0%B5%20%D0%BF%D0%BE%D0%B4%D0%B0%D1%80%D0%BA%D0%B0.jpg" 2>/dev/null)
echo "$DL" | grep -qi 'Content-Disposition: attachment; filename="Название подарка.jpg"' && ok "download as=: файл уходит именем подарка" || bad "as=: $(echo "$DL" | grep -i disposition | head -1)"

# папка товара (без привязок) в корзину: подарок опознаётся по папке, возврат целым
curl -s -b "$CJ" -X POST "$BASE/admin/files/delete" -H "Content-Type: application/json" -d '{"path":"media/products/t130-dir"}' | grep -q '"trashed":true' && ok "папка товара убрана в корзину" || bad "папка не удалилась (привязки?)"
TR=$(curl -s -b "$CJ" "$BASE/admin/files/trash")
IDIR=$(echo "$TR" | python3 -c "
import json,sys
its=json.load(sys.stdin)['data']['items']
print(next((i['id'] for i in its if i.get('orig')=='products/t130-dir'),''))")
IT=$(echo "$TR" | python3 -c "
import json,sys
its=json.load(sys.stdin)['data']['items']
print(json.dumps(next((i for i in its if i.get('orig')=='products/t130-dir'), {}), ensure_ascii=False))")
[ "$(jget "$IT" product.name)" = "Тест-130 Из Папки" ] && ok "корзина: папка опознаёт подарок по slug" || bad "folder product: $(jget "$IT" product.name)"
[ "$(jget "$IT" is_dir)" = "true" ] && ok "корзина: позиция-папка помечена is_dir" || bad "is_dir"
curl -s -b "$CJ" -X POST "$BASE/admin/files/restore" -H "Content-Type: application/json" -d "{\"id\":\"$IDIR\"}" | grep -q '"ok":true' && [ -f "$UPD/products/t130-dir/manual.pdf" ] && ok "папка вернулась с содержимым" || bad "restore папки"

# Очистить корзину: всё стирается одним вызовом
echo "orphan" > "$UPD/products/t130-orphan/2.jpg"
curl -s -b "$CJ" -X POST "$BASE/admin/files/delete" -H "Content-Type: application/json" -d '{"path":"media/products/t130-orphan/1.jpg"}' > /dev/null
curl -s -b "$CJ" -X POST "$BASE/admin/files/delete" -H "Content-Type: application/json" -d '{"path":"media/products/t130-orphan/2.jpg"}' > /dev/null
EM=$(curl -s -b "$CJ" -X POST "$BASE/admin/files/trash-empty")
REMOVED=$(jget "$EM" data.removed)
[ "${REMOVED:-0}" -ge 2 ] && ok "trash-empty: удалено позиций [$REMOVED]" || bad "removed: $EM"
AFTER=$(curl -s -b "$CJ" "$BASE/admin/files/trash" | python3 -c "import json,sys; print(len(json.load(sys.stdin)['data']['items']))" 2>/dev/null)
[ "${AFTER:-9}" = "0" ] && ok "корзина пуста после очистки" || bad "в корзине осталось: $AFTER"
EM2=$(curl -s -b "$CJ" -X POST "$BASE/admin/files/trash-empty")
[ "$(jget "$EM2" data.removed)" = "0" ] && ok "повторная очистка: removed=0 (идемпотентна)" || bad "repeat: $EM2"

# точечный файл (.DS_Store) больше не блокирует удаление папки корзины
mkdir -p "$UPD/.trash/20990101-000002-feed01"; echo "x" > "$UPD/.trash/20990101-000002-feed01/.DS_Store"
curl -s -b "$CJ" -X POST "$BASE/admin/files/trash-empty" | grep -q '"ok":true' && [ ! -d "$UPD/.trash/20990101-000002-feed01" ] && ok "rrmdir стирает даже точечные файлы" || bad "точечные файлы остались"

# ── уборка ──
$PHP -r '
require $argv[1]."/backend/config.php"; require $argv[1]."/backend/src/Database.php";
$pdo = Database::get();
$pdo->exec("DELETE FROM product_images WHERE product_id IN (SELECT id FROM products WHERE slug LIKE \"t130-%\")");
$pdo->exec("DELETE FROM products WHERE slug LIKE \"t130-%\"");
echo "clean-ok";
' "$ROOT" > /dev/null 2>&1 && ok "тестовые товары удалены" || bad "уборка БД"
rm -rf "$UPD/products/t130-test" "$UPD/products/t130-dir" "$UPD/products/t130-orphan" "$UPD/products/t130-dl"

pkill -f "127.0.0.1:$PORT" 2>/dev/null
echo "═══ ИТОГ: PASS=$PASS FAIL=$FAIL ═══"
[ "$FAIL" = "0" ]
