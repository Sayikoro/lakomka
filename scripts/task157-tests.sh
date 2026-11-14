#!/bin/bash
# Task 157: три точечных улучшения админки (выбор владельца из топ-50).
#
#   37. Inline-правка цены/остатка в таблице товаров — ЗАМЕЧАНИЕ: сама правка
#       уже была (инпуты с сохранением по blur). Добавлено недостающее:
#       коммит по Enter и aria-label (доступность + удобство).
#   45. Ссылка «сайт» в строке товара — открыть карточку на витрине в новой
#       вкладке; у «частей набора» (recipe) своей карточки нет — ссылки нет;
#       у скрытого товара ссылка приглушена с предупреждением в title.
#   49. «Здоровье» (вкладка в Настройках): добавлено «Изменена: <дата>» в
#       карточке БД (mtime файла базы) + предупреждение «новее последнего
#       бэкапа» — сразу видно, что копия устарела. Остальное (PHP, место,
#       бэкапы, версия) уже было.
#
# Состав:
#  1. Типы и линт (tsc + eslint изменённых), php -l Health.php.
#  2. Маркеры: ProductsTable (сайт-ссылка, Enter, aria-label),
#     Health.php (modified_at), HealthTab (Изменена/новее бэкапа).
#  3. E2E — отдельно: task157-e2e.sh (стенд :8097, логин админом).
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); echo "  OK  $1"; }
bad(){ FAIL=$((FAIL+1)); echo "  FAIL $1"; }

echo "── 1. Типы, линт, php -l ──"
if ./node_modules/.bin/tsc --noEmit > /tmp/tsc157.log 2>&1; then
  ok "tsc --noEmit без ошибок"
else
  bad "tsc --noEmit: $(head -3 /tmp/tsc157.log)"
fi
LINT_FILES="src/components/admin/ProductsTable.tsx src/components/admin/HealthTab.tsx"
if ./node_modules/.bin/eslint $LINT_FILES > /tmp/eslint157.log 2>&1; then
  ok "eslint изменённых чист"
else
  bad "eslint: $(head -5 /tmp/eslint157.log)"
fi
PHP="$(command -v php 2>/dev/null || true)"
[ -z "$PHP" ] && [ -x "$ROOT/../.ztools/php" ] && PHP="$(readlink -f "$ROOT/../.ztools/php")"
if [ -n "$PHP" ] && "$PHP" -l backend/src/Health.php > /dev/null 2>&1; then
  ok "php -l Health.php чист"
else
  bad "php -l Health.php"
fi

echo "── 2. ProductsTable: сайт-ссылка и Enter-коммит ──"
T="src/components/admin/ProductsTable.tsx"
grep -q 'data-testid={`site-link-${p.id}`}' "$T" && ok "ссылка с testid site-link-<id>" || bad "нет testid сайт-ссылки"
grep -q 'href={`/product/${p.slug}/`}' "$T" && grep -q 'target="_blank"' "$T" \
  && ok "href=/product/<slug>/ в новой вкладке" || bad "href/target не те"
grep -q 'p.type !== "recipe" && p.slug' "$T" \
  && ok "у «частей набора» ссылки нет (своей карточки не бывает)" || bad "нет условия recipe"
grep -q 'Товар скрыт из каталога — на сайте карточка недоступна' "$T" \
  && ok "скрытый товар: предупреждение в title, ссылка приглушена" || bad "нет обработки скрытого"
N_ENTER=$(grep -c 'if (e.key === "Enter") e.currentTarget.blur();' "$T")
[ "$N_ENTER" = "2" ] && ok "Enter коммитит и цену, и остаток (2 инпута)" \
  || bad "Enter-коммитов: $N_ENTER (ожидалось 2)"
grep -q 'aria-label="Цена, ₽"' "$T" && grep -q 'aria-label="Остаток, шт"' "$T" \
  && ok "aria-label полей цены и остатка" || bad "нет aria-label"

# Починка (Task 157): без неё inline-правка НИКОГДА не сохраняла —
# onBlur сравнивал ввод с уже обновлённым onChange state
grep -q "const editBase = useRef" "$T" \
  && ok "базовое значение фиксируется (editBase — починка неработавшего сохранения)" \
  || bad "нет editBase — сохранение по-прежнему мёртвое"
grep -q 'editBase.current\[p.id\]?.price' "$T" && grep -q 'editBase.current\[p.id\]?.stock' "$T" \
  && ok "onBlur сравнивает с базой при фокусе (цена и остаток)" || bad "onBlur сравнивает с изменённым state"

echo "── 3. Health: возраст БД ──"
H="backend/src/Health.php"
grep -q "'modified_at' => is_file(\$db) ? (int)@filemtime(\$db) ?: null : null" "$H" \
  && ok "Health::collect отдаёт db.modified_at (mtime файла базы)" || bad "нет modified_at в бэкенде"
F="src/components/admin/HealthTab.tsx"
grep -q "Изменена: {fmtWhen(data.db.modified_at)}" "$F" \
  && ok "HealthTab показывает «Изменена: …»" || bad "нет «Изменена» в HealthTab"
grep -q "новее последнего бэкапа" "$F" \
  && ok "предупреждение «новее последнего бэкапа»" || bad "нет предупреждения об устаревшем бэкапе"

echo ""
echo "ИТОГО: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
