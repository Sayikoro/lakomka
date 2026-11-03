#!/bin/bash
# Task 136: бут-сплэш «прелоадер со смешными фразами» на ПОЛНОЙ загрузке страницы.
# RoutePreloader покрывает только клиентскую навигацию (>150 мс) — после
# разгрузки Task 135 посетитель витрины его не видел, а первая загрузка
# (переход по ссылке, F5) не покрывалась вовсе. Теперь в статический HTML
# каждой страницы запекается BootSplash: белый оверлей с кольцом и фразой
# рисуется при парсинге HTML, инлайн-скрипт ротирует фразы и гасит заставку
# по DOMContentLoaded (мин. 900 мс, потолок 4 с), на /admin* — сразу.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); echo "  OK  $1"; }
bad(){ FAIL=$((FAIL+1)); echo "  FAIL $1"; }

echo "── 1. Синтаксис, типы, линт ──"
./node_modules/.bin/tsc --noEmit > /tmp/t136-tsc.log 2>&1 && ok "tsc --noEmit чист" || bad "tsc: $(head -3 /tmp/t136-tsc.log)"
./node_modules/.bin/eslint src/components/ui/BootSplash.tsx src/app/layout.tsx > /tmp/t136-eslint.log 2>&1 \
  && ok "eslint BootSplash/layout чист" || bad "eslint: $(grep -E 'error' /tmp/t136-eslint.log | head -2)"
# RoutePreloader: поправка Task 136 должна пройти линт отдельно от старой
# ротационной ремарки (set-state-in-effect там был и до задачи — не трогаем)
grep -q "data-boot" "$ROOT/src/components/ui/RoutePreloader.tsx" \
  && ok "RoutePreloader содержит страховку data-boot" || bad "RoutePreloader без data-boot"

echo "── 2. Маркеры BootSplash ──"
BS="$ROOT/src/components/ui/BootSplash.tsx"
[ -f "$BS" ] && ok "src/components/ui/BootSplash.tsx существует" || bad "нет BootSplash.tsx"
rg -qF 'id="boot-loader"' "$BS" && ok "id=boot-loader" || bad "нет id=boot-loader"
rg -qF 'id="boot-phrase"' "$BS" && ok "id=boot-phrase" || bad "нет id=boot-phrase"
rg -qF 'html[data-boot="hidden"] #boot-loader{opacity:0!important;pointer-events:none!important}' "$BS" \
  && ok "CSS: скрытие по data-boot=hidden (fade, !important перекрывает инлайн-стили)" || bad "нет CSS hidden-правила"
rg -qF 'html[data-boot="done"] #boot-loader{display:none!important}' "$BS" \
  && ok "CSS: data-boot=done убирает из потока (!important)" || bad "нет CSS done-правила"
rg -qF 'window.__bootArmed=true;' "$BS" && ok "флаг __bootArmed (скрипт — единственный владелец цикла)" || bad "нет __bootArmed"
rg -qF '@keyframes boot-vanish{to{visibility:hidden;pointer-events:none}}' "$BS" \
  && ok "CSS-страховка boot-vanish (JS выключен — гаснет через 8 с)" || bad "нет boot-vanish"
rg -qF 'suppressHydrationWarning' "$BS" && ok "фраза под suppressHydrationWarning (скрипт меняет текст — мисматча нет)" || bad "нет suppressHydrationWarning"
rg -qF 'import { FUNNY_PHRASES } from "@/lib/funny-phrases"' "$BS" && ok "фразы из общего модуля" || bad "не тот источник фраз"
rg -qF 'background: "#ffffff"' "$BS" && ok "непрозрачный белый фон (FOUC за заставкой не виден)" || bad "фон не белый"
rg -qF 'zIndex: 10000' "$BS" && ok "z-index 10000 (поверх RoutePreloader z-100)" || bad "нет z-index"
rg -qF '#0274BE' "$BS" && ok "фирменный синий кольца инлайном (не ждёт globals.css)" || bad "нет фирменного цвета"
rg -qF 'aria-hidden="true"' "$BS" && ok "aria-hidden (скринридеры не читают заставку)" || bad "нет aria-hidden"

echo "── 3. Маркеры инлайн-скрипта ──"
rg -qF 'if(p.indexOf("/admin")===0){h.setAttribute("data-boot","done");return;}' "$BS" \
  && ok "на /admin* заставка гасится сразу" || bad "нет admin-скипа"
rg -qF 'document.addEventListener("DOMContentLoaded",ready);' "$BS" \
  && ok "скрытие по DOMContentLoaded" || bad "нет DOMContentLoaded"
rg -qF 'var left=900-(Date.now()-t0);' "$BS" && ok "минимум 900 мс показа" || bad "нет мин-времени"
rg -qF 'setTimeout(hide,4000);' "$BS" && ok "потолок 4 с (сплэш не зависает)" || bad "нет потолка 4 с"
rg -qF 'window.addEventListener("pageshow",function(e){if(e.persisted)hide();});' "$BS" \
  && ok "bfcache-защита (pageshow.persisted → hide)" || bad "нет bfcache-защиты"
rg -qF 'iv=setInterval(function(){i=(i+1)%P.length;if(el)el.textContent=P[i];},1500);' "$BS" \
  && ok "ротация фраз раз в 1.5 с" || bad "нет ротации"
rg -qF 'JSON.stringify(FUNNY_PHRASES).replace(/</g, "\\u003c")' "$BS" \
  && ok "JSON фраз экранирует < (нет выхода из <script>)" || bad "нет экранирования JSON"
rg -qF 'catch(e){' "$BS" && rg -qF 'data-boot","done"' "$BS" \
  && ok "ошибка скрипта гасит заставку (не зависнет)" || bad "нет fail-safe в catch"

echo "── 4. Подключение в layout ──"
Lyt="$ROOT/src/app/layout.tsx"
LNUM=$(grep -n '<BootSplash />' "$Lyt" | head -1 | cut -d: -f1)
TNUM=$(grep -n 'THEME_NOFLASH_SCRIPT }}' "$Lyt" | head -1 | cut -d: -f1)
[ -n "$LNUM" ] && ok "layout.tsx рендерит <BootSplash />" || bad "layout не рендерит BootSplash"
[ -n "$LNUM" ] && [ -n "$TNUM" ] && [ "$LNUM" -lt "$TNUM" ] \
  && ok "BootSplash — первый элемент body (до THEME-скрипта)" || bad "BootSplash не первый: L=$LNUM T=$TNUM"
grep -n 'import { BootSplash }' "$Lyt" | head -1 | grep -q ui/BootSplash \
  && ok "импорт BootSplash на месте" || bad "нет импорта"

echo "── 5. Регресс-маркеры прелоадера навигации (Task 135 не сломан) ──"
RP="$ROOT/src/components/ui/RoutePreloader.tsx"
rg -qF 'if ((window as unknown as { __bootArmed?: boolean }).__bootArmed) return;' "$RP" \
  && ok "страховка RoutePreloader не вмешивается при живом скрипте (один цикл)" || bad "нет guard __bootArmed в RoutePreloader"
rg -qF 'NAV_WATCHDOG_MS = 8000' "$RP" && ok "сторож навигации 8 с на месте" || bad "нет сторожа"
rg -qF 'BLANK_REPAIR_MS = 2500' "$RP" && ok "ремонт пустой страницы на месте" || bad "нет BLANK_REPAIR"
rg -qF 'FUNNY_PHRASES[phraseIdx]' "$RP" && ok "оверлей навигации показывает фразы" || bad "нет фраз в RoutePreloader"
rg -qF 'z-[100]' "$RP" && ok "оверлей навигации под сплэшем (z-100 < z-10000)" || bad "нет z-[100]"

echo ""
echo "═══ Итог: PASS=$PASS FAIL=$FAIL ═══"
[ "$FAIL" = "0" ] || exit 1
