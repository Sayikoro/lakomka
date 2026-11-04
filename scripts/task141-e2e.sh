#!/bin/bash
# Task 141 E2E-обёртка: стенд .deploy-package :8096 + Playwright (task141-e2e.cjs).
# «Поделиться» в товаре, счётчик «До Нового года», быстрый просмотр, SEO категорий.
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
# Щит VisitGuard считает запросы по окнам, а счётчики лежат в БД пакета
# (копия dev-базы с накопленными хитами сборки) — чистим окна лимитов,
# иначе первые же загрузки страниц стенда ловят 429 «Слишком много запросов»
"$PHP" -r '$pdo=new PDO("sqlite:".$argv[1]."/backend/storage/database.sqlite"); $pdo->exec("DELETE FROM rate_limits");' "$ROOT/.deploy-package" 2>/dev/null
pkill -f "127.0.0.1:$PORT" 2>/dev/null; sleep 1
( cd "$ROOT/.deploy-package" && setsid "$PHP" -S 127.0.0.1:$PORT "$ROOT/scripts/deploy/dev-router.php" >/tmp/t141-stand.log 2>&1 & )
for i in $(seq 1 30); do curl -s "$BASE/api/health" 2>/dev/null | grep -q ok && break; sleep 0.3; done
curl -s "$BASE/api/health" | grep -q ok && ok "стенд :$PORT поднялся" || { bad "стенд не поднялся (см. /tmp/t141-stand.log)"; exit 1; }

echo "── 1. Playwright-сценарии (A–E) ──"
node scripts/task141-e2e.cjs "$BASE"
E2E=$?
[ "$E2E" = "0" ] && ok "task141-e2e.cjs зелёный" || bad "task141-e2e.cjs провален"

echo ""
echo "ИТОГО: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
