#!/bin/bash
# Task 156 E2E-обёртка: стенд .deploy-package :8096 + Playwright (task156-e2e.cjs).
# Каретка: мигающая «палочка» невидима на обычном тексте, видна в полях.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

[ -f "$ROOT/.deploy-package/index.html" ] || { echo "нет .deploy-package — сначала MODE=both bash scripts/build-static.sh"; exit 1; }
PHP="$(command -v php 2>/dev/null || true)"
[ -z "$PHP" ] && [ -x "$ROOT/../.ztools/php" ] && PHP="$(readlink -f "$ROOT/../.ztools/php")"
[ -n "$PHP" ] || { echo "php не найден"; exit 1; }

echo "── 0. Стенд :8096 ──"
PORT=8096; BASE="http://127.0.0.1:$PORT"
export PHP_CLI_SERVER_WORKERS=8
pkill -f "127.0.0.1:$PORT" 2>/dev/null; sleep 1
( cd "$ROOT/.deploy-package" && setsid "$PHP" -S 127.0.0.1:$PORT "$ROOT/scripts/deploy/dev-router.php" >/tmp/t156-stand.log 2>&1 & )
for i in $(seq 1 30); do curl -s "$BASE/api/health" 2>/dev/null | grep -q ok && break; sleep 0.3; done
curl -s "$BASE/api/health" | grep -q ok && echo "  OK  стенд :$PORT поднялся" || { echo "  FAIL стенд не поднялся (см. /tmp/t156-stand.log)"; exit 1; }

echo "── 1. Playwright: computed caret-color (+cursor 155) ──"
node scripts/task156-e2e.cjs "$BASE"
E2E=$?
# Сирота-php держит пайп вызывающего — гасим стенд
pkill -f "127.0.0.1:$PORT" 2>/dev/null; sleep 0.5
[ "$E2E" = "0" ] && echo "  OK  task156-e2e.cjs зелёный" || { echo "  FAIL task156-e2e.cjs провален"; exit 1; }
