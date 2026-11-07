#!/bin/bash
# Task 150 E2E-обёртка: стенд .deploy-package :8099 + Playwright.
# В БД ПАКЕТА (не репо!) после сборки добавляется товар, которого нет
# в статике, — проверка «спасения» без вспышки 404 (Task 150).
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

echo "── 1. Стенд :8099 ──"
PORT=8099; BASE="http://127.0.0.1:$PORT"
export PHP_CLI_SERVER_WORKERS=8
"$PHP" -r '$p=new PDO("sqlite:".$argv[1]."/backend/storage/database.sqlite"); $p->setAttribute(PDO::ATTR_ERRMODE,PDO::ERRMODE_EXCEPTION); $p->exec("DELETE FROM rate_limits"); $p->exec("DELETE FROM products WHERE slug=\"test-posle-sborki\""); $p->exec("INSERT INTO products(slug,name,description,price_kopecks,show_in_catalog,is_published,stock_qty) VALUES(\"test-posle-sborki\",\"Тестовый подарок после сборки\",\"Тестовый товар, созданный после сборки пакета (Task 150).\",159000,1,1,7)"); echo "товар после сборки вставлен\n";' "$ROOT/.deploy-package" 2>&1 | tail -1
NEW_SLUG="test-posle-sborki"; NEW_NAME="Тестовый подарок после сборки"
# запечённый товар — первая папка в пакете
BAKED_SLUG="$(ls "$ROOT/.deploy-package/product/" 2>/dev/null | head -1)"
[ -n "$BAKED_SLUG" ] && ok "запечённый товар для секции C: $BAKED_SLUG" || bad "в пакете нет product/"

pkill -f "127.0.0.1:$PORT" 2>/dev/null; sleep 1
( cd "$ROOT/.deploy-package" && setsid "$PHP" -S 127.0.0.1:$PORT "$ROOT/scripts/deploy/dev-router.php" >/tmp/t150-stand.log 2>&1 & )
for i in $(seq 1 30); do curl -s "$BASE/api/health" 2>/dev/null | grep -q ok && break; sleep 0.3; done
curl -s "$BASE/api/health" | grep -q ok && ok "стенд :$PORT поднялся" || { bad "стенд не поднялся (см. /tmp/t150-stand.log)"; exit 1; }
curl -s "$BASE/api/products/$NEW_SLUG" | grep -q "$NEW_NAME" && ok "API отдаёт новый товар (спасению есть кого спасать)" || bad "API не отдаёт новый товар"

echo "── 2. Playwright-сценарии ──"
node scripts/task150-e2e.cjs "$BASE" "$NEW_SLUG" "$NEW_NAME" "$BAKED_SLUG" </dev/null
E2E=$?
[ "$E2E" = "0" ] && ok "task150-e2e.cjs зелёный" || bad "task150-e2e.cjs провален"

pkill -f "127.0.0.1:$PORT" 2>/dev/null

# 3. Уборка: тестовый товар из БД пакета, чтобы не мешать другим e2e
# (иначе он первый в живом /api/products и портит их выборку товаров)
"$PHP" -r '$p=new PDO("sqlite:".$argv[1]."/backend/storage/database.sqlite"); $p->exec("DELETE FROM products WHERE slug=\"test-posle-sborki\"");' "$ROOT/.deploy-package" 2>/dev/null

echo ""
echo "ИТОГО: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
