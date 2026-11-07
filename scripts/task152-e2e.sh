#!/bin/bash
# Task 152 E2E-обёртка: стенд .deploy-package :8098 + Playwright.
# «Состав подарка»: свёрнуто 2 ряда (ПК 12 карточек / планшет 8 / телефон 2
# позиции), центрированный текст «показать больше», клик раскрывает весь
# состав; счётчик после раскрытия = числу позиций в API; ресайз окна
# перестраивает срез без перезагрузки; кнопка появляется только когда
# есть что скрывать.
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

echo "── 0. Выбор наборов из БД пакета ──"
DB="$ROOT/.deploy-package/backend/storage/database.sqlite"
MANY=$(python3 -c "
import sqlite3
c = sqlite3.connect('$DB')
r = c.execute(\"SELECT p.slug FROM products p JOIN bundle_items b ON b.product_id=p.id WHERE p.type='bundle' AND p.is_published=1 AND p.deleted_at IS NULL GROUP BY p.id HAVING COUNT(*) >= 20 ORDER BY COUNT(*) DESC LIMIT 1\").fetchone()
print(r[0] if r else '')")
FEW=$(python3 -c "
import sqlite3
c = sqlite3.connect('$DB')
r = c.execute(\"SELECT p.slug FROM products p JOIN bundle_items b ON b.product_id=p.id WHERE p.type='bundle' AND p.is_published=1 AND p.deleted_at IS NULL GROUP BY p.id HAVING COUNT(*) < 12 ORDER BY COUNT(*) DESC LIMIT 1\").fetchone()
print(r[0] if r else '')")
[ -n "$MANY" ] && ok "набор с большим составом: $MANY" || { bad "не найден набор с 20+ позициями"; exit 1; }
[ -n "$FEW" ] && ok "набор с коротким составом: $FEW" || { bad "не найден набор с <12 позициями"; exit 1; }

# Простой товар (не-набор): вкладки «Состав» быть не должно, страница жива.
# Вставляем как task150 — своего простого в прод-данных сейчас нет.
SIMPLE="test152-simple"
"$PHP" -r '$p=new PDO("sqlite:".$argv[1]."/backend/storage/database.sqlite"); $p->setAttribute(PDO::ATTR_ERRMODE,PDO::ERRMODE_EXCEPTION); $p->exec("DELETE FROM products WHERE slug=\"test152-simple\""); $p->exec("INSERT INTO products(slug,name,description,type,price_kopecks,show_in_catalog,is_published,stock_qty) VALUES(\"test152-simple\",\"Тестовый простой товар 152\",\"Простой товар (Task 152).\",\"simple\",99000,1,1,3)");' "$ROOT/.deploy-package" 2>/dev/null
ok "простой товар для проверки: $SIMPLE (вставлен в БД пакета)"

echo "── 1. Стенд :8098 ──"
PORT=8098; BASE="http://127.0.0.1:$PORT"
export PHP_CLI_SERVER_WORKERS=8
"$PHP" -r '$pdo=new PDO("sqlite:".$argv[1]."/backend/storage/database.sqlite"); $pdo->exec("DELETE FROM rate_limits");' "$ROOT/.deploy-package" 2>/dev/null
pkill -f "127.0.0.1:$PORT" 2>/dev/null; sleep 1
( cd "$ROOT/.deploy-package" && setsid "$PHP" -S 127.0.0.1:$PORT "$ROOT/scripts/deploy/dev-router.php" >/tmp/t152-stand.log 2>&1 & )
for i in $(seq 1 30); do curl -s "$BASE/api/health" 2>/dev/null | grep -q ok && break; sleep 0.3; done
curl -s "$BASE/api/health" | grep -q ok && ok "стенд :$PORT поднялся" || { bad "стенд не поднялся (см. /tmp/t152-stand.log)"; exit 1; }

echo "── 2. Playwright-сценарии ──"
node scripts/task152-e2e.cjs "$BASE" "$MANY" "$FEW"
E2E=$?
[ "$E2E" = "0" ] && ok "task152-e2e.cjs зелёный" || bad "task152-e2e.cjs провален"

# уборка тестового простого товара (иначе он попадёт в живой каталог других батарей)
"$PHP" -r '$p=new PDO("sqlite:".$argv[1]."/backend/storage/database.sqlite"); $p->exec("DELETE FROM products WHERE slug=\"test152-simple\"");' "$ROOT/.deploy-package" 2>/dev/null

pkill -f "127.0.0.1:$PORT" 2>/dev/null
echo ""
echo "ИТОГО: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
