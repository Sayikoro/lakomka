#!/bin/bash
# Task 151 E2E-обёртка: стенд .deploy-package :8096 + Playwright.
# Вычисленные стили: H1 Hero белый (фикс каскада @layer base), гирлянда
# классическая пятёрка цветов, снежинки голубые, SEO-блок снят.
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
grep -q 'color:#ff5964' "$ROOT/.deploy-package/index.html" \
  && ok "в статике огонёк красный (inline color из BULB_COLORS)" || bad "в статике нет красного огонька"
! grep -q 'data-testid="home-seo"' "$ROOT/.deploy-package/index.html" \
  && ok "в статике нет SEO-блока" || bad "в статике остался SEO-блок"
grep -q '<h1 class="font-hero' "$ROOT/.deploy-package/index.html" \
  && ok "в статике H1 Hero" || bad "в статике нет H1"

echo "── 1. Стенд :8096 ──"
PORT=8096; BASE="http://127.0.0.1:$PORT"
export PHP_CLI_SERVER_WORKERS=8
"$PHP" -r '$pdo=new PDO("sqlite:".$argv[1]."/backend/storage/database.sqlite"); $pdo->exec("DELETE FROM rate_limits");' "$ROOT/.deploy-package" 2>/dev/null
pkill -f "127.0.0.1:$PORT" 2>/dev/null; sleep 1
( cd "$ROOT/.deploy-package" && setsid "$PHP" -S 127.0.0.1:$PORT "$ROOT/scripts/deploy/dev-router.php" >/tmp/t151-stand.log 2>&1 & )
for i in $(seq 1 30); do curl -s "$BASE/api/health" 2>/dev/null | grep -q ok && break; sleep 0.3; done
curl -s "$BASE/api/health" | grep -q ok && ok "стенд :$PORT поднялся" || { bad "стенд не поднялся (см. /tmp/t151-stand.log)"; exit 1; }

echo "── 2. Playwright-сценарии ──"
node scripts/task151-e2e.cjs "$BASE"
E2E=$?
[ "$E2E" = "0" ] && ok "task151-e2e.cjs зелёный" || bad "task151-e2e.cjs провален"

pkill -f "127.0.0.1:$PORT" 2>/dev/null
echo ""
echo "ИТОГО: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
