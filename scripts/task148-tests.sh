#!/bin/bash
# Task 148 тесты: снятие SEO-лендингов /detskie /corporate /wholesale /delivery
# (решение владельца «убери их») при сохранении остального ядра Task 147.
# A) статический анализ: маршруты и компоненты лендингов удалены, ссылок нет,
#    MAP категорий/главная/H1 Hero/noindex/sitemap — на месте;
# B) запечённая статика .deploy-package: каталогов лендингов нет, ссылок нет,
#    sitemap.xml чист, FAQPage JSON-LD нигде не остался, 404.html на месте.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); echo "  OK  $1"; }
bad(){ FAIL=$((FAIL+1)); echo "  FAIL $1"; }

PHP="$(command -v php 2>/dev/null || true)"
[ -z "$PHP" ] && [ -x "$ROOT/../.ztools/php" ] && PHP="$(readlink -f "$ROOT/../.ztools/php")"
[ -n "$PHP" ] || { echo "php не найден"; exit 1; }

echo "── A1. TypeScript и ESLint (изменённые файлы) ──"
if npx tsc --noEmit >/tmp/t148-tsc.log 2>&1; then ok "tsc --noEmit чист"; else bad "tsc: $(tail -3 /tmp/t148-tsc.log)"; fi
FILES='src/lib/seo.ts src/app/sitemap.ts src/components/layout/Footer.tsx src/app/(shop)/page.tsx src/app/(shop)/catalog/page.tsx src/app/(shop)/catalog/[slug]/page.tsx'
if npx eslint $FILES >/tmp/t148-eslint.log 2>&1; then ok "eslint изменённых файлов чист"; else bad "eslint: $(tail -5 /tmp/t148-eslint.log)"; fi

echo "── A2. Лендинги и их компоненты удалены ──"
for r in detskie corporate wholesale delivery; do
  [ ! -e "src/app/(shop)/$r" ] && ok "маршрута нет: src/app/(shop)/$r" || bad "остался каталог: src/app/(shop)/$r"
done
for f in src/components/shop/LandingHead.tsx src/components/shop/CtaPanel.tsx \
         src/components/shop/FaqList.tsx src/components/seo/FaqJsonLd.tsx \
         scripts/task147-tests.sh scripts/task147-e2e.cjs scripts/task147-e2e.sh scripts/task147-shots.cjs; do
  [ ! -e "$f" ] && ok "файл удалён: $f" || bad "файл не удалён: $f"
done

echo "── A3. Ссылок/упоминаний лендингов в коде нет ──"
HITS=$(grep -rEn 'href="/(detskie|corporate|wholesale|delivery)"|"/(detskie|corporate|wholesale|delivery)",' src/ 2>/dev/null | wc -l)
[ "$HITS" = "0" ] && ok "src/: ни href, ни sitemap-записей лендингов" || { bad "src/: $HITS вхождений"; grep -rEn 'href="/(detskie|corporate|wholesale|delivery)"|"/(detskie|corporate|wholesale|delivery)",' src/ | head -5; }
HITS=$(grep -rEn 'staticPageMetadata|FaqJsonLd|LandingHead|CtaPanel|FaqList' src/ 2>/dev/null | wc -l)
[ "$HITS" = "0" ] && ok "src/: импортов удалённых компонентов нет" || { bad "src/: $HITS ссылок на удалённые компоненты"; grep -rEn 'staticPageMetadata|FaqJsonLd|LandingHead|CtaPanel|FaqList' src/ | head -5; }

echo "── A4. SEO-ядро Task 147 сохранено ──"
C=$(grep -cE '^\s+(nabory|vip|zhest|igrushki|karton|meshochki|tekstil|tuby): \{' src/lib/seo.ts)
[ "$C" = "8" ] && ok "seo.ts: CATEGORY_SEO — 8 слагов категорий" || bad "seo.ts: $C слагов из 8"
grep -q 'categorySeo' "src/app/(shop)/catalog/[slug]/page.tsx" \
  && ok "категории: автогенерация title/H1 через categorySeo" || bad "категории: categorySeo пропал"
grep -q 'BreadcrumbJsonLd' "src/app/(shop)/catalog/[slug]/page.tsx" \
  && ok "категории: BreadcrumbList JSON-LD" || bad "категории: BreadcrumbList пропал"
[ -s src/components/seo/BreadcrumbJsonLd.tsx ] && ok "компонент BreadcrumbJsonLd на месте" || bad "BreadcrumbJsonLd удалён"
grep -q 'title: "Новогодние подарки в Хабаровске — купить сладкие подарки"' "src/app/(shop)/page.tsx" \
  && ok "главная: title кластера 1 сохранён" || bad "главная: title кластера 1 пропал"
! grep -q 'data-testid="home-seo"' "src/app/(shop)/page.tsx" \
  && ok "главная: SEO-блок снят (Task 151 — по прямой просьбе владельца)" || bad "главная: SEO-блок всё ещё в page.tsx"
grep -q '<h1 className="font-hero' src/components/home/Hero.tsx \
  && ok "главная: H1 — строка 1 Hero" || bad "главная: H1 в Hero пропал"
for r in cart checkout; do
  grep -q 'robots: { index: false, follow: true }' "src/app/(shop)/$r/layout.tsx" \
    && ok "/$r: noindex сохранён" || bad "/$r: noindex пропал"
done
grep -q '"/catalogs"' src/app/sitemap.ts && ok "sitemap.ts: /catalogs остался" || bad "sitemap.ts: /catalogs пропал"
! grep -q 'Покупателям' src/components/layout/Footer.tsx \
  && ok "футер: блок «Покупателям» (ссылки на лендинги) снят" || bad "футер: остался блок «Покупателям»"

echo "── B. Запечённая статика .deploy-package ──"
[ -f "$ROOT/.deploy-package/index.html" ] || { echo "нет .deploy-package — сначала MODE=both bash scripts/build-static.sh"; echo ""; echo "ИТОГО (частично, без статики): PASS=$PASS FAIL=$FAIL"; exit 2; }
D="$ROOT/.deploy-package"

for r in detskie corporate wholesale delivery; do
  [ ! -e "$D/$r" ] && ok "статика: каталога /$r нет" || bad "статика: остался каталог /$r"
done
HITS=$(grep -rlE 'href="/(detskie|corporate|wholesale|delivery)' "$D" --include='*.html' 2>/dev/null | wc -l)
[ "$HITS" = "0" ] && ok "статика: ни одной ссылки на лендинги во всех HTML" || { bad "статика: ссылки остались в $HITS файлах"; grep -rlE 'href="/(detskie|corporate|wholesale|delivery)' "$D" --include='*.html' | head -3; }
for r in detskie corporate wholesale delivery; do
  grep -q "$r</loc>" "$D/sitemap.xml" && bad "sitemap.xml: остался /$r" || ok "sitemap.xml: /$r отсутствует"
done
grep -q "catalogs</loc>" "$D/sitemap.xml" && ok "sitemap.xml: /catalogs есть" || bad "sitemap.xml: нет /catalogs"
grep -q "catalog/nabory</loc>" "$D/sitemap.xml" && ok "sitemap.xml: категория nabory есть" || bad "sitemap.xml: нет nabory"

grep -q "<title>Новогодние подарки в Хабаровске — купить сладкие подарки — Лакомка</title>" "$D/index.html" \
  && ok "главная: <title> кластера 1" || bad "главная: <title>: $(grep -o '<title>[^<]*' "$D/index.html" | head -1)"
! grep -q 'data-testid="home-seo"' "$D/index.html" && ok "главная: SEO-блок снят и в статике" || bad "в статике остался SEO-блок"
grep -q '<h1 class="font-hero' "$D/index.html" && ok "главная: H1 в Hero запечён" || bad "главная: H1 не запечён"
! grep -q 'Покупателям' "$D/index.html" && ok "главная: футер без «Покупателям»" || bad "главная: футер всё ещё содержит «Покупателям»"

grep -q "<title>Подарочные наборы конфет — купить в Хабаровске — Лакомка</title>" "$D/catalog/nabory/index.html" \
  && ok "/catalog/nabory: <title> из MAP" || bad "/catalog/nabory: <title>: $(grep -o '<title>[^<]*' "$D/catalog/nabory/index.html" 2>/dev/null | head -1)"
grep -q '<h1[^>]*>Подарочные наборы конфет</h1>' "$D/catalog/nabory/index.html" \
  && ok "/catalog/nabory: H1 из MAP" || bad "/catalog/nabory: H1 не из MAP"
grep -q '"@type":"BreadcrumbList"' "$D/catalog/nabory/index.html" \
  && ok "/catalog/nabory: BreadcrumbList" || bad "/catalog/nabory: нет BreadcrumbList"

# FAQPage-разметка была только на лендингах — нигде не должна остаться
HITS=$(grep -rl '"@type":"FAQPage"' "$D" --include='*.html' 2>/dev/null | wc -l)
[ "$HITS" = "0" ] && ok "статика: FAQPage JSON-LD нигде не остался" || { bad "FAQPage остался в $HITS файлах"; grep -rl '"@type":"FAQPage"' "$D" --include='*.html' | head -3; }

for r in cart checkout; do
  grep -q 'noindex' "$D/$r/index.html" 2>/dev/null && ok "/$r: noindex в статике" || bad "/$r: нет noindex в статике"
done
[ -s "$D/404.html" ] && ok "404.html на месте (старые URL лендингов дадут 404)" || bad "нет 404.html"
grep -q "Sitemap" "$D/robots.txt" && ok "robots.txt: sitemap указан" || bad "robots.txt: нет sitemap"

echo ""
echo "ИТОГО: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
