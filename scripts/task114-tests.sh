#!/bin/bash
# Task 114: массовая оптимизация медиа + рецепты (свои граммовки/позиции/веса)
#            + снапшот сайта + метрика-блок + тулбар.
#   1) php -l ×5, tsc, маркеры новых фич в исходниках
#   2) API-тесты (dev-сервер :8024): рецепты (своя граммовка/позиция/вес),
#      картинки (список + конвертация в webp с ретаргетом ссылок, отказы),
#      снапшот (создать/список/скачать/удалить, имя-валидация),
#      metrika_code (публичные настройки, валидация)
#   3) содержимое снапшота (zip): сайт+uploads+база есть, мусора нет
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PHP="$(command -v php 2>/dev/null || true)"
[ -z "$PHP" ] && [ -x "$ROOT/.ztools/php" ] && PHP="$ROOT/.ztools/php"
[ -z "$PHP" ] && [ -x "$ROOT/../.ztools/php" ] && PHP="$ROOT/../.ztools/php"
[ -n "$PHP" ] || { echo "php не найден"; exit 1; }
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

echo "── 1. Синтаксис, типы, маркеры фич ──"
for f in backend/public/index.php backend/src/Controllers/AdminWeightRecipeController.php \
         backend/src/Controllers/AdminFilesController.php \
         backend/src/Controllers/AdminSiteUpdateController.php \
         backend/src/Controllers/AdminSettingsController.php; do
  $PHP -l "$ROOT/$f" > /dev/null 2>&1 && ok "php -l $f" || bad "php -l $f"
done
rg -q "weight_recipe_items" "$ROOT/backend/src/schema.sql" && ok "schema.sql: weight_recipe_items" || bad "schema.sql без weight_recipe_items"
[ -f "$ROOT/backend/migrations/005_weight_recipe_items.sql" ] && ok "миграция 005 на месте" || bad "нет миграции 005"

echo "── 2. TypeScript / ESLint (изменённые файлы) ──"
if npx tsc --noEmit > /tmp/t114-tsc.log 2>&1; then ok "tsc --noEmit чист"; else bad "tsc: $(head -3 /tmp/t114-tsc.log)"; fi
ESL_FILES="src/components/admin/MassMediaOptimizer.tsx src/components/admin/WeightRecipesViewer.tsx src/components/admin/SiteUpdateTab.tsx src/components/layout/AdminToolbar.tsx src/components/analytics/MetrikaBlock.tsx src/app/(shop)/layout.tsx src/lib/settings.ts src/components/admin/SettingsForm.tsx src/app/admin/settings/page.tsx src/app/admin/products/page.tsx"
if npx eslint $ESL_FILES > /tmp/t114-eslint.log 2>&1; then ok "eslint изменённых файлов 0"; else bad "eslint: $(grep -c error /tmp/t114-eslint.log) ошибок"; fi
rg -q "Массовая оптимизация" "$ROOT/src/components/admin/MassMediaOptimizer.tsx" && ok "UI кнопки массовой оптимизации" || bad "нет кнопок массовой оптимизации"
rg -q "Редактировать товар" "$ROOT/src/components/layout/AdminToolbar.tsx" && ok "тулбар: кнопка «Редактировать товар»" || bad "тулбар без кнопки редактирования"
rg -q "AdminToolbar" "$ROOT/src/app/(shop)/layout.tsx" && ok "тулбар смонтирован в (shop)-layout" || bad "тулбар не смонтирован"
rg -q "MetrikaBlock" "$ROOT/src/app/(shop)/layout.tsx" && ok "MetrikaBlock в (shop)-layout" || bad "MetrikaBlock не подключён"
rg -q "Создать архив текущего сайта" "$ROOT/src/components/admin/SiteUpdateTab.tsx" && ok "UI снапшота на вкладке Обновление" || bad "нет UI снапшота"

echo "── 3. API-тесты (dev-сервер :8024) ──"
PORT=8024; BASE="http://127.0.0.1:$PORT/api"; LOG=/tmp/t114-php.log
CJ=/tmp/t114-cookies.txt
pkill -f "127.0.0.1:$PORT" 2>/dev/null; sleep 1
( setsid "$PHP" -S 127.0.0.1:$PORT backend/public/index.php >"$LOG" 2>&1 & )
for i in $(seq 1 30); do curl -s "$BASE/health" | grep -q ok && break; sleep 0.3; done
curl -s "$BASE/health" | grep -q ok && ok "сервер :$PORT поднялся" || bad "сервер не поднялся"

LOGIN=$(curl -s -c "$CJ" -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d '{"email":"admin@lakomka.local","password":"Lakomka2026!"}')
[ -n "$(jget "$LOGIN" "data.token")" ] && ok "суперадмин залогинен" || bad "логин: $LOGIN"

# --- РЕЦЕПТЫ: своя граммовка ---
CW=$(curl -s -b "$CJ" -X POST "$BASE/admin/weight-recipes/weights" -H "Content-Type: application/json" -d '{"weight_g":7114}')
[ "$(jget "$CW" "data.ok")" = "true" ] && ok "создана своя граммовка 7114 г" || bad "createWeight: $CW"
LIST=$(curl -s -b "$CJ" "$BASE/admin/weight-recipes")
echo "$LIST" | grep -q '"weight_g":7114' && ok "граммовка 7114 в списке" || bad "7114 нет в списке"
CWBAD=$(curl -s -b "$CJ" -X POST "$BASE/admin/weight-recipes/weights" -H "Content-Type: application/json" -d '{"weight_g":-5}')
[ "$(jget "$CWBAD" "error")" != "" ] && ok "кривой вес отклонён (422)" || bad "кривой вес принят: $CWBAD"

# --- СВОЯ ПОЗИЦИЯ ---
CI=$(curl -s -b "$CJ" -X POST "$BASE/admin/weight-recipes/7114/custom" -H "Content-Type: application/json" -d '{"name":"Открытка-тест-114","quantity":2}')
CID=$(jget "$CI" "data.id")
[ -n "$CID" ] && ok "своя позиция добавлена (id=$CID)" || bad "addCustom: $CI"
SHOW=$(curl -s -b "$CJ" "$BASE/admin/weight-recipes/7114")
echo "$SHOW" | grep -q "Открытка-тест-114" && ok "позиция в show (custom)" || bad "позиции нет в show"
CIUP=$(curl -s -b "$CJ" -X POST "$BASE/admin/weight-recipes/7114/custom/$CID" -H "Content-Type: application/json" -d '{"quantity":5}')
[ "$(jget "$CIUP" "data.ok")" = "true" ] && ok "количество позиции обновлено" || bad "updateCustom: $CIUP"
SHOW2=$(curl -s -b "$CJ" "$BASE/admin/weight-recipes/7114")
echo "$SHOW2" | grep -q '"quantity":5' && ok "update видно в show" || bad "update не применился"

# --- ВЕС КОНФЕТЫ: создаём тестовый товар, задаём вес ---
CREATED=$(curl -s -b "$CJ" -X POST "$BASE/admin/products" -H "Content-Type: application/json" \
  -d '{"name":"Тест-конфета 114","slug":"test-candy-114","type":"simple","price_kopecks":10000,"is_published":0}')
PID=$(jget "$CREATED" "data.id")
if [ -z "$PID" ]; then
  PLIST=$(curl -s -b "$CJ" "$BASE/admin/products?filter=all")
  PID=$(python3 -c "
import json,sys
try:
    d=json.loads('''$PLIST''')
    m=[p['id'] for p in d['data'] if p.get('slug')=='test-candy-114']
    print(m[0] if m else '')
except Exception: print('')")
fi
[ -n "$PID" ] && ok "тестовый товар создан (id=$PID)" || bad "не удалось создать товар: $CREATED"
PW=$(curl -s -b "$CJ" -X POST "$BASE/admin/weight-recipes/product-weight" -H "Content-Type: application/json" -d "{\"product_id\":$PID,\"weight_g\":123}")
[ "$(jget "$PW" "data.weight_g")" = "123" ] && ok "вес товара задан из рецепта (123)" || bad "product-weight: $PW"
PW0=$(curl -s -b "$CJ" -X POST "$BASE/admin/weight-recipes/product-weight" -H "Content-Type: application/json" -d "{\"product_id\":$PID,\"weight_g\":\"\"}")
[ "$(jget "$PW0" "data.weight_g")" = "None" ] && ok "пустой вес → NULL" || bad "обнуление веса: $PW0"
PWBAD=$(curl -s -b "$CJ" -X POST "$BASE/admin/weight-recipes/product-weight" -H "Content-Type: application/json" -d '{"product_id":999999,"weight_g":10}')
[ "$(jget "$PWBAD" "error")" != "" ] && ok "чужой product_id отклонён" || bad "несуществующий товар принят"

# --- КАРТИНКИ: список + конвертация в webp с ретаргетом ---
mkdir -p "$ROOT/public/uploads/products"
$PHP -r '
$im = imagecreatetruecolor(220, 140);
$bg = imagecolorallocate($im, 200, 60, 60);
imagefilledrectangle($im, 0, 0, 219, 139, $bg);
imagejpeg($im, $argv[1], 92);
' "$ROOT/public/uploads/products/test-candy-114-test.jpg"
[ -s "$ROOT/public/uploads/products/test-candy-114-test.jpg" ] && ok "тестовая jpg создана" || bad "не удалось создать тестовую jpg"

# привязка картинки к тестовому товару напрямую в dev-БД:
$PHP -r '
$db = new PDO("sqlite:" . $argv[1]);
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$pid = (int)$argv[2];
$db->prepare("DELETE FROM product_images WHERE url LIKE ?")->execute(["%/test-candy-114-test%"]);
$db->prepare("INSERT INTO product_images (product_id, url, alt, media_type, sort_order) VALUES (?,?,?,\"image\",1)")
   ->execute([$pid, "/uploads/products/test-candy-114-test.jpg", "test114"]);
echo "ok";
' "$ROOT/backend/storage/database.sqlite" "$PID" > /dev/null 2>&1 && ok "картинка привязана к товару в БД" || bad "не удалось привязать картинку"

IMGL=$(curl -s -b "$CJ" "$BASE/admin/files/images?folder=")
echo "$IMGL" | grep -q "test-candy-114-test.jpg" && ok "files/images видит jpg" || bad "jpg не видна в списке"
echo "$IMGL" | grep -q '"used":true' && ok "флаг used (подключена к товарам)" || bad "used не определился"

CNV=$(curl -s -b "$CJ" -X POST "$BASE/admin/files/compress-image" -H "Content-Type: application/json" -d '{"url":"/uploads/products/test-candy-114-test.jpg"}')
[ "$(jget "$CNV" "data.ok")" = "true" ] && ok "jpg → webp сконвертирована" || bad "compress-image: $CNV"
NEWURL=$(jget "$CNV" "data.url")
case "$NEWURL" in *.webp) ok "новый URL: $NEWURL";; *) bad "новый URL не webp: $NEWURL";; esac
[ -f "$ROOT/public/uploads/products/test-candy-114-test.webp" ] && ! [ -f "$ROOT/public/uploads/products/test-candy-114-test.jpg" ] \
  && ok "файл на диске заменён (jpg удалён, webp создан)" || bad "файлы на диске не те"
REFS=$(jget "$CNV" "data.refs_updated")
[ "$REFS" -ge 1 ] 2>/dev/null && ok "ссылки в БД переписаны ($REFS)" || bad "ретаргет ссылок: $REFS"
DBURL=$($PHP -r '$db=new PDO("sqlite:".$argv[1]); print $db->query("SELECT url FROM product_images WHERE url LIKE \"%test-candy-114%\"")->fetchColumn() ?: "";' "$ROOT/backend/storage/database.sqlite" 2>/dev/null)
case "$DBURL" in *.webp) ok "в БД теперь webp-ссылка";; *) bad "в БД: $DBURL";; esac

CNV2=$(curl -s -b "$CJ" -X POST "$BASE/admin/files/compress-image" -H "Content-Type: application/json" -d '{"url":"/uploads/products/test-candy-114-test.jpg"}')
[ "$(jget "$CNV2" "error")" != "" ] && ok "повторная конвертация несуществующего файла → отказ" || bad "повтор принял: $CNV2"
PNG422=$(curl -s -b "$CJ" -X POST "$BASE/admin/files/compress-image" -H "Content-Type: application/json" -d '{"url":"/uploads/pdfs/fake.pdf"}')
[ "$(jget "$PNG422" "error")" != "" ] && ok "pdfs/ отказ (обложки каталогов не трогаем)" || bad "pdfs принят"
ANON=$(curl -s -X POST "$BASE/admin/files/compress-image" -H "Content-Type: application/json" -d '{"url":"/uploads/x.jpg"}')
[ "$(jget "$ANON" "error")" != "" ] && ok "аноним не может конвертировать (401)" || bad "аноним прошёл"

# --- СНЕПШОТ САЙТА (staging-корень через UPDATE_ROOT) ---
STAGE=/tmp/t114-stage; rm -rf "$STAGE"; mkdir -p "$STAGE/backend/storage" "$STAGE/uploads/products/e2e" "$STAGE/backend/storage/site-snapshots" "$STAGE/backend/storage/chunked-uploads" "$STAGE/exports"
echo "<html>staging-114</html>" > "$STAGE/index.html"
cp "$ROOT/scripts/deploy/.htaccess" "$STAGE/.htaccess" 2>/dev/null || echo "RewriteEngine On" > "$STAGE/.htaccess"
echo "fake-media-114" > "$STAGE/uploads/products/e2e/photo.bin"
echo '{"version":"test-114"}' > "$STAGE/backend/version.json"
echo "db-114" > "$STAGE/backend/storage/database.sqlite"
echo "junk" > "$STAGE/backend/storage/chunked-uploads/chunk.bin"
echo "junk" > "$STAGE/exports/export.zip"
echo "old-snap" > "$STAGE/backend/storage/site-snapshots/lakomka-site-20200101-0000.zip"
echo "$STAGE" > "$ROOT/backend/UPDATE_ROOT"

SNAP=$(curl -s -b "$CJ" -X POST "$BASE/admin/site-update/deploy-archive/create")
[ "$(jget "$SNAP" "data.ok")" = "true" ] && ok "снапшот создан: $(jget "$SNAP" "data.name") ($(jget "$SNAP" "data.size") б, $(jget "$SNAP" "data.files") файлов)" || bad "create: $SNAP"
SNAME=$(jget "$SNAP" "data.name")
# снапшоты живут в storage ОБСЛУЖИВАЮЩЕГО бэкенда (на проде он и есть целевой;
# в песочнице UPDATE_ROOT указывает на стенд — пишем в dev-storage)
SNAPFILE="$ROOT/backend/storage/site-snapshots/$SNAME"
[ -f "$SNAPFILE" ] && ok "файл снапшота на диске" || bad "файла нет: $SNAPFILE"
DUR=$(jget "$SNAP" "data.duration_s")
[ -n "$DUR" ] && ok "отчёт: за ${DUR}с, sha256 $(jget "$SNAP" "data.sha256" | cut -c1-12)…" || bad "нет отчёта"

DEP=$(curl -s -b "$CJ" "$BASE/admin/site-update/deploy-archive")
echo "$DEP" | grep -q "$SNAME" && ok "снапшот виден в deploy-archive (список)" || bad "в списке нет снапшота"
DL=$(curl -s -b "$CJ" -o /tmp/t114-snap.zip -w "%{http_code}" "$BASE/admin/site-update/deploy-archive/download?name=$SNAME")
[ "$DL" = "200" ] && [ "$(head -c 4 /tmp/t114-snap.zip)" = "PK$(printf '\003\004')" ] && ok "скачивание снапшота (PK zip)" || bad "download: $DL"
BADN=$(curl -s -b "$CJ" -o /dev/null -w "%{http_code}" "$BASE/admin/site-update/deploy-archive/download?name=../../config.php")
[ "$BADN" = "422" ] || [ "$BADN" = "404" ] && ok "кривое имя снапшота отклонено ($BADN)" || bad "traversal имя прошло: $BADN"

python3 - "$SNAPFILE" > /tmp/t114-zip.txt <<'PY'
import sys, zipfile
z = zipfile.ZipFile(sys.argv[1])
names = set(z.namelist())
have = [n for n in ["index.html", ".htaccess", "backend/version.json", "backend/storage/database.sqlite", "uploads/products/e2e/photo.bin"] if n in names]
junk = [n for n in names if "site-snapshots/" in n or "chunked-uploads/" in n or n.startswith("exports/")]
print("HAVE=" + ",".join(have))
print("JUNK=" + str(len(junk)))
PY
HAVE_N=$(grep -o "HAVE=.*" /tmp/t114-zip.txt | cut -d= -f2 | tr ',' '\n' | grep -c .)
JUNK_N=$(grep -o "JUNK=[0-9]*" /tmp/t114-zip.txt | cut -d= -f2)
[ "$HAVE_N" = "5" ] && ok "в снапшоте: сайт+backend+база+uploads" || bad "не хватает файлов в снапшоте ($(cat /tmp/t114-zip.txt))"
[ "$JUNK_N" = "0" ] && ok "служебного мусора в снапшоте нет" || bad "мусор в снапшоте: $JUNK_N"

DEL=$(curl -s -b "$CJ" -X POST "$BASE/admin/site-update/deploy-archive/delete" -H "Content-Type: application/json" -d "{\"name\":\"$SNAME\"}")
[ "$(jget "$DEL" "data.ok")" = "true" ] && ! [ -f "$SNAPFILE" ] && ok "снапшот удалён" || bad "delete: $DEL"

rm -f "$ROOT/backend/UPDATE_ROOT"

# --- МЕТРИКА-БЛОК ---
MCODE='<!-- Yandex.Metrika counter --><script type="text/javascript">ym(113971152,"init",{ssr:true,webvisor:true});</script><noscript><div><img src="https://mc.yandex.ru/watch/113971152" alt="" /></div></noscript><!-- /Yandex.Metrika counter -->'
MSET=$(MCODE="$MCODE" python3 -c 'import json,os; print(json.dumps({"metrika_code": os.environ["MCODE"]}))' | curl -s -b "$CJ" -X POST "$BASE/admin/settings" -H "Content-Type: application/json" -d @-)
echo "$MSET" | grep -q '"ok"' && ok "metrika_code сохранён" || bad "save metrika_code: $MSET"
PUB=$(curl -s "$BASE/settings/public")
echo "$PUB" | grep -q "mc.yandex.ru/watch/113971152" && ok "метрика-блок в /settings/public" || bad "блока нет в публичных настройках"
echo "$PUB" | grep -q "webvisor:true" && ok "блок отдаётся как есть (webvisor сохранён)" || bad "блок искажён"
MBAD=$(curl -s -b "$CJ" -X POST "$BASE/admin/settings" -H "Content-Type: application/json" -d '{"metrika_code":"<script>alert(1)</script>"}')
echo "$MBAD" | grep -q "mc.yandex.ru" && ok "блок без mc.yandex.ru отклонён" || bad "мусор принят: $MBAD"
MEMPTY=$(curl -s -b "$CJ" -X POST "$BASE/admin/settings" -H "Content-Type: application/json" -d '{"metrika_code":""}')
[ -n "$MEMPTY" ] && ok "пустой блок сохраняется (выключение)" || bad "пустой блок: $MEMPTY"

echo "── 4. Чистка ──"
curl -s -b "$CJ" -X DELETE "$BASE/admin/weight-recipes/7114" > /dev/null
$PHP -r '
$db = new PDO("sqlite:" . $argv[1]);
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$db->exec("DELETE FROM product_images WHERE url LIKE \"%test-candy-114%\"");
$db->exec("DELETE FROM products WHERE slug = \"test-candy-114\"");
$db->exec("DELETE FROM settings WHERE key IN (\"weight_custom_groups\", \"metrika_code\")");
echo "clean";
' "$ROOT/backend/storage/database.sqlite" > /dev/null 2>&1
rm -f "$ROOT/public/uploads/products/test-candy-114-test.webp" "$ROOT/public/uploads/products/test-candy-114-test.jpg"
LIST2=$(curl -s -b "$CJ" "$BASE/admin/weight-recipes")
echo "$LIST2" | grep -q 7114 && bad "граммовка 7114 не удалена" || ok "граммовка 7114 удалена (чистка)"
pkill -f "127.0.0.1:$PORT" 2>/dev/null

echo ""
echo "ИТОГ: $PASS passed, $FAIL failed"
[ "$FAIL" = "0" ]
