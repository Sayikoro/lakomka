#!/bin/bash
# Task 141 тесты: «Поделиться» в товаре, счётчик «До Нового года»,
# быстрый просмотр, SEO категорий.
# 1) tsc чист; 2) компоненты содержат ожидаемые куски; 3) бэкенд
#    (settings/VisitGuard/категории) отвечает как надо; 4) запечённый
#    HTML (.deploy-package): счётчик на главной, share на товаре,
#    глазки в каталоге, лендинги категорий с canonical, sitemap.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); echo "  OK  $1"; }
bad(){ FAIL=$((FAIL+1)); echo "  FAIL $1"; }

echo "── 1. TypeScript ──"
if npx tsc --noEmit >/tmp/t141-tsc.log 2>&1; then ok "tsc --noEmit чист"; else bad "tsc: $(tail -3 /tmp/t141-tsc.log)"; fi

echo "── 2. Компоненты и библиотеки ──"
SB="$ROOT/src/components/ui/ShareButton.tsx"
grep -q "navigator.share" "$SB" && grep -q "t.me/share/url" "$SB" && grep -q "wa.me" "$SB" && \
  grep -q "vk.com/share.php" "$SB" && grep -q "clipboard.writeText" "$SB" && \
  grep -q "trackGiftShare" "$SB" \
  && ok "ShareButton: нативный шаринг + TG/WA/VK + копирование + gift_share" \
  || bad "ShareButton не соответствует ожиданиям"

NY="$ROOT/src/components/home/NewYearCounter.tsx"
grep -q "timeUntilNewYearParts" "$NY" && grep -q "pluralDays" "$NY" && \
  grep -q "newyear_counter_enabled" "$NY" && grep -q "home_newyear_label" "$NY" \
  && ok "NewYearCounter: отсчёт, плюрализация, живая галочка, текст из реестра" \
  || bad "NewYearCounter не соответствует ожиданиям"
cat > /tmp/t141-ny.js <<'EOF'
const fs = require("fs");
let src = fs.readFileSync("src/lib/newyear.ts", "utf8")
  .replace(/export /g, "")
  .replace(/interface \w+\s*\{[^}]*\}/g, "") // Task 142+: NyParts и др. — TS-типы в рантайме не существуют
  .replace(/\)\s*:\s*[A-Za-z]\w*(\[\])?\s*\{/g, ") {") // возвращаемые типы (Date/NyParts/…)
  .replace(/\(now: Date = new Date\(\)\)/g, "(now = new Date())")
  .replace(/: Date = new Date\(\)/g, " = new Date()")
  .replace(/\bnow: Date\b/g, "now")
  .replace(/\bn: number\b/g, "n")
  .replace(/\bforms: \[string, string, string\]/g, "forms")
  .replace(/: Date/g, "")
  .replace(/: number/g, "")
  .replace(/: string/g, "");
eval(src);
const now = new Date(2026, 10, 4); // 4 ноября 2026
const d = daysUntilNewYear(now);
const expected = Math.ceil((new Date(2027, 0, 1) - now) / 86400000);
if (d !== expected) { console.error("days:", d, "expected:", expected); process.exit(1); }
const parts = timeUntilNewYearParts(now);
const dFloor = Math.floor(Math.max(0, new Date(2027, 0, 1) - now) / 86400000);
if (parts.d !== dFloor) { console.error("parts.d:", parts.d, "floor:", dFloor); process.exit(3); }
const pl = [[1,"день"],[2,"дня"],[5,"дней"],[11,"дней"],[21,"день"],[22,"дня"],[25,"дней"]];
for (const [n, w] of pl) if (pluralDays(n) !== w) { console.error("plural", n, pluralDays(n)); process.exit(2); }
console.log("NY-OK");
EOF
node /tmp/t141-ny.js >/dev/null 2>&1 \
  && ok "daysUntilNewYear (4.11.2026 → 1.01.2027) и плюрализация день/дня/дней верны" \
  || bad "daysUntilNewYear/pluralDays считают неверно"

QV="$ROOT/src/components/ui/QuickView.tsx"
grep -q "Modal" "$QV" && grep -q "trackGiftView" "$QV" && grep -q "AddToCart" "$QV" && \
  grep -q "product_open_full" "$QV" \
  && ok "QuickView: модалка, просмотр в аналитике, корзина, ссылка на товар" \
  || bad "QuickView не соответствует ожиданиям"

for F in "$ROOT/src/components/ui/ProductCardNew.tsx" "$ROOT/src/components/ui/ProductCard.tsx"; do
  grep -q "onQuickView" "$F" && grep -q "quick-view-btn" "$F" \
    && ok "$(basename "$F"): кнопка быстрого просмотра подключена" \
    || bad "$(basename "$F"): нет onQuickView/quick-view-btn"
done

CC="$ROOT/src/app/(shop)/catalog/CatalogClient.tsx"
grep -q "initialCategory" "$CC" && grep -q "quick_view_enabled" "$CC" && grep -q "<QuickView" "$CC" \
  && ok "CatalogClient: initialCategory, живая галочка, модалка" \
  || bad "CatalogClient не соответствует ожиданиям"

SLUGP="$ROOT/src/app/(shop)/catalog/[slug]/page.tsx"
grep -q "generateStaticParams" "$SLUGP" && grep -q "generateMetadata" "$SLUGP" && \
  grep -q "seo_text" "$SLUGP" && grep -q "meta_title" "$SLUGP" \
  && ok "/catalog/[slug]: параметры, метаданные, SEO-текст" \
  || bad "/catalog/[slug] не соответствует ожиданиям"

grep -q 'catalog/${cat.slug}' "$ROOT/src/components/home/CategoryGrid.tsx" \
  && ok "CategoryGrid: плитки ведут на /catalog/<slug>" \
  || bad "CategoryGrid: ссылки не на лендинги категорий"
grep -q "catalog/\${c.slug}" "$ROOT/src/app/sitemap.ts" \
  && ok "sitemap: лендинги категорий" || bad "sitemap без категорий"

PT="$ROOT/src/lib/page-texts.ts"
grep -q "home_newyear_label" "$PT" && grep -q "home_newyear_hint" "$PT" && \
  grep -q "product_share" "$PT" && grep -q "catalog_quick_view" "$PT" && \
  grep -q "product_open_full" "$PT" \
  && ok "реестр текстов: новые ключи на месте" || bad "в реестре текстов нет новых ключей"

echo "── 3. Бэкенд ──"
grep -q "'gift_share'" "$ROOT/backend/src/VisitGuard.php" \
  && ok "VisitGuard: событие gift_share в белом списке" || bad "VisitGuard без gift_share"
for K in newyear_counter_enabled quick_view_enabled; do
  C=$(grep -c "$K" "$ROOT/backend/src/Controllers/AdminSettingsController.php")
  [ "$C" -ge 4 ] && ok "AdminSettingsController: $K ($C упоминаний)" || bad "AdminSettingsController: $K неполный ($C)"
done
[ -f "$ROOT/backend/src/Controllers/AdminCategoriesController.php" ] \
  && ok "AdminCategoriesController.php создан" || bad "нет контроллера категорий"
grep -q "admin/categories" "$ROOT/backend/public/index.php" \
  && ok "index.php: роуты /api/admin/categories" || bad "нет роутов категорий"
grep -q "meta_title" "$ROOT/backend/src/schema.sql" \
  && ok "schema.sql: SEO-колонки категорий" || bad "schema.sql без SEO-колонок"
[ -f "$ROOT/backend/migrations/008_categories_seo.sql" ] \
  && ok "миграция 008_categories_seo.sql на месте" || bad "нет миграции 008"

echo "── 4. Живое API (:8000) ──"
# Щит VisitGuard держит счётчики в БД и помнит прошлые прогоны —
# перед проверками чистим окна лимитов локального стенда
/home/z/my-project/.ztools/php -r '$pdo=new PDO("sqlite:backend/storage/database.sqlite"); $pdo->exec("DELETE FROM rate_limits");' 2>/dev/null
PUB="$(curl -s http://127.0.0.1:8000/api/settings/public)"
echo "$PUB" | grep -q '"newyear_counter_enabled":true' && ok "settings/public: newyear_counter_enabled=true" || bad "settings/public: newyear_counter_enabled не true"
echo "$PUB" | grep -q '"quick_view_enabled":true' && ok "settings/public: quick_view_enabled=true" || bad "settings/public: quick_view_enabled не true"
curl -s http://127.0.0.1:8000/api/categories | grep -q '"meta_title"' \
  && ok "categories: SEO-поля отдаются публично" || bad "categories без SEO-полей"

# админ-правки через API: логин, сохранить SEO категории, проверить
ADMIN_LOGIN="${ADMIN_LOGIN:-admin@lakomka.local}"
ADMIN_PASS="${ADMIN_PASS:-Lakomka2026!}"
CJ=/tmp/t141-cookies.txt
CODE=$(curl -s -o /tmp/t141-login.json -w "%{http_code}" -c "$CJ" -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_LOGIN\",\"password\":\"$ADMIN_PASS\"}" http://127.0.0.1:8000/api/auth/login)
if [ "$CODE" = "200" ]; then
  ok "логин админа"
  CODE=$(curl -s -o /tmp/t141-cat.json -w "%{http_code}" -b "$CJ" -H "Content-Type: application/json" \
    -d '{"meta_title":"Тест 141 — заголовок","meta_description":"Тест 141 — описание","seo_text":"Тест 141 — текст."}' \
    http://127.0.0.1:8000/api/admin/categories/1)
  [ "$CODE" = "200" ] && ok "POST /api/admin/categories/1 (SEO сохранён)" || bad "сохранение SEO категории: $CODE"
  curl -s http://127.0.0.1:8000/api/categories | grep -q 'Тест 141 — заголовок' \
    && ok "публичный /api/categories отдаёт сохранённый meta_title" || bad "meta_title не виден публично"
  curl -s -b "$CJ" -H "Content-Type: application/json" -d '{"meta_title":"","meta_description":"","seo_text":""}' \
    http://127.0.0.1:8000/api/admin/categories/1 >/dev/null
  ok "SEO категории возвращён в пустое значение"
  CODE=$(curl -s -o /tmp/t141-set.json -w "%{http_code}" -b "$CJ" -H "Content-Type: application/json" \
    -d '{"newyear_counter_enabled":"0","quick_view_enabled":"0"}' http://127.0.0.1:8000/api/admin/settings)
  [ "$CODE" = "200" ] && ok "POST /api/admin/settings: обе галочки выключены" || bad "сохранение настроек: $CODE"
  PUB2="$(curl -s http://127.0.0.1:8000/api/settings/public)"
  echo "$PUB2" | grep -q '"newyear_counter_enabled":false' && echo "$PUB2" | grep -q '"quick_view_enabled":false' \
    && ok "settings/public: выключение доходит до витрины" || bad "выключение не дошло до settings/public"
  curl -s -b "$CJ" -H "Content-Type: application/json" -d '{"newyear_counter_enabled":"1","quick_view_enabled":"1"}' \
    http://127.0.0.1:8000/api/admin/settings >/dev/null
  ok "галочки возвращены во включённое состояние"
else
  bad "логин админа не удался (HTTP $CODE)"
fi
rm -f "$CJ"

echo "── 5. Запечённый HTML (.deploy-package) ──"
[ -f "$ROOT/.deploy-package/index.html" ] || { echo "нет .deploy-package — сначала MODE=both bash scripts/build-static.sh"; exit 1; }
grep -q 'data-testid="newyear-counter"' "$ROOT/.deploy-package/index.html" \
  && ok "главная: счётчик «До Нового года» запечён" || bad "на главной нет счётчика"
grep -q 'До Нового года' "$ROOT/.deploy-package/index.html" \
  && ok "главная: текст счётчика в HTML" || bad "текста счётчика нет на главной"

FOUND_SHARE=0; FOUND_QV=0
for F in "$ROOT"/.deploy-package/product/*/index.html; do
  [ -f "$F" ] || continue
  grep -q 'data-testid="share-button"' "$F" && FOUND_SHARE=1
  break
done
[ "$FOUND_SHARE" = "1" ] && ok "товар: кнопка «Поделиться» запечена" || bad "на товаре нет share-кнопки"
grep -q 'quick-view-btn' "$ROOT/.deploy-package/catalog/index.html" \
  && ok "каталог: глазки быстрого просмотра запечены" || bad "в каталоге нет глазков"

CATPAGE=""
for D in "$ROOT"/.deploy-package/catalog/*/; do
  [ -f "$D/index.html" ] || continue
  CATPAGE="$D/index.html"; CATSLUG="$(basename "$D")"; break
done
[ -n "$CATPAGE" ] && ok "лендинг категории запечён: /catalog/$CATSLUG" || bad "нет запечённых лендингов категорий"
[ -n "$CATPAGE" ] && grep -q 'rel="canonical" href="[^"]*/catalog/'"$CATSLUG"'/\?"' "$CATPAGE" \
  && ok "лендинг: canonical на себя" || bad "лендинг без canonical"
[ -n "$CATPAGE" ] && grep -q '<h1' "$CATPAGE" \
  && ok "лендинг: H1 с названием категории" || bad "лендинг без H1"
grep -q '<loc>[^<]*/catalog/[a-z0-9-]*</loc>' "$ROOT/.deploy-package/sitemap.xml" 2>/dev/null \
  && ok "sitemap.xml: категории" || bad "sitemap.xml без категорий"

echo ""
echo "ИТОГО: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
