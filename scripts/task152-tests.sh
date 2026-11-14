#!/bin/bash
# Task 152 тесты (статика): «Состав подарка» сворачивается до 2 рядов.
# По умолчанию видно 2 ряда карточек (ПК lg: 6 колонок → 12, планшет sm: 4 → 8,
# телефонный список — 2 позиции), остальное скрыто; по центру — обычный текст
# «показать больше», по клику раскрывается весь состав. Число колонок берётся
# из тех же брейкпоинтов, что у сетки (matchMedia 640/1024 + useSyncExternalStore).
# Вычисленные проверки на живой витрине — отдельным task152-e2e.sh.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); echo "  OK  $1"; }
bad(){ FAIL=$((FAIL+1)); echo "  FAIL $1"; }
TABS="src/components/ui/ProductTabs.tsx"

echo "── 1. TypeScript и ESLint ──"
if npx tsc --noEmit >/tmp/t152-tsc.log 2>&1; then ok "tsc --noEmit чист"; else bad "tsc: $(tail -3 /tmp/t152-tsc.log)"; fi
if npx eslint "$TABS" >/tmp/t152-eslint.log 2>&1; then ok "eslint ProductTabs чист"; else bad "eslint: $(tail -5 /tmp/t152-eslint.log)"; fi

echo "── 2. Свёртывание: 2 ряда, остальное скрыто ──"
grep -q "const COMPOSITION_COLLAPSED_ROWS = 2;" "$TABS" \
  && ok "константа COMPOSITION_COLLAPSED_ROWS = 2" \
  || bad "нет константы 2 рядов"
grep -q "const capacity = cols \* COMPOSITION_COLLAPSED_ROWS;" "$TABS" \
  && ok "capacity = cols × 2 → 12 на ПК / 8 на планшете / 2 на телефоне" \
  || bad "capacity не считается из cols × ROWS"
grep -q "!expanded && hasHiddenItems ? bundleItems.slice(0, capacity) : bundleItems;" "$TABS" \
  && ok "до expand — первые 2 ряда (slice), после — весь состав" \
  || bad "логика slice/expanded нарушена"
grep -q "const bundleItems = product.bundle_items ?? \[\];" "$TABS" \
  && ok "guard ?? []: не-наборы (bundle_items undefined) не роняют вкладку на .length" \
  || bad "нет guard'а для bundle_items (краш простых товаров)"
grep -q "const hasHiddenItems = bundleItems.length > capacity;" "$TABS" \
  && ok "кнопка появляется только когда есть что скрывать" \
  || bad "нет проверки hasHiddenItems"
[ "$(grep -c "visibleItems.map" "$TABS")" = "2" ] \
  && ok "оба представления (список и сетка) рендерят видимый срез" \
  || bad "visibleItems используется не в двух местах"

echo "── 3. Кнопка «показать больше»: текст по центру, раскрывает ──"
grep -q '{!expanded && hasHiddenItems && (' "$TABS" \
  && ok "кнопка рендерится только в свёрнутом состоянии" \
  || bad "кнопка видна и в раскрытом состоянии"
grep -q 'onClick={() => setExpanded(true)}' "$TABS" \
  && ok "клик по «показать больше» раскрывает состав" \
  || bad "кнопка не вызывает setExpanded(true)"
grep -q 'data-testid="composition-show-more"' "$TABS" \
  && ok "у кнопки есть data-testid (для e2e)" \
  || bad "нет data-testid кнопки"
grep -q 'className="mt-4 text-center"' "$TABS" \
  && ok "текст «показать больше» выровнен по центру" \
  || bad "обёртка кнопки не по центру"
grep -q '^                    показать больше$' "$TABS" \
  && ok "текст кнопки — ровно «показать больше» (в нижнем регистре, как просил владелец)" \
  || bad "текст кнопки изменён"
grep -q "text-\[var(--color-muted)\] underline-offset-4 transition hover:text-\[var(--color-heading)\] hover:underline" "$TABS" \
  && ok "стиль кнопки — простой текст (muted, hover: цвет+подчёркивание), без рамок/фона" \
  || bad "кнопка не «просто текст»"

echo "── 4. Брейкпоинты matchMedia синхронны с сеткой карточек ──"
grep -q 'window.matchMedia("(min-width: 1024px)")' "$TABS" \
  && grep -q 'window.matchMedia("(min-width: 640px)")' "$TABS" \
  && ok "matchMedia слушает 640 и 1024" \
  || bad "matchMedia не на 640/1024"
grep -q 'sm:grid sm:grid-cols-4 lg:grid-cols-6' "$TABS" \
  && ok "сетка не тронута: sm:grid-cols-4 lg:grid-cols-6 (640/1024 совпадают с matchMedia)" \
  || bad "сетка карточек изменена"
grep -q "useSyncExternalStore(subscribeCompositionCols, getCompositionCols, () => 6)" "$TABS" \
  && ok "колонки реактивны к ресайзу (useSyncExternalStore, SSR-снапшот — десктоп)" \
  || bad "нет useSyncExternalStore"
grep -q 'list-none space-y-2 p-0 sm:hidden' "$TABS" \
  && ok "телефонный список не тронут (sm:hidden)" \
  || bad "телефонный список изменён"

echo "── 5. Остальное не пострадало ──"
grep -q '{product.bundle_items!.length}' "$TABS" \
  && ok "«Позиций в наборе» в «Деталках» — полное число" \
  || bad "счётчик позиций в деталях сломан"
[ "$(grep -c 'onDetails={() => setSelected(item)}' "$TABS")" = "2" ] \
  && ok "«Подробнее» на месте и в карточке, и в строке списка" \
  || bad "кнопки «Подробнее» потерялись"
grep -q 'active === "composition" && isBundle' "$TABS" \
  && ok "вкладка «Состав подарка» рендерится как раньше" \
  || bad "условие вкладки сломано"

echo ""
echo "ИТОГО: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
