#!/bin/bash
# Task 146 TESTS: галереи из админки + шорткод [gallery слаг].
# Части:
#   A) статические контракты: tsc, eslint, grep-проверки фронт/бэк;
#   B) PHP API на своём стенде :8099 (dev-БД): CRUD галерей, загрузка,
#      порядок, публичная отдача, настройка brands_gallery, проводник.
# Без БД-миграций и правок dev-БД (галереи — файловая механика).
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); echo "  OK  $1"; }
bad(){ FAIL=$((FAIL+1)); echo "  FAIL $1"; }

PHP="$(command -v php 2>/dev/null || true)"
[ -z "$PHP" ] && [ -x "$ROOT/../.ztools/php" ] && PHP="$(readlink -f "$ROOT/../.ztools/php")"
[ -n "$PHP" ] || { echo "php не найден"; exit 1; }

echo "── A. Статика и контракты ──"
npx tsc --noEmit >/dev/null 2>&1 && ok "tsc --noEmit чист" || bad "tsc падает"
npx eslint src/components/admin/GalleryManager.tsx src/components/home/BrandLogos.tsx \
  src/components/texts/RichText.tsx src/lib/shortcode.ts src/lib/galleries.ts \
  "src/app/(shop)/page.tsx" src/app/admin/files/page.tsx >/dev/null 2>&1 \
  && ok "eslint новых файлов чист" || bad "eslint ругается"

# фронт-контракты
grep -q "DEFAULT_BRANDS_GALLERY = \"fabriki\"" src/lib/shortcode.ts \
  && ok "дефолтная галерея блока фабрик: fabriki" || bad "нет DEFAULT_BRANDS_GALLERY"
grep -q "splitByGalleryShortcode" src/components/texts/RichText.tsx \
  && ok "RichText режет текст по шорткодам" || bad "RichText без парсера"
grep -q "CategorySeoLive" "src/app/(shop)/catalog/[slug]/page.tsx" \
  && ok "seo_text категории рендерится через живой RichText" || bad "seo_text не через CategorySeoLive"
grep -q 'testId ?? "rich-text"' src/components/texts/RichText.tsx \
  && ok "RichText рендерит текст с testid" || bad "RichText без testid"
grep -q 'data-testid="files-tab-gallery"' src/app/admin/files/page.tsx \
  && ok "вкладка «Галерея» на странице «Файлы»" || bad "нет вкладки Галерея"
grep -q 'data-testid="gallery-copy"' src/components/admin/GalleryManager.tsx \
  && ok "кнопка копирования шорткода" || bad "нет копирования шорткода"
grep -q 'brands_gallery' src/components/admin/SettingsForm.tsx \
  && ok "поле шорткода в Настройках (блок фабрик)" || bad "нет поля в Настройках"
grep -q 'fetchGalleryLive' src/components/home/BrandLogos.tsx \
  && ok "BrandLogos обновляется с живого API" || bad "BrandLogos без живого обновления"

# бэкенд-контракты
grep -q "'brands_gallery'" backend/src/Controllers/AdminSettingsController.php \
  && ok "настройка brands_gallery в KEYS" || bad "brands_gallery нет в KEYS"
grep -q "galleries" backend/src/Controllers/AdminFilesController.php \
  && ok "раздел galleries в проводнике" || bad "нет раздела galleries в проводнике"
grep -q "AdminGalleriesController::publicShow" backend/public/index.php \
  && ok "публичный роут /api/galleries/{слаг}" || bad "нет публичного роута галерей"
grep -q "media', 'galleries" backend/src/Controllers/AdminFilesController.php \
  && ok "оптимизатор картинок работает для галерей" || bad "оптимизатор не трогает галереи"
grep -q "galleries" backend/src/Paths.php \
  && ok "Paths::galleriesDir" || bad "нет Paths::galleriesDir"
[ -f public/uploads/galleries/fabriki/.order.json ] \
  && ok "посев: манифест галереи fabriki" || bad "нет манифеста fabriki"
[ "$(ls public/uploads/galleries/fabriki/*.png 2>/dev/null | wc -l)" = "18" ] \
  && ok "посев: 18 логотипов fabriki" || bad "в fabriki не 18 png"

# PHP-синтаксис
for f in backend/src/Controllers/AdminGalleriesController.php \
         backend/src/Controllers/AdminFilesController.php \
         backend/src/Controllers/AdminSettingsController.php \
         backend/public/index.php backend/src/Paths.php; do
  "$PHP" -l "$f" >/dev/null 2>&1 && ok "php -l $(basename "$f")" || bad "php -l $(basename "$f")"
done

echo "── B. PHP API на стенде :8099 ──"
PORT=8099; BASE="http://127.0.0.1:$PORT"
export PHP_CLI_SERVER_WORKERS=8
pkill -f "127.0.0.1:$PORT" 2>/dev/null; sleep 0.5
( cd "$ROOT/backend" && setsid "$PHP" -S 127.0.0.1:$PORT -t public >/tmp/t146-api.log 2>&1 & )
for i in $(seq 1 30); do curl -s "$BASE/api/health" 2>/dev/null | grep -q ok && break; sleep 0.3; done
curl -s "$BASE/api/health" | grep -q ok && ok "стенд API :$PORT поднялся" || { bad "стенд API не поднялся"; echo "ИТОГО: PASS=$PASS FAIL=$FAIL"; exit 1; }

TOKEN="$("$PHP" -r "require '$ROOT/backend/src/Auth.php'; echo Auth::issueToken(1,'admin@lakomka.local','superadmin');")"
H="Authorization: Bearer $TOKEN"

# B1. публичная отдача посевной галереи
PUB=$(curl -s "$BASE/api/galleries/fabriki")
echo "$PUB" | grep -q '"title":"Наши фабрики"' && ok "публичный API: заголовок «Наши фабрики»" || bad "публичный API: неверный заголовок"
N=$(echo "$PUB" | "$PHP" -r '$d=json_decode(stream_get_contents(STDIN),true)["data"]["items"]; echo count($d);')
[ "$N" = "18" ] && ok "публичный API: 18 картинок" || bad "публичный API: картинок $N, ожидалось 18"
FIRST=$(echo "$PUB" | "$PHP" -r '$d=json_decode(stream_get_contents(STDIN),true)["data"]["items"][0]; echo $d["alt"];')
[ "$FIRST" = "Конти" ] && ok "порядок из манифеста (первая — Конти)" || bad "порядок сломан: первая «$FIRST»"
echo "$PUB" | grep -q '%D0%9A%D0%BE%D0%BD%D1%82%D0%B8.png' && ok "URL кириллицы закодирован" || bad "URL не закодирован"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/galleries/no-such-gal")
[ "$CODE" = "404" ] && ok "несуществующая галерея — 404" || bad "несуществующая галерея: $CODE"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/galleries/..%2F..%2Fconfig")
[ "$CODE" = "404" ] && ok "traversal в слаге — 404" || bad "traversal не отбита: $CODE"

# B2. CRUD на временной галерее
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/admin/galleries" -H "$H" -H "Content-Type: application/json" -d '{"title":"Тест 146","slug":"test-146"}')
[ "$CODE" = "200" ] && ok "создание галереи" || bad "создание галереи: $CODE"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/admin/galleries" -H "$H" -H "Content-Type: application/json" -d '{"title":"дубль","slug":"test-146"}')
[ "$CODE" = "409" ] && ok "дубль слага — 409" || bad "дубль слага: $CODE"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/admin/galleries" -H "$H" -H "Content-Type: application/json" -d '{"title":"плохой слаг","slug":"С ТИРЕ!!"}')
[ "$CODE" = "422" ] && ok "невалидный слаг — 422" || bad "невалидный слаг принят: $CODE"
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/admin/galleries")
[ "$CODE" = "401" ] && ok "список галерей без токена — 401" || bad "без токена: $CODE"

# B3. загрузка картинки в галерею (через chunked → files/upload, раздел galleries)
"$PHP" -r 'copy($argv[1]."/public/uploads/galleries/fabriki/Жако.png", $argv[1]."/backend/storage/chunked-uploads/up-t146.zip");' "$ROOT"
UP=$(curl -s -X POST "$BASE/api/admin/files/upload" -H "$H" -H "Content-Type: application/json" \
  -d "{\"file_path\":\"up-t146.zip\",\"original_name\":\"Жако Тест.png\",\"target\":\"galleries/test-146\"}")
echo "$UP" | grep -q '"optimized"' && ok "загрузка в галерею + оптимизатор (png→webp)" || bad "загрузка без оптимизатора: $UP"
UP_NAME=$(echo "$UP" | "$PHP" -r '$d=json_decode(stream_get_contents(STDIN),true)["data"]["name"]; echo $d;')
echo "$UP" | grep -q '"url":"/uploads/galleries/test-146/' && ok "публичный URL галерейного файла" || bad "неверный URL: $UP"

# B4. содержимое, порядок, переименование
ITEMS=$(curl -s "$BASE/api/admin/galleries/items?slug=test-146" -H "$H")
[ "$(echo "$ITEMS" | "$PHP" -r '$d=json_decode(stream_get_contents(STDIN),true)["data"]["items"]; echo count($d);')" = "1" ] \
  && ok "items: 1 загруженная картинка" || bad "items пуст"
# вторая картинка — из посевной, проверяем move
"$PHP" -r 'copy($argv[1]."/public/uploads/galleries/fabriki/Конти.png", $argv[1]."/backend/storage/chunked-uploads/up-t146b.zip");' "$ROOT"
curl -s -X POST "$BASE/api/admin/files/upload" -H "$H" -H "Content-Type: application/json" \
  -d '{"file_path":"up-t146b.zip","original_name":"Альфа.png","target":"galleries/test-146"}' >/dev/null
ORDER=$(curl -s "$BASE/api/admin/galleries/items?slug=test-146" -H "$H" | "$PHP" -r '$d=json_decode(stream_get_contents(STDIN),true)["data"]["items"]; echo implode("|",array_column($d,"name"));')
echo "$ORDER" | grep -q "^Жако Тест" && ok "новые файлы в конец (порядок манифеста)" || bad "порядок: $ORDER"
curl -s -X POST "$BASE/api/admin/galleries/move" -H "$H" -H "Content-Type: application/json" \
  -d '{"slug":"test-146","name":"Альфа.webp","dir":"left"}' >/dev/null
ORDER2=$(curl -s "$BASE/api/admin/galleries/items?slug=test-146" -H "$H" | "$PHP" -r '$d=json_decode(stream_get_contents(STDIN),true)["data"]["items"]; echo implode("|",array_column($d,"name"));')
[ "$ORDER2" = "Альфа.webp|Жако Тест.webp" ] && ok "move left меняет порядок" || bad "после move: $ORDER2"
curl -s -X POST "$BASE/api/admin/galleries/title" -H "$H" -H "Content-Type: application/json" \
  -d '{"slug":"test-146","title":"Тест 146 (переименована)"}' | grep -q '"ok":true' && ok "переименование галереи" || bad "rename упал"
curl -s "$BASE/api/galleries/test-146" | grep -q "Тест 146 (переименована)" && ok "заголовок виден публичному API" || bad "заголовок не отдаётся"

# B5. проводник: раздел galleries, скрытие манифеста
LIST=$(curl -s "$BASE/api/admin/files?path=galleries" -H "$H")
echo "$LIST" | grep -q '"key":"galleries"\|galleries' && ok "проводник видит раздел galleries" || bad "проводник не видит galleries"
echo "$LIST" | grep -q 'test-146' && ok "галерея test-146 видна в проводнике" || bad "test-146 не в проводнике"
INSIDE=$(curl -s "$BASE/api/admin/files?path=galleries/test-146" -H "$H")
echo "$INSIDE" | grep -q '.order.json' && bad "манифест виден в проводнике (должен быть скрыт)" || ok "манифест .order.json скрыт из листинга"

# B6. удаления
curl -s -X POST "$BASE/api/admin/galleries/item-delete" -H "$H" -H "Content-Type: application/json" \
  -d '{"slug":"test-146","name":"Альфа.webp"}' | grep -q '"ok":true' && ok "удаление картинки" || bad "item-delete упал"
[ ! -f "$ROOT/backend/../public/uploads/galleries/test-146/Альфа.webp" ] && ok "файл картинки удалён с диска" || bad "файл остался"
curl -s -X POST "$BASE/api/admin/galleries/delete" -H "$H" -H "Content-Type: application/json" \
  -d '{"slug":"test-146"}' | grep -q '"ok":true' && ok "удаление галереи целиком" || bad "delete упал"
[ ! -d "$ROOT/public/uploads/galleries/test-146" ] && ok "папка галереи удалена" || bad "папка осталась"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/admin/galleries/delete" -H "$H" -H "Content-Type: application/json" -d '{"slug":"test-146"}')
[ "$CODE" = "404" ] && ok "повторное удаление — 404" || bad "повторное удаление: $CODE"

# B7. brands_gallery в настройках (set → public → clear)
curl -s -X POST "$BASE/api/admin/settings" -H "$H" -H "Content-Type: application/json" \
  -d '{"brands_gallery":"[gallery fabriki]"}' >/dev/null
curl -s "$BASE/api/settings/public" | grep -q '"brands_gallery":"\[gallery fabriki\]"' \
  && ok "brands_gallery сохраняется и отдаётся публично" || bad "brands_gallery не проходит"
curl -s -X POST "$BASE/api/admin/settings" -H "$H" -H "Content-Type: application/json" \
  -d '{"brands_gallery":""}' >/dev/null
curl -s "$BASE/api/settings/public" | grep -q '"brands_gallery":""' \
  && ok "brands_gallery очищается (пусто = дефолт)" || bad "очистка не сработала"

# уборка
rm -f "$ROOT/backend/storage/chunked-uploads/up-t146.zip" "$ROOT/backend/storage/chunked-uploads/up-t146b.zip"
pkill -f "127.0.0.1:$PORT" 2>/dev/null

echo ""
echo "ИТОГО: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
