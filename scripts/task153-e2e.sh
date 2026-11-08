#!/bin/bash
# Task 152 E2E-обёртка: стенд .deploy-package :8099 + Playwright (task153-e2e.cjs).
# 12 улучшений админки + «Состав подарка» (Task 151).
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

echo "── 0. Сид данных в пакетной БД ──"
SEED_OUT="$("$PHP" scripts/task153-e2e-seed.php 2>&1)"
echo "$SEED_OUT" | grep -q "seeded orders=25" && ok "сид: 25 заказов + товары + viewer" || bad "сид: $SEED_OUT"
BIG_BUNDLE="$(echo "$SEED_OUT" | grep -oP 'big_bundle=\K.*')"
export BIG_BUNDLE

echo "── 1. Стенд :8099 ──"
PORT=8099; BASE="http://127.0.0.1:$PORT"
export PHP_CLI_SERVER_WORKERS=8
pkill -f "127.0.0.1:$PORT" 2>/dev/null; sleep 1
( cd "$ROOT/.deploy-package" && setsid "$PHP" -S 127.0.0.1:$PORT "$ROOT/scripts/deploy/dev-router.php" >/tmp/t153-stand.log 2>&1 & )
for i in $(seq 1 30); do curl -s "$BASE/api/health" 2>/dev/null | grep -q ok && break; sleep 0.3; done
curl -s "$BASE/api/health" | grep -q ok && ok "стенд :$PORT поднялся" || { bad "стенд не поднялся (см. /tmp/t153-stand.log)"; exit 1; }

echo "── 2. Playwright-сценарии (A–I) ──"
timeout 300 node scripts/task153-e2e.cjs "$BASE" > /tmp/t153-node.log 2>&1
E2E=$?
cat /tmp/t153-node.log
[ "$E2E" = "0" ] && ok "task153-e2e.cjs зелёный" || bad "task153-e2e.cjs провален"
pkill -f "127.0.0.1:$PORT" 2>/dev/null

echo "── 3. Гигиена пакетной БД ──"
"$PHP" -r '
$pdo = new PDO("sqlite:.deploy-package/backend/storage/database.sqlite");
foreach (["orders", "products", "users"] as $tbl) {}
$pdo->exec("DELETE FROM orders WHERE order_number LIKE '"'"'T153E-%'"'"'");
$pdo->exec("DELETE FROM products WHERE sku LIKE '"'"'T153E-%'"'"'");
$pdo->exec("DELETE FROM users WHERE email LIKE '"'"'t153e-%@lakomka.local'"'"'");
$o = (int)$pdo->query("SELECT COUNT(*) FROM orders WHERE order_number LIKE '"'"'T153E-%'"'"'")->fetchColumn();
echo "left=" . $o . PHP_EOL;
' > /tmp/t153-hygiene.log 2>&1
grep -q "left=0" /tmp/t153-hygiene.log && ok "тестовые данные из пакетной БД удалены" || bad "гигиена: $(cat /tmp/t153-hygiene.log)"

echo ""
echo "ИТОГО: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
