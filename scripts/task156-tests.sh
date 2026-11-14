#!/bin/bash
# Task 156: мигающая каретка вставки — только в полях ввода.
#
# Жалоба владельца: «кликаю на текст — внутри текста появляется I-beam
# и моргает, будто я собираюсь сам дописать текст на сайте».
# Диагностика: contenteditable/designMode в кодовой базе НЕТ (rg по src/
# и backend/, а также по запечённым страницам — только селектор CSS).
# Мигающую каретку в обычном тексте рисует режим браузера «курсорный
# просмотр» (F7 / Fn+F7; Chrome: accessibility → «Текстовый курсор»).
# Фикс: body { caret-color: transparent } (наследуется — каретка невидима
# на обычном тексте даже при включённом F7), полям ввода —
# caret-color: auto (каретка как обычно). I-beam при наведении уже
# убран блоком Task 155.
#
# Состав:
#  1. Типы (tsc) — санити.
#  2. Маркеры CSS: блок Task 156 (body transparent; поля auto),
#     cursor-блок Task 155 не задет.
#  3. Computed-style e2e — отдельно: task156-e2e.sh (стенд :8096).
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); echo "  OK  $1"; }
bad(){ FAIL=$((FAIL+1)); echo "  FAIL $1"; }

echo "── 1. Типы ──"
if ./node_modules/.bin/tsc --noEmit > /tmp/tsc156.log 2>&1; then
  ok "tsc --noEmit без ошибок"
else
  bad "tsc --noEmit: $(head -3 /tmp/tsc156.log)"
fi

echo "── 2. Маркеры CSS (globals.css) ──"
G="src/app/globals.css"
BLK="$(awk '/Каретка \(Task 156\)/,/^@layer base \{/' "$G")"
[ -n "$BLK" ] && ok "блок «Каретка (Task 156)» присутствует" || bad "блок Task 156 не найден"

echo "$BLK" | grep -q "caret-color: transparent" \
  && ok "body { caret-color: transparent } — каретка невидима на обычном тексте" \
  || bad "нет body caret-color: transparent"

echo "$BLK" | grep -q "caret-color: auto" \
  && ok "полям ввода возвращён caret-color: auto" || bad "нет caret-color: auto"

echo "$BLK" | grep -q 'input:not(\[type="checkbox"\])' \
  && ok "селектор полей ввода полный (как в Task 155)" || bad "селектор input неполный"

echo "$BLK" | grep -q "F7" \
  && ok "в комментарии задокументирована причина (F7 курсорный просмотр)" \
  || bad "нет документации причины в комментарии"

# Блок Task 155 не пострадал
grep -q "cursor: default" "$G" && grep -q "cursor: text" "$G" \
  && ok "блок Task 155 (cursor) на месте" || bad "блок Task 155 задет"

# caret-правил ровно по одному на значение
[ "$(grep -c "caret-color: transparent" "$G")" = "1" ] \
  && ok "caret-color: transparent встречается один раз" || bad "caret-color: transparent размножился"
[ "$(grep -c "caret-color: auto" "$G")" = "1" ] \
  && ok "caret-color: auto встречается один раз" || bad "caret-color: auto размножился"

# Ни одного contentEditable/designMode в КОДЕ (CSS-селектор защиты — не в счёт:
# атрибутный селектор в globals.css сам содержит строку contenteditable)
! rg -qi "contentEditable|designMode" src/ -g '*.ts' -g '*.tsx' -g '*.js' -g '*.jsx' \
  && ok "contentEditable/designMode в коде src нет (мигающая каретка — режим F7 браузера)" \
  || bad "в src появился contentEditable/designMode — пересмотреть диагноз"

echo ""
echo "ИТОГО: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
