#!/bin/bash
# Task 115: админ-панель — левый сайдбар вместо верхней шапки.
#   1) tsc + eslint изменённых файлов
#   2) маркеры фич в исходниках (сайдбар, бургер, активный пункт,
#      роли разделов, ShopChrome прячет витринную обвязку в /admin)
#   3) запечённый пакет: в HTML /admin/* нет шапки/футера витрины,
#      на витрине они есть; в чанках есть сайдбар; версии совпадают
#   E2E (живой браузер) — отдельным скриптом scripts/task115-e2e.sh (22 проверки).
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); echo "  OK  $1"; }
bad(){ FAIL=$((FAIL+1)); echo "  FAIL $1"; }

echo "── 1. TypeScript / ESLint ──"
if npx tsc --noEmit > /tmp/t115-tsc.log 2>&1; then ok "tsc --noEmit чист"; else bad "tsc: $(head -3 /tmp/t115-tsc.log)"; fi
ESL_FILES="src/app/admin/layout.tsx src/components/layout/ShopChrome.tsx src/app/layout.tsx"
if npx eslint $ESL_FILES > /tmp/t115-eslint.log 2>&1; then ok "eslint изменённых файлов 0"; else bad "eslint: $(head -5 /tmp/t115-eslint.log)"; fi

echo "── 2. Маркеры фич в исходниках ──"
L=src/app/admin/layout.tsx
rg -q "data-testid=\"admin-sidebar\"" "$ROOT/$L" && ok "сайдбар с testid admin-sidebar" || bad "нет admin-sidebar"
rg -q "aria-current" "$ROOT/$L" && ok "активный пункт подсвечивается (aria-current)" || bad "нет aria-current"
rg -q "Открыть меню" "$ROOT/$L" && ok "мобильный бургер (aria-label)" || bad "нет бургера"
rg -q "lg:pl-64" "$ROOT/$L" && ok "контент сдвинут под сайдбар (lg:pl-64)" || bad "нет lg:pl-64"
rg -q -- "-translate-x-full" "$ROOT/$L" && ok "на мобильном меню спрятано (translate)" || bad "нет translate-x-full"
rg -q 'roles: \["super_admin", "editor"\]' "$ROOT/$L" && ok "роли сохранены: Текст на страницах (editor+)" || bad "роли editor потеряны"
rg -q 'roles: \["super_admin"\]' "$ROOT/$L" && ok "роли сохранены: Пользователи/Настройки (super_admin)" || bad "роли super_admin потеряны"
rg -q "Escape" "$ROOT/$L" && ok "Esc закрывает меню" || bad "нет обработчика Esc"
rg -q "isLoginPage" "$ROOT/$L" && rg -q "return <>\{children\}</>;" "$ROOT/$L" && ok "страница входа рендерится без оболочки" || bad "оболочка на странице входа"
grep -q 'className="flex items-center gap-6 text-sm"' "$ROOT/$L" && bad "осталась старая горизонтальная навигация" || ok "старая верхняя навигация убрана"
rg -q "ShopChrome" "$ROOT/src/app/layout.tsx" && ok "ShopChrome подключён в корневом layout" || bad "ShopChrome не подключён"
[ "$(rg -c "<ShopChrome>" "$ROOT/src/app/layout.tsx")" = "2" ] && ok "ShopChrome оборачивает и Header, и Footer" || bad "обёрнут не весь chrome"
rg -q "pathname.startsWith\(\"/admin\"\)" "$ROOT/src/components/layout/ShopChrome.tsx" && ok "ShopChrome прячет витрину на /admin" || bad "ShopChrome без условия /admin"

echo "── 3. Запечённый пакет ──"
PKG="$ROOT/.deploy-package"
[ -f "$PKG/backend/version.json" ] || { bad "нет .deploy-package — сначала сборка"; echo "── ИТОГ: PASS=$PASS FAIL=$FAIL ──"; exit 1; }
V=$(python3 -c "import json;print(json.load(open('$PKG/backend/version.json'))['version'])")
echo "  версия пакета: $V"
grep -q "Скачать каталоги" "$PKG/index.html" && ok "на витрине шапка на месте" || bad "на витрине пропала шапка"
grep -q "WhatsApp" "$PKG/index.html" && ok "на витрине футер на месте" || bad "на витрине пропал футер"
grep -q "Скачать каталоги" "$PKG/admin/orders/index.html" && bad "в админке запечена шапка витрины" || ok "в админке нет шапки витрины"
grep -q "WhatsApp" "$PKG/admin/orders/index.html" && bad "в админке запечен футер витрины" || ok "в админке нет футера витрины"
rg -lq "admin-sidebar" "$PKG/_next/static/chunks/" && ok "сайдбар в собранных чанках" || bad "сайдбара нет в чанках"
rg -q "Открыть меню" "$PKG/_next/static/chunks/"*.js 2>/dev/null || rg -lq "Открыть меню" "$PKG/_next/static/chunks/" && ok "бургер в собранных чанках" || bad "бургера нет в чанках"

echo "── ИТОГ: PASS=$PASS FAIL=$FAIL ──"
[ "$FAIL" = "0" ]
