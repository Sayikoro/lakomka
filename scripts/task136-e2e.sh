#!/bin/bash
# Task 136 E2E-обёртка: стенд .deploy-package :8090 + Playwright (task136-e2e.cjs).
# До браузера проверяем ЗАПЕЧЁННЫЙ HTML: сплэш должен быть первым контентом
# body, инлайн-скрипт — синтаксически валидным (node --check), фразы — внутри.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); echo "  OK  $1"; }
bad(){ FAIL=$((FAIL+1)); echo "  FAIL $1"; }

[ -f "$ROOT/.deploy-package/index.html" ] || { echo "нет .deploy-package — сначала MODE=both bash scripts/build-static.sh"; exit 1; }

PHP="$(command -v php 2>/dev/null || true)"
[ -z "$PHP" ] && [ -x "$ROOT/.ztools/php" ] && PHP="$ROOT/.ztools/php"
[ -z "$PHP" ] && [ -x "$ROOT/../.ztools/php" ] && PHP="$(readlink -f "$ROOT/../.ztools/php")"
[ -n "$PHP" ] || { echo "php не найден"; exit 1; }

echo "── 0. Запечённый HTML ──"
python3 - <<'EOF'
import re, sys
html = open('.deploy-package/index.html', encoding='utf-8').read()
errors = []
if 'id="boot-loader"' not in html:
    errors.append('нет id="boot-loader" в index.html')
i_boot = html.find('id="boot-loader"')
i_ai = html.find('data-ai-firewall')
i_theme = html.find('data-admin-theme')
if i_boot == -1 or i_ai == -1 or not (i_boot < i_ai):
    errors.append('boot-loader не раньше AiGuard-блока')
if i_theme != -1 and i_boot > i_theme:
    errors.append('boot-loader позже THEME-скрипта')
m = re.search(r'<div id="boot-loader".*?<script>(.*?)</script>', html, re.S)
if not m:
    errors.append('не нашли инлайн-скрипт после boot-loader')
else:
    open('/tmp/t136-boot.js', 'w', encoding='utf-8').write(m.group(1))
    js = m.group(1)
    for marker in ('/admin', 'DOMContentLoaded', 'pageshow', 'data-boot'):
        if marker not in js:
            errors.append('в скрипте нет ' + marker)
    if 'Упаковываем конфеты в подарок' not in js:
        errors.append('в скрипте нет JSON фраз')
cat = open('.deploy-package/catalog/index.html', encoding='utf-8').read()
if 'id="boot-loader"' not in cat:
    errors.append('каталог: нет boot-loader')
if errors:
    print('\n'.join(errors)); sys.exit(1)
EOF
[ $? -eq 0 ] && ok "index.html и catalog/: сплэш первый, скрипт извлечён" || bad "проверка запечённого HTML провалена"
node --check /tmp/t136-boot.js 2>/tmp/t136-nodecheck.log && ok "инлайн-скрипт синтаксически валиден (node --check)" || bad "node --check: $(head -2 /tmp/t136-nodecheck.log)"

echo "── 0.1 Стенд :8090 ──"
PORT=8090; BASE="http://127.0.0.1:$PORT"
export PHP_CLI_SERVER_WORKERS=8
pkill -f "127.0.0.1:$PORT" 2>/dev/null; sleep 1
( cd "$ROOT/.deploy-package" && setsid "$PHP" -S 127.0.0.1:$PORT "$ROOT/scripts/deploy/dev-router.php" >/tmp/t136-stand.log 2>&1 & )
for i in $(seq 1 30); do curl -s "$BASE/api/health" 2>/dev/null | grep -q ok && break; sleep 0.3; done
curl -s "$BASE/api/health" | grep -q ok && ok "стенд :$PORT поднялся" || bad "стенд не поднялся (см. /tmp/t136-stand.log)"

echo "── 0.2 Playwright ──"
NODE_PATH=/home/z/.npm-global/lib/node_modules node "$ROOT/scripts/task136-e2e.cjs" "$BASE"
RC=$?
if [ $RC -eq 0 ]; then ok "Playwright-сценарий зелёный"; else bad "Playwright-сценарий упал (rc=$RC)"; fi

echo ""
echo "═══ E2E-обёртка итог: PASS=$PASS FAIL=$FAIL ═══"
[ "$FAIL" = "0" ] || exit 1
