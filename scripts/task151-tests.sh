#!/bin/bash
# Task 151 тесты: (1) каскад CSS — правило h1..h6 перенесено в @layer base
# (корень «серого» H1 «новогодняя коллекция 2027»: unlayered-стили в
# Tailwind v4 били layered-утилиты независимо от специфичности);
# (2) гирлянда счётчика снова классическая — пятёрка цветов Task 142,
# снежинки — фирменный голубой Task 144 (откат перекраски Task 149);
# (3) SEO-текстовый блок «Новогодние подарки в Хабаровске от производителя»
# снят с главной по прямой просьбе владельца (SEO-ядро title/H1/noindex
# сохранено); (4) вычисленные стили — отдельным e2e (task151-e2e.sh).
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); echo "  OK  $1"; }
bad(){ FAIL=$((FAIL+1)); echo "  FAIL $1"; }
CSS="src/app/globals.css"
PAGE="src/app/(shop)/page.tsx"
HERO="src/components/home/Hero.tsx"
NY="src/components/home/NewYearCounter.tsx"

echo "── 1. TypeScript и ESLint ──"
if npx tsc --noEmit >/tmp/t151-tsc.log 2>&1; then ok "tsc --noEmit чист"; else bad "tsc: $(tail -3 /tmp/t151-tsc.log)"; fi
if npx eslint "$HERO" "$NY" "$PAGE" >/tmp/t151-eslint.log 2>&1; then ok "eslint изменённых tsx чист"; else bad "eslint: $(tail -5 /tmp/t151-eslint.log)"; fi

echo "── 2. Каскад: правило h1..h6 внутри @layer base (корень серого H1) ──"
BASEBLOCK="$(sed -n '/^@layer base {/,/^}/p' "$CSS")"
echo "$BASEBLOCK" | grep -q "h1, h2, h3, h4, h5, h6 {" \
  && ok "правило h1..h6 внутри @layer base" \
  || bad "правило h1..h6 НЕ в @layer base"
! head -101 "$CSS" | grep -q "h1, h2, h3, h4, h5, h6 {" \
  && ok "вне слоёв правило заголовков больше не встречается" \
  || bad "осталось unlayered-правило h1..h6 (оно било .text-white)"
grep -q 'text-white' "$HERO" \
  && grep -q '<h1 className="font-hero' "$HERO" \
  && ok "H1 Hero несёт text-white (теперь утилита реально применяется)" \
  || bad "H1 Hero потерял text-white"
! grep -q "text-white!" "$HERO" \
  && ok "Hero обходится без important-костыля" \
  || bad "в Hero появился text-white! — проверь, зачем"

echo "── 3. Гирлянда: классическая пятёрка цветов, снежинки голубые ──"
grep -q 'BULB_COLORS = \["#ff5964", "#ffd166", "#06d6a0", "#4cc9f0", "#f77fbe"\]' "$NY" \
  && ok "NewYearCounter: пятёрка цветов Task 142 возвращена" \
  || bad "BULB_COLORS (пятёрка) не найдена"
grep -q "color: BULB_COLORS\[i % BULB_COLORS.length\]" "$NY" \
  && ok "огоньки красятся по кругу из пятёрки" \
  || bad "огоньки не берут цвет из BULB_COLORS"
sed -n '/^\.ny-bulb {/,/^}/p' "$CSS" | grep -q "background: currentColor" \
  && ok ".ny-bulb: background: currentColor" \
  || bad ".ny-bulb не на currentColor"
sed -n '/@keyframes ny-twinkle/,/^}/p' "$CSS" | grep -q "currentColor" \
  && ! sed -n '/@keyframes ny-twinkle/,/^}/p' "$CSS" | grep -q "rgba(255, 255, 255" \
  && ok "ny-twinkle: цветное свечение на currentColor" \
  || bad "ny-twinkle не на currentColor"
sed -n '/^\.ny-flake {/,/^}/p' "$CSS" | grep -q "color: rgba(2, 116, 190, 0.38)" \
  && ! sed -n '/^\.ny-flake {/,/^}/p' "$CSS" | grep -q "text-shadow" \
  && ok ".ny-flake: фирменный голубой, без тени (как в Task 144)" \
  || bad ".ny-flake не голубой или с тенью"

echo "── 4. SEO-текстовый блок снят с главной (просьба владельца) ──"
! grep -q 'data-testid="home-seo"' "$PAGE" \
  && ok "в page.tsx нет секции home-seo" \
  || bad "секция home-seo осталась в page.tsx"
! grep -rq "Новогодние подарки в Хабаровске от производителя" src/ \
  && ok "заголовок SEO-блока удалён из src/" \
  || bad "где-то в src/ остался заголовок SEO-блока"
! grep -rq "хабаровское производство новогодних сладких подарков" src/ \
  && ok "первый абзац SEO-блока удалён" \
  || bad "первый абзац SEO-блока остался"
! grep -rq "школ и детских садов. Доставка по Хабаровску" src/ \
  && ok "второй абзац SEO-блока удалён" \
  || bad "второй абзац SEO-блока остался"
[ "$(grep -rl "Красный Октябрь" src/ | wc -l)" = "1" ] \
  && grep -q "Красный Октябрь" src/lib/mock-data.ts \
  && ok "«Красный Октябрь» остался только в fallback брендов (mock-data)" \
  || bad "упоминания фабрик вне mock-data.ts — проверь"
grep -q 'title: "Новогодние подарки в Хабаровске — купить сладкие подарки"' "$PAGE" \
  && ok "SEO-ядро: title кластера 1 сохранён" \
  || bad "title кластера 1 пропал"
grep -q '<h1 className="font-hero' "$HERO" \
  && ok "SEO-ядро: H1 — строка 1 Hero" \
  || bad "H1 в Hero пропал"

echo ""
echo "ИТОГО: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
