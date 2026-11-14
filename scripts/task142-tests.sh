#!/bin/bash
# Task 142 тесты: редизайн счётчика «До Нового года» — хрониометр
# (дни/часы/минуты/секунды) с гирляндой, снегом и живым тиканьем.
# 1) tsc + eslint; 2) юнит-проверка математики отсчёта и плюрализации;
# 3) маркеры компонента/стилей/страницы/реестра текстов.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); echo "  OK  $1"; }
bad(){ FAIL=$((FAIL+1)); echo "  FAIL $1"; }

echo "── 1. TypeScript и ESLint ──"
if npx tsc --noEmit >/tmp/t142-tsc.log 2>&1; then ok "tsc --noEmit чист"; else bad "tsc: $(tail -3 /tmp/t142-tsc.log)"; fi
if npx eslint src/components/home/NewYearCounter.tsx src/lib/newyear.ts "src/app/(shop)/page.tsx" src/lib/page-texts.ts >/tmp/t142-eslint.log 2>&1; then ok "eslint изменённых файлов чист"; else bad "eslint: $(tail -5 /tmp/t142-eslint.log)"; fi

echo "── 2. Юнит: математика отсчёта и плюрализация ──"
cat > /tmp/t142-ny.js <<'EOF'
const fs = require("fs");
let src = fs.readFileSync("src/lib/newyear.ts", "utf8")
  .replace(/export /g, "")
  .replace(/interface NyParts[\s\S]*?\n\}/, "")
  .replace(/: Date = new Date\(\)/g, " = new Date()")
  .replace(/: Date/g, "")
  .replace(/: number/g, "")
  .replace(/: string/g, "")
  .replace(/: NyParts/g, "")
  .replace(/forms: \[string, string, string\]/g, "forms");
eval(src);
const assert = (cond, msg) => { if (!cond) { console.error("FAIL: " + msg); process.exit(1); } };

/* 2026-11-04 12:30:45 → 2027-01-01 00:00:00 = 57 дней 11:29:15 */
const p = timeUntilNewYearParts(new Date(2026, 10, 4, 12, 30, 45));
assert(p.d === 57 && p.h === 11 && p.m === 29 && p.s === 15, "parts 57/11/29/15, got " + JSON.stringify(p));

/* Канун Нового года: 31.12.2026 23:59:59 → 0 дней 0 часов 0 минут 1 секунда */
const e = timeUntilNewYearParts(new Date(2026, 11, 31, 23, 59, 59));
assert(e.d === 0 && e.h === 0 && e.m === 0 && e.s === 1, "newyear eve 0/0/0/1, got " + JSON.stringify(e));

/* Сам Новый год: 1.01.2027 00:00:00 → следующий 1 января, не отрицательные */
const n = timeUntilNewYearParts(new Date(2027, 0, 1, 0, 0, 0));
assert(n.d >= 364 && n.d <= 366, "after midnight rolls to next year, got d=" + n.d);

/* newyearMidnight: от любой даты 2026 → 1 января 2027 00:00 */
const mid = newyearMidnight(new Date(2026, 4, 17, 15, 0, 0));
assert(mid.getFullYear() === 2027 && mid.getMonth() === 0 && mid.getDate() === 1
  && mid.getHours() === 0 && mid.getMinutes() === 0, "midnight 1 Jan 2027, got " + mid);

/* Старая функция (полоска-легаси, юнит task141) не сломана: ceil(57,5) = 58 */
assert(daysUntilNewYear(new Date(2026, 10, 4)) === 58, "daysUntilNewYear 4.11.2026 = 58");

/* Плюрализация: универсальная и дней */
const F = ["минута", "минуты", "минут"];
for (const [num, exp] of [[1,"минута"],[2,"минуты"],[4,"минуты"],[5,"минут"],[11,"минут"],[21,"минута"],[22,"минуты"],[25,"минут"],[101,"минута"],[112,"минут"]])
  assert(pluralPick(num, F) === exp, "pluralPick(" + num + ") = " + pluralPick(num, F) + ", ожидалось " + exp);
for (const [num, exp] of [[1,"день"],[2,"дня"],[5,"дней"],[11,"дней"],[21,"день"],[22,"дня"],[56,"дней"]])
  assert(pluralDays(num) === exp, "pluralDays(" + num + ")");
console.log("NY-OK");
EOF
node /tmp/t142-ny.js >/tmp/t142-ny.log 2>&1 \
  && ok "timeUntilNewYearParts/newyearMidnight/pluralPick/pluralDays считают верно" \
  || bad "математика отсчёта: $(cat /tmp/t142-ny.log | tail -2)"

echo "── 3. Маркеры компонента и стилей ──"
NY="$ROOT/src/components/home/NewYearCounter.tsx"
CSS="$ROOT/src/app/globals.css"
grep -q 'data-testid="newyear-counter"' "$NY" \
  && grep -q "timeUntilNewYearParts" "$NY" && grep -q "pluralPick" "$NY" && grep -q "pluralDays" "$NY" \
  && grep -q "newyear_counter_enabled" "$NY" && grep -q "home_newyear_label" "$NY" && grep -q "home_newyear_hint" "$NY" \
  && ok "NewYearCounter: testid, отсчёт, плюрализация, живая галочка, тексты реестра" \
  || bad "NewYearCounter потерял контракты Task 141"
grep -q "ny-card" "$NY" && grep -q "ny-num" "$NY" && grep -q "ny-garland" "$NY" && grep -q "ny-flake" "$NY" \
  && grep -q "padStart(2" "$NY" && grep -q "setInterval(update, 1000)" "$NY" \
  && ok "хрониометр: 4 карточки, гирлянда, снежинки, тиканье раз в секунду" \
  || bad "в компоненте нет маркеров хронометра"
grep -q 'sr-only' "$NY" && grep -q "Осталось {days}" "$NY" \
  && ok "скрин-ридерам доступна цельная фраза «Осталось N дней до Нового года»" \
  || bad "нет sr-only фразы для скрин-ридеров"
grep -q 'aria-hidden' "$NY" \
  && ok "декор (гирлянда/снежинки/свечение) скрыт от скрин-ридеров" \
  || bad "декор не помечен aria-hidden"
for K in ny-garland ny-bulb ny-flake ny-card ny-num ny-cap ny-tick; do
  grep -q "$K" "$CSS" || bad "в globals.css нет ./$K"
done
grep -q "@keyframes ny-twinkle" "$CSS" && grep -q "@keyframes ny-fall" "$CSS" && grep -q "@keyframes ny-tick" "$CSS" \
  && grep -q "prefers-reduced-motion" "$CSS" \
  && ok "globals.css: keyframes гирлянды/снега/тика + prefers-reduced-motion" \
  || bad "в globals.css нет keyframes/reduced-motion"

echo "── 4. Страница и реестр текстов ──"
grep -q "initialParts={timeUntilNewYearParts()}" "$ROOT/src/app/(shop)/page.tsx" \
  && ok "главная запекает initialParts при сборке" \
  || bad "page.tsx не передаёт initialParts"
grep -q 'def: "До Нового года осталось"' "$ROOT/src/lib/page-texts.ts" \
  && ok "дефолт надписи без числа (числа теперь в карточках)" \
  || bad "дефолт home_newyear_label не обновлён"
grep -q '"home_newyear_label"' "$ROOT/src/lib/mock-data.ts" 2>/dev/null \
  && grep -q "До Нового года осталось {days}" "$ROOT/src/lib/mock-data.ts" \
  && bad "в mock-data остался старый дефолт с {days}" \
  || ok "mock-data не конфликтует с новым дефолтом"

echo "── 5. Task 143/144: позиция, светлый дизайн как у плиток условий, плавное появление ──"
PAGE="$ROOT/src/app/(shop)/page.tsx"
NY="$ROOT/src/components/home/NewYearCounter.tsx"
CSS="$ROOT/src/app/globals.css"
LI=$(grep -n 'data-testid="home-info"' "$PAGE" | head -1 | cut -d: -f1)
LN=$(grep -n "<NewYearCounter" "$PAGE" | head -1 | cut -d: -f1)
LC=$(grep -n 'data-testid="home-cats"' "$PAGE" | head -1 | cut -d: -f1)
[ -n "$LI" ] && [ -n "$LN" ] && [ -n "$LC" ] && [ "$LI" -lt "$LN" ] && [ "$LN" -lt "$LC" ] \
  && ok "порядок на главной: плитки → счётчик → категории" \
  || bad "порядок блоков неверный (info=$LI, counter=$LN, cats=$LC)"
sed -n '/^\.ny-section {/,/^}/p' "$CSS" | grep -q "transparent" \
  && ok "фон блока прозрачный — цвет окружающих секций (фон страницы)" \
  || bad ".ny-section не прозрачный"
sed -n '/^\.ny-card {/,/^}/p' "$CSS" | grep -q "var(--color-bg)" \
  && sed -n '/^\.ny-card {/,/^}/p' "$CSS" | grep -q "var(--radius-card)" \
  && ok "карточки белые со скруглением плиток условий (bg + radius-card)" \
  || bad "карточки не в дизайне плиток условий"
sed -n '/^\.ny-num {/,/^}/p' "$CSS" | grep -q "var(--color-primary)" \
  && ok "цифры хронометра — фирменный синий" \
  || bad "цифры не фирменного синего"
sed -n '/^\.ny-cap {/,/^}/p' "$CSS" | grep -q "var(--color-muted)" \
  && ok "подписи карточек — цвет подписей сайта" \
  || bad "подписи не в цвете сайта"
grep -q 'ny-garland mt-5 w-full max-w-\[640px\]' "$NY" \
  && ok "гирлянда висит над карточками во всю их ширину" \
  || bad "гирлянда не над карточками"
grep -q "IntersectionObserver" "$NY" && grep -q 'ny-anim' "$NY" && grep -q 'ny-in' "$NY" \
  && ok "появление при скролле: IntersectionObserver + классы ny-anim/ny-in" \
  || bad "нет механики появления при скролле"
grep -q "prefers-reduced-motion" "$NY" \
  && ok "reduced-motion уважается (блок виден без анимации)" \
  || bad "в компоненте нет проверки reduced-motion"
for K in "@keyframes ny-rise" "@keyframes ny-draw" "@keyframes ny-pop" ".ny-anim:not(.ny-in) .ny-card" ".ny-in .ny-bulb"; do
  grep -q "$K" "$CSS" || bad "в globals.css нет $K"
done
grep -q "@keyframes ny-rise" "$CSS" && grep -q "@keyframes ny-draw" "$CSS" && grep -q "@keyframes ny-pop" "$CSS" \
  && grep -q ".ny-anim:not(.ny-in) .ny-card" "$CSS" && grep -q ".ny-in .ny-bulb" "$CSS" \
  && ok "анимации появления: карточки поднимаются, провод растёт, огоньки загораются" \
  || bad "не хватает keyframes появления"
grep -q ".ny-card:hover" "$CSS" \
  && ok "плавный hover-подъём карточек (как у плиток условий)" \
  || bad "нет hover-перехода карточек"
grep -q 'data-testid="home-info"' "$PAGE" && grep -q 'data-testid="home-cats"' "$PAGE" \
  && ok "секции плиток и категорий помечены testid для e2e" \
  || bad "нет testid у соседних секций"

echo "── 6. Task 151: гирлянда снова классическая (пятёрка цветов), снежинки голубые ──"
grep -q 'BULB_COLORS = \["#ff5964", "#ffd166", "#06d6a0", "#4cc9f0", "#f77fbe"\]' "$NY" \
  && ! grep -q 'BULB_COLOR = "#ffffff"' "$NY" \
  && ok "гирлянда: пятёрка классических цветов возвращена (откат Task 149)" \
  || bad "в NewYearCounter нет BULB_COLORS (пятёрки цветов)"
sed -n '/^\.ny-bulb {/,/^}/p' "$CSS" | grep -q "background: currentColor" \
  && sed -n '/^\.ny-bulb {/,/^}/p' "$CSS" | grep -q "box-shadow: 0 0 12px 3px currentColor" \
  && ok ".ny-bulb: currentColor + родное свечение (как в Task 142)" \
  || bad ".ny-bulb не на currentColor"
sed -n '/^\.ny-flake {/,/^}/p' "$CSS" | grep -q "color: rgba(2, 116, 190, 0.38)" \
  && ! sed -n '/^\.ny-flake {/,/^}/p' "$CSS" | grep -q "text-shadow" \
  && ok ".ny-flake: фирменный голубой Task 144 возвращён" \
  || bad ".ny-flake не голубой или с чужой тенью"
! sed -n '/^\.ny-flake {/,/^}/p' "$CSS" | grep -q "color: #ffffff" \
  && ok "снежинки блока больше не белые (откат перекраски Task 149)" \
  || bad ".ny-flake остался белым"
sed -n '/@keyframes ny-twinkle/,/^}/p' "$CSS" | grep -q "currentColor" \
  && ! sed -n '/@keyframes ny-twinkle/,/^}/p' "$CSS" | grep -q "rgba(255, 255, 255" \
  && ok "мерцание огоньков на currentColor (цветное свечение)" \
  || bad "в ny-twinkle нет currentColor"

echo ""
echo "ИТОГО: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
