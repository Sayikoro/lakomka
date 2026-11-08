#!/bin/bash
# Task 142 E2E-обёртка: стенд .deploy-package :8097 + Playwright.
# Хрониометр «До Нового года»: тиканье, соответствие часам, галочка,
# мобильная вёрстка, консоль. Скриншоты — task142-shots.cjs.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); echo "  OK  $1"; }
bad(){ FAIL=$((FAIL+1)); echo "  FAIL $1"; }

[ -f "$ROOT/.deploy-package/index.html" ] || { echo "нет .deploy-package — сначала MODE=both bash scripts/build-static.sh"; exit 1; }
PHP="$(command -v php 2>/dev/null || true)"
[ -z "$PHP" ] && [ -x "$ROOT/../.ztools/php" ] && PHP="$(readlink -f "$ROOT/../.ztools/php")"
[ -n "$PHP" ] || { echo "php не найден"; exit 1; }

echo "── 0. Запечённый HTML ──"
grep -q 'data-testid="newyear-counter"' "$ROOT/.deploy-package/index.html" \
  && ok "главная (статика): счётчик запечён" || bad "в статике нет счётчика"
grep -q "ny-card" "$ROOT/.deploy-package/index.html" \
  && ok "в статике карточки хронометра (серверный рендер)" || bad "в статике нет .ny-card"
grep -q "ny-bulb" "$ROOT/.deploy-package/index.html" \
  && ok "в статике гирлянда" || bad "в статике нет гирлянды"

echo "── 1. Стенд :8097 ──"
PORT=8097; BASE="http://127.0.0.1:$PORT"
export PHP_CLI_SERVER_WORKERS=8
# Щит VisitGuard считает запросы по окнам в БД пакета — чистим лимиты
"$PHP" -r '$pdo=new PDO("sqlite:".$argv[1]."/backend/storage/database.sqlite"); $pdo->exec("DELETE FROM rate_limits");' "$ROOT/.deploy-package" 2>/dev/null
pkill -f "127.0.0.1:$PORT" 2>/dev/null; sleep 1
( cd "$ROOT/.deploy-package" && setsid "$PHP" -S 127.0.0.1:$PORT "$ROOT/scripts/deploy/dev-router.php" >/tmp/t142-stand.log 2>&1 & )
for i in $(seq 1 30); do curl -s "$BASE/api/health" 2>/dev/null | grep -q ok && break; sleep 0.3; done
curl -s "$BASE/api/health" | grep -q ok && ok "стенд :$PORT поднялся" || { bad "стенд не поднялся (см. /tmp/t142-stand.log)"; exit 1; }

echo "── 2. Playwright-сценарии (A–D) ──"
node scripts/task142-e2e.cjs "$BASE"
E2E=$?
[ "$E2E" = "0" ] && ok "task142-e2e.cjs зелёный" || bad "task142-e2e.cjs провален"

echo "── 3. Скриншоты ──"
node scripts/task142-shots.cjs "$BASE" >/dev/null 2>&1 \
  && [ -s /tmp/t142-desktop.png ] && [ -s /tmp/t142-mobile.png ] \
  && ok "скриншоты сняты (/tmp/t142-desktop.png, /tmp/t142-mobile.png)" \
  || bad "скриншоты не снялись"

pkill -f "127.0.0.1:$PORT" 2>/dev/null

echo ""
echo "ИТОГО: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
