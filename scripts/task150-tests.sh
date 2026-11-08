#!/bin/bash
# Task 150 тесты: убрана вспышка 404 между прелоадером и карточкой
# «спасённого» товара (товар добавлен после сборки → Apache отдаёт 404.html,
# NotFoundView подтягивает товар из API).
# A) статический анализ: BootSplash умеет держать заставку по маркеру
#    data-boot-hold на /product/<slug>/ до сигнала __bootRelease (в обе
#    стороны — гонка с DOMContentLoaded закрыта); NotFoundView показывает
#    лоадер вместо 404 на время проверки и всегда гасит удержание;
# B) запечённая статика .deploy-package: 404.html несёт маркер и
#    hold-логику, обычные страницы (главная/запечённый товар) — нет.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); echo "  OK  $1"; }
bad(){ FAIL=$((FAIL+1)); echo "  FAIL $1"; }

echo "── A1. TypeScript и ESLint (изменённые файлы) ──"
if npx tsc --noEmit >/tmp/t150-tsc.log 2>&1; then ok "tsc --noEmit чист"; else bad "tsc: $(tail -3 /tmp/t150-tsc.log)"; fi
FILES='src/components/ui/BootSplash.tsx src/components/NotFoundView.tsx'
if npx eslint $FILES >/tmp/t150-eslint.log 2>&1; then ok "eslint изменённых файлов чист"; else bad "eslint: $(tail -5 /tmp/t150-eslint.log)"; fi

echo "── A2. BootSplash: удержание на адресах товара ──"
BS=src/components/ui/BootSplash.tsx
grep -q 'data-boot-hold' $BS && ok "BootSplash: ищет маркер [data-boot-hold]" || bad "BootSplash: маркер data-boot-hold не ищется"
grep -q 'product\\\?/\[^/\]' $BS || grep -qF '/^\\/product\\/[^/]+\\/?$/' $BS \
  && ok "BootSplash: удержание только на /product/<slug>/" || bad "BootSplash: нет проверки адреса товара"
grep -q '__bootRelease' $BS && ok "BootSplash: сигнал __bootRelease принят" || bad "BootSplash: нет __bootRelease"
grep -q '__bootEarlyRelease' $BS && ok "BootSplash: ранний сигнал (гидратация раньше DCL) принят" || bad "BootSplash: нет __bootEarlyRelease"
grep -q 'setTimeout(hide,4000)' $BS && ok "BootSplash: 4-с потолок удержания сохранён" || bad "BootSplash: 4-с потолок пропал"
grep -q 'p.indexOf("/admin")===0' $BS && ok "BootSplash: /admin* по-прежнему без заставки" || bad "BootSplash: пропуск админки сломан"

echo "── A3. NotFoundView: лоадер вместо 404 на время проверки ──"
NF=src/components/NotFoundView.tsx
grep -q 'data-boot-hold="product"' $NF && ok "NotFoundView: маркер data-boot-hold в разметке" || bad "NotFoundView: нет маркера data-boot-hold"
grep -q 'setChecking(true)' $NF && ok "NotFoundView: проверка товара помечается checking" || bad "NotFoundView: checking не ставится"
N_REL=$(grep -c 'releaseBoot()' $NF)
[ "$N_REL" -ge 3 ] && ok "NotFoundView: releaseBoot зовётся во всех исходах ($N_REL)" || bad "NotFoundView: releaseBoot зовётся только $N_REL раз"
grep -q 'useLayoutEffect' $NF && ok "NotFoundView: проверка до первой отрисовки (useLayoutEffect)" || bad "NotFoundView: нет useLayoutEffect"
grep -q 'FUNNY_PHRASES' $NF && ok "NotFoundView: лоадер с фразами бут-сплэша" || bad "NotFoundView: в лоадере нет фраз сплэша"
grep -q 'fetchLiveProductBySlug' $NF && ok "NotFoundView: спасение товара сохранено" || bad "NotFoundView: спасение товара пропало"
grep -qE 'location\.(assign|replace)|window\.location\.href *=' $NF \
  && bad "NotFoundView: появился авто-редирект (его не должно быть)" || ok "NotFoundView: авто-редиректа нет (кнопки, не принуждение)"

echo "── A4. Прочее не задето ──"
grep -q 'const NAV_WATCHDOG_MS = 8000' src/components/ui/RoutePreloader.tsx \
  && ok "RoutePreloader не тронут" || bad "RoutePreloader изменился?"
[ -f src/app/not-found.tsx ] && grep -q 'NotFoundView' src/app/not-found.tsx \
  && ok "not-found.tsx на месте" || bad "not-found.tsx сломан"

echo "── B. Запечённая статика .deploy-package ──"
if [ ! -f "$ROOT/.deploy-package/index.html" ]; then
  echo "  (пропущено: нет .deploy-package — сначала MODE=both bash scripts/build-static.sh)"
  echo ""
  echo "ИТОГО: PASS=$PASS FAIL=$FAIL"
  [ "$FAIL" = "0" ]
  exit $?
fi
P404="$ROOT/.deploy-package/404.html"
[ -f "$P404" ] && ok "404.html в пакете есть" || { bad "404.html нет в пакете"; echo "ИТОГО: PASS=$PASS FAIL=$FAIL"; [ "$FAIL" = 0 ]; exit $?; }
grep -q 'data-boot-hold="product"' "$P404" && ok "404.html: элемент-маркер data-boot-hold запечён" || bad "404.html: элемента-маркера нет"
grep -q '__bootRelease' "$P404" && ok "404.html: hold-логика BootSplash запечена" || bad "404.html: hold-логики нет"
grep -q '__bootEarlyRelease' "$P404" && ok "404.html: ранний сигнал запечён" || bad "404.html: раннего сигнала нет"
grep -q 'id="boot-loader"' "$P404" && ok "404.html: бут-сплэш запечён" || bad "404.html: бут-сплэша нет"
# Строка [data-boot-hold] в инлайн-скрипте BootSplash есть на ВСЕХ страницах
# (он из корневого layout) — утечкой не считается; ищем именно ЭЛЕМЕНТ
# data-boot-hold="product", который рендерит только NotFoundView.
if grep -q 'data-boot-hold="product"' "$ROOT/.deploy-package/index.html"; then
  bad "главная: элемент-маркер data-boot-hold протёк (должен быть только на 404)"
else
  ok "главная: без элемента-маркера (в скрипте не считается)"
fi
BAKED_PRODUCT=$(ls -d "$ROOT/.deploy-package/product/"*/ 2>/dev/null | head -1)
if [ -n "$BAKED_PRODUCT" ] && [ -f "$BAKED_PRODUCT/index.html" ]; then
  if grep -q 'data-boot-hold="product"' "$BAKED_PRODUCT/index.html"; then
    bad "запечённый товар: элемент-маркер data-boot-hold протёк"
  else
    ok "запечённый товар: без элемента-маркера (заставка не задержится)"
  fi
else
  bad "в пакете нет запечённой страницы товара"
fi

echo ""
echo "ИТОГО: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
