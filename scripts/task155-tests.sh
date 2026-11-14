#!/bin/bash
# Task 155: курсор — текстовый (I-beam) только в полях ввода.
#
# Жалоба владельца: «когда нажимаю на любой текст — появляется курсор
# будто это поле ввода». Причина: браузерный дефолт cursor:auto над
# текстовым содержимым — в CSS сайта не было НИ ОДНОГО cursor-правила
# для текста, это не баг компонента. Фикс в globals.css (блок Task 155):
#   body { cursor: default }         — наследуется всеми элементами;
#   input/textarea/contenteditable   — cursor: text (иначе унаследовали
#                                      бы стрелку от body);
#   button:not(:disabled)            — cursor: pointer (в UA у кнопок
#                                      default; disabled не матчится —
#                                      их disabled:cursor-* живут).
#
# Состав:
#  1. Типы (tsc) — санити после правки глобальных стилей.
#  2. Маркеры CSS: блок Task 155 в globals.css, все три правила,
#     contenteditable покрыт, нет грубого глобального `* { cursor }`.
#  3. Компонентные cursor-pointer не тронуты (выборочно).
#  4. Computed-style e2e — отдельно: task155-e2e.sh (стенд :8096).
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); echo "  OK  $1"; }
bad(){ FAIL=$((FAIL+1)); echo "  FAIL $1"; }

echo "── 1. Типы ──"
if ./node_modules/.bin/tsc --noEmit > /tmp/tsc155.log 2>&1; then
  ok "tsc --noEmit без ошибок"
else
  bad "tsc --noEmit: $(head -3 /tmp/tsc155.log)"
fi

echo "── 2. Маркеры CSS (globals.css) ──"
G="src/app/globals.css"
BLK="$(awk '/Курсор \(Task 155\)/,/^@layer base \{/' "$G")"
[ -n "$BLK" ] && ok "блок «Курсор (Task 155)» присутствует" || bad "блок Task 155 не найден"

echo "$BLK" | grep -q "^body {" && echo "$BLK" | grep -q "cursor: default" \
  && ok "body { cursor: default } — стрелка везде по умолчанию (наследование)" \
  || bad "нет body { cursor: default }"

echo "$BLK" | grep -q 'input:not(\[type="checkbox"\]):not(\[type="radio"\]):not(\[type="range"\]):not(\[type="color"\]):not(\[type="file"\]):not(\[type="submit"\]):not(\[type="button"\]):not(\[type="reset"\])' \
  && ok "текстовые input (кроме чекбоксов/слайдеров/кнопок) получают курсор" \
  || bad "селектор input неполный"

echo "$BLK" | grep -qE "^textarea," \
  && ok "textarea получает текстовый курсор" || bad "textarea не покрыт"

echo "$BLK" | grep -q '\[contenteditable="true"\]' && echo "$BLK" | grep -q '\[contenteditable=""\]' \
  && ok "contenteditable покрыт (на будущее)" || bad "contenteditable не покрыт"

echo "$BLK" | grep -q "cursor: text" \
  && ok "полям ввода возвращён cursor: text" || bad "нет cursor: text"

echo "$BLK" | grep -q "button:not(:disabled)" && echo "$BLK" | grep -q "cursor: pointer" \
  && ok "кнопкам задан pointer (disabled не матчится — их cursor-* живы)" \
  || bad "нет button:not(:disabled) pointer"

! grep -qE '^\* *\{' "$G" \
  && ok "нет глобального «* { … }» правила (не ломает pointer-утилиты)" \
  || bad "найдено глобальное «* { … }» — опасно"

grep -q "cursor: text" "$G" && ! grep -c "cursor: text" "$G" | grep -qv "^1$" \
  && ok "cursor: text встречается ровно один раз (только Task 155)" \
  || bad "cursor: text размножился по файлу"

echo "── 3. Компонентные pointer-классы не тронуты ──"
grep -q "cursor-pointer" src/components/cart/CartDrawer.tsx \
  && ok "CartDrawer cursor-pointer на месте" || bad "CartDrawer потерял cursor-pointer"
grep -q "cursor-pointer" src/components/layout/Header.tsx \
  && ok "Header cursor-pointer на месте" || bad "Header потерял cursor-pointer"
grep -q "disabled:cursor-not-allowed" src/components/admin/SiteUpdateTab.tsx \
  && ok "disabled:cursor-not-allowed (админка) на месте" || bad "админный disabled:cursor-* потерян"

echo ""
echo "ИТОГО: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
