#!/bin/bash
# Task 147 тесты: внедрение семантического ядра (SEO).
# A) статический анализ: 4 новых лендинга, MAP категорий, метаданные
#    главной/каталога, H1 в Hero, sitemap, футер-перелинковка, noindex
#    корзины/чекаута, JSON-LD-компоненты;
# B) запечённая статика .deploy-package: страницы/тайтлы/канонические/
#    JSON-LD/sitemap.xml/robots.txt/футер — файлы собираются MODE=both.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); echo "  OK  $1"; }
bad(){ FAIL=$((FAIL+1)); echo "  FAIL $1"; }

PHP="$(command -v php 2>/dev/null || true)"
[ -z "$PHP" ] && [ -x "$ROOT/../.ztools/php" ] && PHP="$(readlink -f "$ROOT/../.ztools/php")"
[ -n "$PHP" ] || { echo "php не найден"; exit 1; }

echo "── A1. TypeScript и ESLint (изменённые/новые файлы) ──"
if npx tsc --noEmit >/tmp/t147-tsc.log 2>&1; then ok "tsc --noEmit чист"; else bad "tsc: $(tail -3 /tmp/t147-tsc.log)"; fi
# Hero.tsx исключён: там донашянная с master ошибка react-hooks/set-state-in-effect
# (сравнение полного прогона eslint с базой master показало 0 новых проблем)
FILES='src/lib/seo.ts src/app/(shop)/page.tsx src/app/(shop)/corporate/page.tsx src/app/(shop)/wholesale/page.tsx src/app/(shop)/delivery/page.tsx src/app/(shop)/detskie/page.tsx src/app/(shop)/catalog/page.tsx src/app/(shop)/catalog/[slug]/page.tsx src/components/layout/Footer.tsx src/components/shop/FaqList.tsx src/components/shop/CtaPanel.tsx src/components/shop/LandingHead.tsx src/components/seo/BreadcrumbJsonLd.tsx src/components/seo/FaqJsonLd.tsx src/app/sitemap.ts'
if npx eslint $FILES >/tmp/t147-eslint.log 2>&1; then ok "eslint новых/изменённых файлов чист"; else bad "eslint: $(tail -5 /tmp/t147-eslint.log)"; fi

echo "── A2. Новые лендинги и общие компоненты ──"
for f in "src/app/(shop)/corporate/page.tsx" "src/app/(shop)/wholesale/page.tsx" "src/app/(shop)/delivery/page.tsx" "src/app/(shop)/detskie/page.tsx" \
         src/lib/seo.ts src/components/shop/FaqList.tsx src/components/shop/CtaPanel.tsx src/components/shop/LandingHead.tsx \
         src/components/seo/BreadcrumbJsonLd.tsx src/components/seo/FaqJsonLd.tsx; do
  [ -s "$f" ] && ok "файл есть: $f" || bad "нет файла: $f"
done

echo "── A3. Метаданные кластеров ──"
grep -q 'title: "Новогодние подарки в Хабаровске — купить сладкие подарки"' "src/app/(shop)/page.tsx" \
  && ok "главная: title кластера 1 (новогодние/сладкие/купить)" || bad "главная: title не обновлён"
grep -q 'хабаровское производство новогодних сладких подарков' "src/app/(shop)/page.tsx" \
  && ok "главная: SEO-текст-блок внизу" || bad "главная: нет SEO-текста"
grep -q 'data-testid="home-seo"' "src/app/(shop)/page.tsx" && ok "главная: секция home-seo" || bad "главная: нет home-seo"
grep -q 'title: "Корпоративные новогодние подарки в Хабаровске"' "src/app/(shop)/corporate/page.tsx" \
  && ok "/corporate: title кластера 3" || bad "/corporate: title"
grep -q 'title: "Новогодние подарки оптом в Хабаровске"' "src/app/(shop)/wholesale/page.tsx" \
  && ok "/wholesale: title кластера 4" || bad "/wholesale: title"
grep -q 'title: "Детские новогодние подарки в Хабаровске"' "src/app/(shop)/detskie/page.tsx" \
  && ok "/detskie: title кластера 2" || bad "/detskie: title"
grep -q 'path: "/delivery"' "src/app/(shop)/delivery/page.tsx" \
  && ok "/delivery: canonical кластера 6" || bad "/delivery: canonical"
for p in corporate wholesale delivery detskie; do
  grep -q 'FaqJsonLd' "src/app/(shop)/$p/page.tsx" && grep -q 'BreadcrumbJsonLd' "src/app/(shop)/$p/page.tsx" \
    && ok "/$p: FAQPage + BreadcrumbList JSON-LD" || bad "/$p: нет JSON-LD"
done

echo "── A4. MAP категорий (кластер 5) ──"
C=$(grep -cE '^\s+(nabory|vip|zhest|igrushki|karton|meshochki|tekstil|tuby): \{' src/lib/seo.ts)
[ "$C" = "8" ] && ok "CATEGORY_SEO: 8 слагов категорий" || bad "CATEGORY_SEO: $C слагов из 8"
grep -q 'categorySeo' "src/app/(shop)/catalog/[slug]/page.tsx" \
  && ok "категории: автогенерация через categorySeo" || bad "категории: categorySeo не подключён"
grep -q 'BreadcrumbJsonLd' "src/app/(shop)/catalog/[slug]/page.tsx" \
  && ok "категории: BreadcrumbList" || bad "категории: нет BreadcrumbList"

echo "── A5. H1 главной, noindex, перелинковка, sitemap ──"
grep -q '<h1 className="font-hero' src/components/home/Hero.tsx \
  && ok "главная: H1 — строка 1 Hero (стили прежние)" || bad "главная: Hero без H1"
for r in cart checkout; do
  grep -q 'robots: { index: false, follow: true }' "src/app/(shop)/$r/layout.tsx" \
    && ok "/$r: noindex" || bad "/$r: нет noindex"
done
for l in detskie corporate wholesale delivery; do
  grep -q "href=\"/$l\"" src/components/layout/Footer.tsx && ok "футер: ссылка /$l" || bad "футер: нет /$l"
done
for r in detskie corporate wholesale delivery catalogs; do
  grep -q '"/'"$r"'"' src/app/sitemap.ts && ok "sitemap: /$r" || bad "sitemap: нет /$r"
done

echo "── A6. Факты без выдумок ──"
grep -q '5 000 ₽' "src/app/(shop)/delivery/page.tsx" && ok "/delivery: бесплатный порог 5 000 ₽" || bad "/delivery: нет порога"
grep -q 'PAYMENT.prepaymentPercent' "src/app/(shop)/delivery/page.tsx" \
  && ok "/delivery: предоплата из констант" || bad "/delivery: предоплата не из констант"
grep -q 'DISCOUNTS' "src/app/(shop)/corporate/page.tsx" \
  && ok "/corporate: скидки из констант" || bad "/corporate: скидки захардкожены"
grep -q 'COMPANY.address' "src/app/(shop)/delivery/page.tsx" \
  && ok "/delivery: адрес самовывоза из констант" || bad "/delivery: адрес захардкожен"

echo "── B. Запечённая статика .deploy-package ──"
[ -f "$ROOT/.deploy-package/index.html" ] || { echo "нет .deploy-package — сначала MODE=both bash scripts/build-static.sh"; echo ""; echo "ИТОГО (частично, без статики): PASS=$PASS FAIL=$FAIL"; exit 2; }
D="$ROOT/.deploy-package"

for r in corporate wholesale delivery detskie; do
  F="$D/$r/index.html"
  if [ -s "$F" ]; then
    ok "статика: /$r/index.html есть ($(stat -c%s "$F") б)"
  else
    bad "статика: нет /$r/index.html"
  fi
done

# Тайтлы и канонические запечённых страниц
grep -q "<title>Корпоративные новогодние подарки в Хабаровске — Лакомка</title>" "$D/corporate/index.html" \
  && ok "/corporate: <title> с брендом (template сработал)" || bad "/corporate: <title> не тот: $(grep -o '<title>[^<]*' "$D/corporate/index.html" | head -1)"
grep -q "<title>Новогодние подарки оптом в Хабаровске — Лакомка</title>" "$D/wholesale/index.html" \
  && ok "/wholesale: <title>" || bad "/wholesale: <title>"
grep -q "<title>Детские новогодние подарки в Хабаровске — Лакомка</title>" "$D/detskie/index.html" \
  && ok "/detskie: <title>" || bad "/detskie: <title>"
grep -q '<title>Доставка и оплата — Лакомка</title>' "$D/delivery/index.html" \
  && ok "/delivery: <title>" || bad "/delivery: <title>"
for r in corporate wholesale delivery detskie; do
  grep -q "rel=\"canonical\" href=\"[^\"]*/$r/\"" "$D/$r/index.html" && ok "/$r: canonical" || bad "/$r: нет canonical"
  grep -q 'application/ld+json' "$D/$r/index.html" && ok "/$r: JSON-LD запечён" || bad "/$r: нет JSON-LD"
  grep -q '"@type":"FAQPage"' "$D/$r/index.html" && ok "/$r: FAQPage в JSON-LD" || bad "/$r: нет FAQPage"
  grep -q '"@type":"BreadcrumbList"' "$D/$r/index.html" && ok "/$r: BreadcrumbList в JSON-LD" || bad "/$r: нет BreadcrumbList"
done

# Категория nabory: MAP-фраза в title/h1
grep -q "<title>Подарочные наборы конфет — купить в Хабаровске — Лакомка</title>" "$D/catalog/nabory/index.html" \
  && ok "/catalog/nabory: <title> из MAP" || bad "/catalog/nabory: <title>: $(grep -o '<title>[^<]*' "$D/catalog/nabory/index.html" 2>/dev/null | head -1)"
grep -q '<h1[^>]*>Подарочные наборы конфет</h1>' "$D/catalog/nabory/index.html" \
  && ok "/catalog/nabory: H1 из MAP" || bad "/catalog/nabory: H1 не из MAP"
grep -q '"@type":"BreadcrumbList"' "$D/catalog/nabory/index.html" \
  && ok "/catalog/nabory: BreadcrumbList" || bad "/catalog/nabory: нет BreadcrumbList"

# Главная: title кластера 1, home-seo, футер-ссылки, H1 в Hero
grep -q "<title>Новогодние подарки в Хабаровске — купить сладкие подарки — Лакомка</title>" "$D/index.html" \
  && ok "главная: <title> кластера 1" || bad "главная: <title>: $(grep -o '<title>[^<]*' "$D/index.html" | head -1)"
grep -q 'data-testid="home-seo"' "$D/index.html" && ok "главная: SEO-блок запечён" || bad "главная: нет SEO-блока"
for l in detskie corporate wholesale delivery; do
  grep -q "href=\"/$l/\"" "$D/index.html" \
    && ok "главная: футер-ссылка /$l" || bad "главная: нет футер-ссылки /$l"
done
grep -q '<h1 class="font-hero' "$D/index.html" && ok "главная: H1 в Hero запечён" || bad "главная: H1 в Hero не запечён"

# noindex корзины/чекаута в статике
for r in cart checkout; do
  grep -q 'noindex' "$D/$r/index.html" 2>/dev/null && ok "/$r: noindex в статике" || bad "/$r: нет noindex в статике"
done

# sitemap.xml: новые маршруты + категория из MAP
for r in detskie corporate wholesale delivery; do
  grep -q "$r</loc>" "$D/sitemap.xml" \
    && ok "sitemap.xml: /$r" || bad "sitemap.xml: нет /$r"
done
grep -q "catalog/nabory</loc>" "$D/sitemap.xml" \
  && ok "sitemap.xml: категория nabory" || bad "sitemap.xml: нет nabory"
# robots.txt на месте
grep -q "Sitemap" "$D/robots.txt" && ok "robots.txt: sitemap указан" || bad "robots.txt: нет sitemap"

echo ""
echo "ИТОГО: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
