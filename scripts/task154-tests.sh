#!/bin/bash
# Task 154: ввод количества с клавиатуры (карточка товара, /cart, шторка).
#
# Состав:
#  1. Типы и линт (tsc + eslint изменённых файлов).
#  2. Маркеры QtyInput: числовой ввод, нормализация min..max, iOS-защита.
#  3. Интеграция: AddToCart / CartDrawer / страница корзины используют
#     QtyInput, старых текстовых <span> количества больше нет.
#  4. useMounted: gate корзины без setState в эффекте
#     (react-hooks/set-state-in-effect больше не срабатывает).
#  5. Логика стора корзины не изменилась: add/remove/setQty как были.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); echo "  OK  $1"; }
bad(){ FAIL=$((FAIL+1)); echo "  FAIL $1"; }

echo "── 1. Типы и линт ──"
if ./node_modules/.bin/tsc --noEmit > /tmp/tsc141.log 2>&1; then
  ok "tsc --noEmit без ошибок"
else
  bad "tsc --noEmit: $(head -3 /tmp/tsc141.log)"
fi
LINT_FILES="src/components/ui/QtyInput.tsx src/lib/use-mounted.ts src/components/ui/AddToCart.tsx src/components/cart/CartDrawer.tsx src/app/(shop)/cart/page.tsx"
if ./node_modules/.bin/eslint $LINT_FILES > /tmp/eslint141.log 2>&1; then
  ok "eslint изменённых файлов чист"
else
  bad "eslint: $(head -5 /tmp/eslint141.log)"
fi

echo "── 2. Маркеры QtyInput ──"
Q="src/components/ui/QtyInput.tsx"
grep -q 'inputMode="numeric"' "$Q" && ok "inputMode=numeric (цифровая клавиатура на телефоне)" \
  || bad "нет inputMode=numeric"
grep -q 'pattern="\[0-9\]\*"' "$Q" && ok "pattern=[0-9]*" || bad "нет pattern"
grep -q 'replace(/\\D/g, "")' "$Q" && ok "нецифровые символы отсекаются" || bad "нет фильтра цифр"
grep -q "Math.min(max, Math.max(min" "$Q" && ok "нормализация зажимается в min..max" \
  || bad "нет зажима min..max"
grep -q "String(value)" "$Q" && ok "пустое/мусорное значение откатывается к прежнему" \
  || bad "нет откката к прежнему значению"
grep -q "ArrowUp" "$Q" && ok "стрелки клавиатуры работают" || bad "нет ArrowUp/ArrowDown"
grep -q "MAX_LEN = 3" "$Q" && ok "ограничение 999 (MAX_LEN=3)" || bad "нет ограничения длины"

echo "── 3. Интеграция в трёх местах ──"
grep -q "<QtyInput" "src/components/ui/AddToCart.tsx" && ok "AddToCart использует QtyInput" \
  || bad "AddToCart без QtyInput"
grep -q '<span className="w-10 text-center font-medium">' "src/components/ui/AddToCart.tsx" \
  && bad "AddToCart: старый текстовый span количества ещё на месте" \
  || ok "AddToCart: старый span количества убран"
grep -q "<QtyInput" "src/components/cart/CartDrawer.tsx" && ok "CartDrawer использует QtyInput" \
  || bad "CartDrawer без QtyInput"
grep -q 'w-7 text-center text-\[13px\]' "src/components/cart/CartDrawer.tsx" \
  && bad "CartDrawer: старый span количества ещё на месте" \
  || ok "CartDrawer: старый span количества убран"
grep -q "<QtyInput" "src/app/(shop)/cart/page.tsx" && ok "страница /cart использует QtyInput" \
  || bad "/cart без QtyInput"
grep -q '<span className="w-10 text-center font-medium">' "src/app/(shop)/cart/page.tsx" \
  && bad "/cart: старый текстовый span количества ещё на месте" \
  || ok "/cart: старый span количества убран"
grep -q "onCommit={(q) => setQty(l.product.id, q)}" "src/components/cart/CartDrawer.tsx" \
  && ok "шторка коммитит в setQty стора" || bad "шторка не коммитит в setQty"

echo "── 4. useMounted (гигиена эффектов) ──"
U="src/lib/use-mounted.ts"
[ -f "$U" ] && grep -q "useSyncExternalStore" "$U" && ok "useMounted на useSyncExternalStore" \
  || bad "use-mounted.ts отсутствует или без useSyncExternalStore"
grep -q "setMounted(true)" "src/components/cart/CartDrawer.tsx" "src/app/(shop)/cart/page.tsx" \
  && bad "в корзине остался setState-в-эффекте (react-hooks/set-state-in-effect)" \
  || ok "setMounted(true) в эффекте больше не используется (правило react-hooks зелёное)"
grep -q "useMounted()" "src/components/cart/CartDrawer.tsx" && grep -q "useMounted()" "src/app/(shop)/cart/page.tsx" \
  && ok "оба файла корзины используют useMounted" || bad "useMounted не подключён"

echo "── 5. Логика стора корзины не тронута ──"
grep -q "qty <= 0" src/store/cart.ts && ok "setQty: qty<=0 по-прежнему удаляет строку" \
  || bad "логика setQty стора изменилась"
grep -q "ymReachGoal(\"add_to_cart\"" src/store/cart.ts && ok "цель Метрики add_to_cart на месте" \
  || bad "пропала Метрика add_to_cart"

echo ""
echo "ИТОГО: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
