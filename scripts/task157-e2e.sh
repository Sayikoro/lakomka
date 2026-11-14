#!/bin/bash
# Task 157 E2E-обёртка: сид task153 (админ/viewer/заказы в пакетной БД),
# стенд .deploy-package :8097 + Playwright (task157-e2e.cjs).
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

[ -f "$ROOT/.deploy-package/index.html" ] || { echo "нет .deploy-package — сначала MODE=both bash scripts/build-static.sh"; exit 1; }
PHP="$(command -v php 2>/dev/null || true)"
[ -z "$PHP" ] && [ -x "$ROOT/../.ztools/php" ] && PHP="$(readlink -f "$ROOT/../.ztools/php")"
[ -n "$PHP" ] || { echo "php не найден"; exit 1; }

echo "── 0. Сид (task153-e2e-seed: админ + заказы) ──"
SEED_OUT="$("$PHP" scripts/task153-e2e-seed.php 2>&1)"
echo "$SEED_OUT" | grep -q "seeded" && echo "  OK  сид выполнен" || { echo "  FAIL сид: $SEED_OUT"; exit 1; }

echo "── 1. Стенд :8097 ──"
PORT=8097; BASE="http://127.0.0.1:$PORT"
export PHP_CLI_SERVER_WORKERS=8
pkill -f "127.0.0.1:$PORT" 2>/dev/null; sleep 1
( cd "$ROOT/.deploy-package" && setsid "$PHP" -S 127.0.0.1:$PORT "$ROOT/scripts/deploy/dev-router.php" >/tmp/t157-stand.log 2>&1 & )
for i in $(seq 1 30); do curl -s "$BASE/api/health" 2>/dev/null | grep -q ok && break; sleep 0.3; done
curl -s "$BASE/api/health" | grep -q ok && echo "  OK  стенд :$PORT поднялся" || { echo "  FAIL стенд не поднялся (см. /tmp/t157-stand.log)"; exit 1; }

echo "── 2. Playwright: сайт-ссылка / inline-цена / Здоровье ──"
timeout 240 node scripts/task157-e2e.cjs "$BASE"
E2E=$?
pkill -f "127.0.0.1:$PORT" 2>/dev/null; sleep 0.5
[ "$E2E" = "0" ] && echo "  OK  task157-e2e.cjs зелёный" || { echo "  FAIL task157-e2e.cjs провален"; exit 1; }
