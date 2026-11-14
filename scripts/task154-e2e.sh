#!/bin/bash
# Task 154 E2E-обёртка: стенд .deploy-package :8096 + Playwright (task154-e2e.cjs).
# Ввод количества с клавиатуры (карточка товара, /cart, шторка).
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

echo "── 0. Стенд :8096 ──"
PORT=8096; BASE="http://127.0.0.1:$PORT"
export PHP_CLI_SERVER_WORKERS=8
pkill -f "127.0.0.1:$PORT" 2>/dev/null; sleep 1
( cd "$ROOT/.deploy-package" && setsid "$PHP" -S 127.0.0.1:$PORT "$ROOT/scripts/deploy/dev-router.php" >/tmp/t154-stand.log 2>&1 & )
for i in $(seq 1 30); do curl -s "$BASE/api/health" 2>/dev/null | grep -q ok && break; sleep 0.3; done
curl -s "$BASE/api/health" | grep -q ok && ok "стенд :$PORT поднялся" || { bad "стенд не поднялся (см. /tmp/t154-stand.log)"; exit 1; }

echo "── 1. Playwright-сценарии (A–C) ──"
node scripts/task154-e2e.cjs "$BASE"
E2E=$?
# Сирота-php держит пайп вызывающего (поймано в прошлых циклах) — гасим стенд
pkill -f "127.0.0.1:$PORT" 2>/dev/null; sleep 0.5
[ "$E2E" = "0" ] && ok "task154-e2e.cjs зелёный" || bad "task154-e2e.cjs провален"

echo ""
echo "ИТОГО: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
