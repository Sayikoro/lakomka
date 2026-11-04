#!/bin/bash
# Task 139: похожие подарки, «Недавно смотрели», конверсия в аналитике,
# усиление бото-детектора, аудит безопасности.
#
# Состав:
#  1. Похожие подарки: GET /api/products/{slug}/similar (та же категория →
#     ближайшая цена, LIMIT 4), блок на карточке товара (запечён + живой
#     фетч), карточки без видео.
#  2. «Недавно смотрели»: история slug'ов в localStorage, блок в сайдбаре
#     каталога под фильтрами (xl+), на телефоне/планшете — внизу страницы.
#  3. Аналитика: конверсия просмотр → «в корзину» (conv) в topGifts.
#  4. Бото-детектор: honeypot company_site в форме заказа (422 + bot_hits),
#     флаг click-no-move (клики без движений мыши), behavior-burst
#     (≥8 pageview в одном батче).
#  5. Аудит: security-заголовки API, экранирование JSON-LD, карта auth.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); echo "  OK  $1"; }
bad(){ FAIL=$((FAIL+1)); echo "  FAIL $1"; }
PHP="$(readlink -f "$ROOT/../.ztools/php")"

echo "── 1. Типы и линт ──"
if ./node_modules/.bin/tsc --noEmit > /tmp/tsc139.log 2>&1; then
  ok "tsc --noEmit без ошибок"
else
  bad "tsc --noEmit: $(head -3 /tmp/tsc139.log)"
fi
LINT_FILES="src/components/product/ProductView.tsx src/app/(shop)/catalog/CatalogClient.tsx src/app/(shop)/checkout/page.tsx src/app/admin/analytics/page.tsx src/lib/recently-viewed.ts src/lib/product-api.ts src/lib/products.ts src/lib/page-texts.ts"
if ./node_modules/.bin/eslint $LINT_FILES > /tmp/eslint139.log 2>&1; then
  ok "eslint изменённых файлов чист"
else
  bad "eslint: $(head -5 /tmp/eslint139.log)"
fi

echo "── 2. PHP-синтаксис изменённых файлов ──"
for f in backend/public/index.php backend/src/VisitGuard.php \
         backend/src/Controllers/OrderController.php \
         backend/src/Controllers/AdminAnalyticsController.php; do
  if "$PHP" -l "$f" > /dev/null 2>&1; then ok "php -l $f"; else bad "php -l $f"; fi
done

echo "── 3. Похожие подарки: бэкенд ──"
grep -q 'products/(\[a-z0-9-\]+)/similar' backend/public/index.php \
  && ok "роут GET /api/products/{slug}/similar" \
  || bad "роут similar не найден"
grep -q 'ORDER BY (p.category_id IS NOT NULL AND p.category_id = ?) DESC' backend/public/index.php \
  && ok "приоритет: та же категория, затем ближайшая цена" \
  || bad "нет приоритизации категории в ORDER BY"
grep -q 'ABS(p.price_kopecks - ?) ASC' backend/public/index.php \
  && ok "сортировка по близости цены" \
  || bad "нет ABS(price) в сортировке"
grep -q 'AND p.id != ?' backend/public/index.php \
  && ok "сам товар исключён из похожих" \
  || bad "товар не исключён"
sed -n '/similar\$#/,/jsonResponse(\[.data. => \$similar\])/p' backend/public/index.php | grep -q 'LIMIT 4' \
  && ok "LIMIT 4 похожих" \
  || bad "LIMIT 4 не найден в similar-блоке"
grep -q "VisitGuard::guard(\$pdo, 'product'" backend/public/index.php \
  && ok "similar под щитом VisitGuard (блок-лист + rate-limit)" \
  || bad "similar без VisitGuard"

echo "── 4. Похожие подарки: фронт ──"
grep -q 'fetchLiveSimilarProducts' src/lib/product-api.ts \
  && ok "клиентский фетчер похожих" \
  || bad "нет fetchLiveSimilarProducts"
grep -q 'getSimilarProducts' src/lib/products.ts \
  && ok "серверный фетчер (запекание при сборке)" \
  || bad "нет getSimilarProducts"
grep -q 'data-testid="product-similar"' src/components/product/ProductView.tsx \
  && ok "блок похожих на карточке товара (product-similar)" \
  || bad "нет product-similar"
grep -q '<ProductCard key={p.id} product={p} showVideos={false} />' src/components/product/ProductView.tsx \
  && ok "карточки похожих без видео (политика «только картинки»)" \
  || bad "похожие рендерятся не через ProductCard showVideos=false"
grep -q 'initialSimilar' src/components/product/ProductView.tsx \
  && ok "ProductLive: запечённые похожие + живое обновление" \
  || bad "ProductLive без initialSimilar"
grep -q 'product_similar_title' src/lib/page-texts.ts \
  && ok "текст product_similar_title в реестре (редактируется в админке)" \
  || bad "нет ключа product_similar_title"

echo "── 5. Недавно смотрели ──"
grep -q 'const KEY = "lk_recent"' src/lib/recently-viewed.ts \
  && ok "localStorage-ключ lk_recent" \
  || bad "ключ lk_recent не найден"
grep -q 'const MAX = 12' src/lib/recently-viewed.ts \
  && ok "история ограничена 12 slug'ами" \
  || bad "нет ограничения MAX"
grep -q 'recordRecentlyViewed(slug);' src/components/product/ProductView.tsx \
  && ok "просмотр карточки товара пишется в историю" \
  || bad "ProductLive не пишет историю"
grep -q 'data-testid="recently-viewed-aside"' "src/app/(shop)/catalog/CatalogClient.tsx" \
  && ok "блок в сайдбаре каталога (recently-viewed-aside)" \
  || bad "нет recently-viewed-aside"
grep -q 'data-testid="recently-viewed-bottom"' "src/app/(shop)/catalog/CatalogClient.tsx" \
  && ok "блок внизу страницы (recently-viewed-bottom)" \
  || bad "нет recently-viewed-bottom"
grep -q 'className="hidden border-t border-\[var(--color-border)\] pt-4 xl:block"' "src/app/(shop)/catalog/CatalogClient.tsx" \
  && ok "сайдбар-версия только на xl+" \
  || bad "сайдбар-версия не скрыта на <xl"
grep -q 'className="xl:hidden"' "src/app/(shop)/catalog/CatalogClient.tsx" \
  && ok "нижняя версия скрыта на xl+" \
  || bad "нижняя версия не скрыта на xl+"
grep -q '.slice(0, 3);' "src/app/(shop)/catalog/CatalogClient.tsx" \
  && ok "показывается 3 недавних карточки" \
  || bad "нет среза до 3 карточек"
grep -q 'catalog_recent_title' src/lib/page-texts.ts \
  && ok "текст catalog_recent_title в реестре" \
  || bad "нет ключа catalog_recent_title"

echo "── 6. Конверсия в аналитике ──"
grep -q "'conv' => \$viewsN > 0 ? (int)round(\$cartN \* 100 / \$viewsN) : null" backend/src/Controllers/AdminAnalyticsController.php \
  && ok "topGifts считает conv = cart_adds/views (0 просмотров → null)" \
  || bad "conv не найден в topGifts"
grep -q 'g.conv >= 10' src/app/admin/analytics/page.tsx \
  && ok "UI: конверсия ≥10% подсвечена зелёным" \
  || bad "UI-подсветка конверсии не найдена"

echo "── 7. Honeypot заказа ──"
grep -q 'company_site' src/app/\(shop\)/checkout/page.tsx \
  && ok "скрытое поле company_site в форме чекаута" \
  || bad "нет company_site в чекауте"
grep -q 'className="hidden"' src/app/\(shop\)/checkout/page.tsx \
  && ok "поле-ловушка скрыто display:none" \
  || bad "ловушка не скрыта"
grep -q 'autoComplete="off"' src/app/\(shop\)/checkout/page.tsx \
  && ok "autoComplete=off у ловушки" \
  || bad "нет autoComplete=off"
grep -q "POST /api/orders (honeypot)" backend/src/Controllers/OrderController.php \
  && ok "OrderController пишет бота в bot_hits (раздел «Боты»)" \
  || bad "нет записи в bot_hits"
grep -q 'Не удалось оформить заказ. Попробуйте ещё раз.' backend/src/Controllers/OrderController.php \
  && ok "бот получает 422 без деталей (заказ не создаётся)" \
  || bad "нет отказа honeypot"

echo "── 8. Бото-детектор: click-no-move и behavior-burst ──"
grep -q "click-no-move" backend/src/VisitGuard.php \
  && ok "флаг click-no-move (клики есть, движений мыши/касаний/клавиатуры нет)" \
  || bad "нет click-no-move"
grep -q '\$score += 25;' backend/src/VisitGuard.php \
  && ok "click-no-move мягкий (+25): сам по себе даёт только «Подозрение»" \
  || bad "вес click-no-move не +25"
grep -q "behavior-burst" backend/src/VisitGuard.php \
  && ok "behavior-burst: ≥8 pageview в одном батче = бот" \
  || bad "нет behavior-burst"

echo "── 9. Функциональный тест botScore (PHP) ──"
BOTSCORE_OUT="$("$PHP" -r '
require "backend/src/VisitGuard.php";
// ИИ-агент: клики из DOM, ни одного движения мыши
$a = VisitGuard::botScore(["wd"=>0,"chrome"=>1,"plugins"=>5,"langs"=>2,"touch"=>0,"mm"=>0,"ts"=>0,"kd"=>0], true, true, 5, 6, 120);
// Человек: мышью шевелил
$b = VisitGuard::botScore(["wd"=>0,"chrome"=>1,"plugins"=>5,"langs"=>2,"touch"=>0,"mm"=>12,"ts"=>0,"kd"=>0], true, true, 5, 6, 120);
// Тач-человек: касания есть
$c = VisitGuard::botScore(["wd"=>0,"chrome"=>1,"plugins"=>5,"langs"=>2,"touch"=>1,"mm"=>0,"ts"=>8,"kd"=>0], true, true, 5, 6, 120);
echo $a["score"], "|", in_array("click-no-move", $a["flags"]) ? "flag" : "noflag", "|",
     $b["score"], "|", in_array("click-no-move", $b["flags"]) ? "flag" : "noflag", "|",
     $c["score"], "|", in_array("click-no-move", $c["flags"]) ? "flag" : "noflag";
' 2>/dev/null)"
echo "$BOTSCORE_OUT" | grep -qE '^25\|flag\|0\|noflag\|0\|noflag$' \
  && ok "агент с DOM-кликами: score 25 + флаг; человек с мышью и тач — чисты" \
  || bad "botScore неожиданный: $BOTSCORE_OUT"

echo "── 10. Аудит безопасности ──"
grep -q "X-Content-Type-Options: nosniff" backend/public/index.php \
  && ok "API: X-Content-Type-Options: nosniff" \
  || bad "нет nosniff"
grep -q "X-Frame-Options: DENY" backend/public/index.php \
  && ok "API: X-Frame-Options: DENY" \
  || bad "нет X-Frame-Options"
grep -q 'JSON.stringify(data).replace(/</g, "\\\\u003c")' src/components/seo/ProductJsonLd.tsx \
  && ok "JSON-LD товара экранирует < (защита от </script>)" \
  || bad "JSON-LD товара не экранирован"
grep -q 'JSON.stringify(data).replace(/</g, "\\\\u003c")' src/components/seo/OrganizationJsonLd.tsx \
  && ok "Organization JSON-LD экранирует <" \
  || bad "Organization JSON-LD не экранирован"
if "$PHP" scripts/security-audit-auth.php > /tmp/auth139.log 2>&1; then
  ok "карта auth-методов: только намеренно публичные без авторизации"
else
  bad "security-audit-auth провален (см. /tmp/auth139.log)"
fi

echo "── 11. Гигиена dev-БД после смоука ──"
HYG="$(python3 -c "
import sqlite3
con = sqlite3.connect('backend/storage/database.sqlite')
orders = con.execute('SELECT COUNT(*) FROM orders').fetchone()[0]
# смоук-запросы curl оставили записи аналитики — чистим
con.execute('DELETE FROM bot_hits')
con.execute('DELETE FROM visit_events')
con.execute('DELETE FROM visit_sessions')
con.execute('DELETE FROM rate_limits')
con.commit()
print(orders)
")"
[ "$HYG" = "0" ] && ok "заказов в dev-БД нет (0), аналитика от смоука очищена" \
  || bad "в dev-БД заказы: $HYG"

echo ""
echo "ИТОГО: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
