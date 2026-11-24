#!/bin/bash
# Task 160: в админке (таблица товаров) — сортировка/фильтр по тубам и
# «Без категории» (просил владелец после Task 159 про витрину).
#
# Причина (двойная, та же грабля, что в витринном каталоге до Task 159):
#   1) categoryOptions в ProductsTable рисовал только категории, реально
#      представленные товарами (фасет categoriesPresent): у пустой
#      категории «Тубы» (category_id=8, 0 товаров) плитки не было —
#      фильтр по тубам в админке невозможен;
#   2) товары с пустым category_id (в dev-БД их 134) нельзя было увидеть
#      одним кликом вовсе.
#
# Фикс:
#   - ProductsTable.tsx: categoryOptions = ВЕСЬ справочник (включая
#     пустые); новая плитка «Без категории» (data-testid=cat-none-tile)
#     → на сервер уходит category=none;
#   - AdminProductsController: category=none → SQL
#     (category_id IS NULL OR category_id = 0); фасеты цены/веса при
#     category=none считаются по этому же подмножеству.
#
# Состав:
#  1. php -l, tsc, eslint.
#  2. Маркеры фикса в ProductsTable.tsx и AdminProductsController.php.
#  3. Юнит: SQL-семантика фильтра на временной базе (NULL/0/категории).
#  4. Живой сервер dev-бэкенда (:8011): API-проверки category=none /
#     category=<id> / category=8 (пустые «Тубы») с тест-товарами.
#  5. E2E интерфейса — отдельно: task160-e2e.sh (стенд :8099).
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PHP="$(command -v php 2>/dev/null || true)"
[ -z "$PHP" ] && [ -x "$ROOT/../.ztools/php" ] && PHP="$(readlink -f "$ROOT/../.ztools/php")"
[ -n "$PHP" ] || { echo "php не найден"; exit 1; }
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); echo "  OK  $1"; }
bad(){ FAIL=$((FAIL+1)); echo "  FAIL $1"; }

echo "── 1. Синтаксис, типы, линт ──"
if "$PHP" -l backend/src/Controllers/AdminProductsController.php > /dev/null 2>&1; then
  ok "php -l контроллера товаров"
else
  bad "php -l контроллера: $($PHP -l backend/src/Controllers/AdminProductsController.php 2>&1 | tail -1)"
fi
if ./node_modules/.bin/tsc --noEmit > /tmp/tsc160.log 2>&1; then
  ok "tsc --noEmit без ошибок"
else
  bad "tsc --noEmit: $(head -3 /tmp/tsc160.log)"
fi
if ./node_modules/.bin/eslint src/components/admin/ProductsTable.tsx > /tmp/eslint160.log 2>&1; then
  ok "eslint ProductsTable без замечаний"
else
  bad "eslint ProductsTable: $(head -3 /tmp/eslint160.log)"
fi

echo "── 2. Маркеры фикса ──"
T="src/components/admin/ProductsTable.tsx"
grep -q "Task 160: плитки категорий — весь справочник" "$T" \
  && ok "таблица: комментарий Task 160 на месте" || bad "таблица: нет комментария Task 160"
grep -q "useMemo(() => categories ?? \[\], \[categories\])" "$T" \
  && ok "таблица: categoryOptions — весь справочник (включая пустые «Тубы»)" \
  || bad "таблица: categoryOptions не из полного справочника"
! grep -q "present.has(c.id)" "$T" \
  && ok "таблица: старый гейт по categoriesPresent убран (пустые категории больше не исчезают)" \
  || bad "таблица: категории всё ещё фильтруются фасетом"
grep -q 'data-testid="cat-none-tile"' "$T" \
  && ok "таблица: плитка «Без категории» с testid" || bad "таблица: нет плитки «Без категории»"
grep -q "setCategory(\"none\")" "$T" \
  && ok "таблица: клик плитки включает режим «Без категории»" || bad "таблица: setCategory(\"none\") не найден"
grep -q 'aria-pressed={category === "none"}' "$T" \
  && ok "таблица: aria-pressed у «Без категории»" || bad "таблица: нет aria-pressed none"
grep -q 'qp.set("category", "none")' "$T" \
  && ok "таблица: на сервер уходит category=none" || bad "таблица: нет category=none в запросе"
grep -q "Без категории" "$T" \
  && ok "таблица: подпись плитки «Без категории»" || bad "таблица: нет подписи"
grep -q '// slug | "all" | "none"' "$T" \
  && ok "таблица: состояние category задокументировано (slug|all|none)" || bad "таблица: нет комментария состояния"

C="backend/src/Controllers/AdminProductsController.php"
grep -q "category=<id>|none (none = без категории, Task 160)" "$C" \
  && ok "контроллер: docblock описывает category=none" || bad "контроллер: docblock не обновлён"
grep -q "\$categoryNone = (\$categoryParam === 'none')" "$C" \
  && ok "контроллер: параметр category=none распознаётся" || bad "контроллер: нет разбора none"
grep -q "AND (category_id IS NULL OR category_id = 0)" "$C" \
  && ok "контроллер: SQL-фильтр «без категории» (NULL + легаси 0)" || bad "контроллер: нет SQL-фильтра"
[ "$(grep -c "AND (category_id IS NULL OR category_id = 0)" "$C")" = "2" ] \
  && ok "контроллер: фильтр применён и к списку, и к фасетам" \
  || bad "контроллер: фильтр не в обоих местах ($(grep -c 'AND (category_id IS NULL OR category_id = 0)' "$C"))"

echo "── 3. Юнит: SQL-семантика «без категории» на временной базе ──"
TMPDB=$(mktemp /tmp/t160-XXXXXX.sqlite)
"$PHP" -r '
$pdo = new PDO("sqlite:".$argv[1]);
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$pdo->exec("CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT, category_id INTEGER, deleted_at TEXT)");
$in = $pdo->prepare("INSERT INTO products (name, category_id, deleted_at) VALUES (?,?,NULL)");
$in->execute(["Без категории NULL", null]);          // category_id IS NULL
$in->execute(["Без категории ноль", 0]);             // легаси-ноль
$in->execute(["Категория зhest", 3]);
$in->execute(["Удалённый без кат.", null]); $pdo->exec("UPDATE products SET deleted_at=\"2026-01-01\" WHERE name=\"Удалённый без кат.\"");
// фильтр как в контроллере (Task 160)
$q = $pdo->prepare("SELECT COUNT(*) FROM products WHERE deleted_at IS NULL AND (category_id IS NULL OR category_id = 0)");
$q->execute(); echo "none:", $q->fetchColumn(), "\n";
// обычный фильтр категории не задет
$q = $pdo->prepare("SELECT COUNT(*) FROM products WHERE deleted_at IS NULL AND category_id = 3");
$q->execute(); echo "cat3:", $q->fetchColumn(), "\n";
// «Тубы» (id 8, пусто) → 0, как в живой БД
$q = $pdo->prepare("SELECT COUNT(*) FROM products WHERE deleted_at IS NULL AND category_id = 8");
$q->execute(); echo "cat8:", $q->fetchColumn(), "\n";
' "$TMPDB" > /tmp/t160-unit.txt 2>&1
u(){ grep -q "^$1:$2$" /tmp/t160-unit.txt && ok "$3" || bad "$3 (см. /tmp/t160-unit.txt: $(grep "^$1:" /tmp/t160-unit.txt))"; }
u none 2 "«Без категории» ловит и NULL, и легаси-ноль (2), удалённые не считаются"
u cat3 1 "обычный фильтр category_id=<id> не задет"
u cat8 0 "пустая категория («Тубы») честно даёт 0"
rm -f "$TMPDB"

echo "── 4. Живой сервер dev-бэкенда :8011 — /api/admin/products?category=… ──"
PORT=8011
export PHP_CLI_SERVER_WORKERS=8
pkill -f "127.0.0.1:$PORT" 2>/dev/null; sleep 0.5
( cd "$ROOT/backend" && setsid "$PHP" -S 127.0.0.1:$PORT -t public >/tmp/t160-devsrv.log 2>&1 & )
for i in $(seq 1 30); do curl -s "http://127.0.0.1:$PORT/api/health" 2>/dev/null | grep -q ok && break; sleep 0.3; done
curl -s "http://127.0.0.1:$PORT/api/health" | grep -q ok && ok "dev-сервер :$PORT поднялся" || { echo "  FAIL dev-сервер не поднялся (см. /tmp/t160-devsrv.log)"; pkill -f "127.0.0.1:$PORT"; exit 1; }

# тест-админ + два тест-товара (без категории / в категории «Жесть» id=3)
SEED=$("$PHP" -r '
require $argv[1]."/backend/src/Database.php";
$pdo = Database::get();
$pdo->prepare("DELETE FROM users WHERE email = ?")->execute(["t160@lakomka.local"]);
$pdo->prepare("INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)")
    ->execute(["t160@lakomka.local", password_hash("T160-Admin-2026!", PASSWORD_DEFAULT), "Тест 160", "super_admin"]);
foreach (["T160-NONE","T160-CAT"] as $sku) {
    $pdo->prepare("DELETE FROM products WHERE sku = ?")->execute([$sku]);
    $pdo->prepare("DELETE FROM product_images WHERE product_id IN (SELECT id FROM products WHERE sku = ?)")->execute([$sku]);
}
$pdo->prepare("INSERT INTO products (slug, name, sku, type, price_kopecks, stock_qty, show_in_catalog, is_published, category_id) VALUES (?,?,?,?,?,?,?,?,NULL)")
    ->execute(["t160-none", "Т160 БЕЗ КАТЕГОРИИ", "T160-NONE", "bundle", 123000, 2, 1, 1]);
$pdo->prepare("INSERT INTO products (slug, name, sku, type, price_kopecks, stock_qty, show_in_catalog, is_published, category_id) VALUES (?,?,?,?,?,?,?,?,3)")
    ->execute(["t160-cat", "Т160 В ЖЕСТИ", "T160-CAT", "bundle", 456000, 1, 1, 1]);
echo "seeded";
' "$ROOT" 2>&1)
echo "$SEED" | grep -q seeded && ok "тест-админ и тест-товары (NONE/CAT) в dev-БД" || bad "сид: $SEED"

CJ=/tmp/t160-cookies.txt
LOGIN=$(curl -s -c "$CJ" -X POST -H "Content-Type: application/json" \
  -d '{"email":"t160@lakomka.local","password":"T160-Admin-2026!"}' \
  "http://127.0.0.1:$PORT/api/auth/login")
echo "$LOGIN" | grep -q '"ok":true\|super_admin' && ok "логин тест-админом" || bad "логин: $(echo "$LOGIN" | head -c 120)"

# ожидаемые значения — прямой SQL по той же dev-БД
EXPECT=$("$PHP" -r '
require $argv[1]."/backend/src/Database.php";
$pdo = Database::get();
$e["none_total"] = (int)$pdo->query("SELECT COUNT(*) FROM products WHERE deleted_at IS NULL AND (category_id IS NULL OR category_id = 0)")->fetchColumn();
$e["none_lo"] = (int)$pdo->query("SELECT COALESCE(MIN(price_kopecks),0) FROM products WHERE deleted_at IS NULL AND (category_id IS NULL OR category_id = 0)")->fetchColumn();
$e["none_hi"] = (int)$pdo->query("SELECT COALESCE(MAX(price_kopecks),0) FROM products WHERE deleted_at IS NULL AND (category_id IS NULL OR category_id = 0)")->fetchColumn();
$e["cat3_total"] = (int)$pdo->query("SELECT COUNT(*) FROM products WHERE deleted_at IS NULL AND category_id = 3")->fetchColumn();
echo $e["none_total"]."|".$e["none_lo"]."|".$e["none_hi"]."|".$e["cat3_total"];
' "$ROOT" 2>&1)
NONE_TOTAL=${EXPECT%%|*}; REST=${EXPECT#*|}; NONE_LO=${REST%%|*}; REST=${REST#*|}; NONE_HI=${REST%%|*}; CAT3_TOTAL=${REST##*|}
echo "  … в dev-БД ожидается: none_total=$NONE_TOTAL, цены $NONE_LO..$NONE_HI, cat3_total=$CAT3_TOTAL"

# ГРАБЛЯ (Task 158 уже ловила её соседом): /api/admin/products БЕЗ page= —
# легаси-режим (LIMIT 500), он игнорирует category — запрос обязан нести
# page=1 (UI ProductsTable всегда шлёт page=). Ответ большой — в python
# передаём ФАЙЛОМ, не argv (Argument list too long на ~135 строках JSON).
cat > /tmp/t160-check.py <<'PY'
import json, sys
mode = sys.argv[1]
r = json.load(open(sys.argv[2]))
rows = r.get("data") or []
if mode == "none":
    exp_total, exp_lo, exp_hi = int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
    bad_id = [x["id"] for x in rows if x.get("category_id") not in (None, 0)]
    print("total", r.get("total"), exp_total, "MATCH" if r.get("total") == exp_total else "MISMATCH")
    print("bad_ids", len(bad_id))
    print("has_none_row", any((x.get("sku") or "") == "T160-NONE" for x in rows))
    print("no_cat_row", not any((x.get("sku") or "") == "T160-CAT" for x in rows))
    print("price", r.get("price_min"), r.get("price_max"), exp_lo, exp_hi,
          "MATCH" if (r.get("price_min"), r.get("price_max")) == (exp_lo, exp_hi) else "MISMATCH")
elif mode == "empty":
    exp = int(sys.argv[3])
    print("empty_ok", "OK" if r.get("total") == exp and not rows else "NO", r.get("total"), len(rows))
elif mode == "cat":
    cid, exp_total = int(sys.argv[3]), int(sys.argv[4])
    sku_in, sku_out = sys.argv[5], sys.argv[6]
    okrows = all(x.get("category_id") == cid for x in rows)
    print("cat_ok", "OK" if r.get("total") == exp_total and okrows and any((x.get("sku") or "") == sku_in for x in rows) and not any((x.get("sku") or "") == sku_out for x in rows) else "NO")
PY

api(){ curl -s -b "$CJ" "http://127.0.0.1:$PORT/api/admin/products?page=1&per_page=200&$1" > /tmp/t160-api.json; }

api "category=none"
python3 /tmp/t160-check.py none /tmp/t160-api.json "$NONE_TOTAL" "$NONE_LO" "$NONE_HI" > /tmp/t160-api-none.txt
grep -q "MATCH" /tmp/t160-api-none.txt && ok "API category=none: total=$NONE_TOTAL как в SQL, у всех строк категория пуста, цены-фасеты сходятся" || bad "API category=none: $(cat /tmp/t160-api-none.txt | tr '\n' ' ')"
grep -q "has_none_row True" /tmp/t160-api-none.txt && ok "API category=none: тест-товар T160-NONE найден" || bad "API none: нет T160-NONE"
grep -q "no_cat_row True" /tmp/t160-api-none.txt && ok "API category=none: T160-CAT (в категории) отфильтрован" || bad "API none: T160-CAT протекает"

api "category=8"
python3 /tmp/t160-check.py empty /tmp/t160-api.json 0 > /tmp/t160-api-tuby.txt
grep -q "empty_ok OK" /tmp/t160-api-tuby.txt && ok "API category=8 («Тубы», пустая): честный пустой результат" || bad "API category=8: $(cat /tmp/t160-api-tuby.txt)"

api "category=3"
python3 /tmp/t160-check.py cat /tmp/t160-api.json 3 "$CAT3_TOTAL" T160-CAT T160-NONE > /tmp/t160-api-cat3.txt
grep -q "cat_ok OK" /tmp/t160-api-cat3.txt && ok "API category=3: регресс — обычный фильтр работает (total=$CAT3_TOTAL, только эта категория)" || bad "API category=3: регресс ($(cat /tmp/t160-api-cat3.txt))"

# уборка
"$PHP" -r '
require $argv[1]."/backend/src/Database.php";
$pdo = Database::get();
foreach (["T160-NONE","T160-CAT"] as $sku) {
    $pdo->prepare("DELETE FROM product_images WHERE product_id IN (SELECT id FROM products WHERE sku = ?)")->execute([$sku]);
    $pdo->prepare("DELETE FROM products WHERE sku = ?")->execute([$sku]);
}
$pdo->prepare("DELETE FROM product_images WHERE product_id NOT IN (SELECT id FROM products)")->execute();
$pdo->prepare("DELETE FROM users WHERE email = ?")->execute(["t160@lakomka.local"]);
echo "cleaned";
' "$ROOT" > /dev/null 2>&1
pkill -f "127.0.0.1:$PORT" 2>/dev/null
ok "тест-товары и тест-админ вычищены, сервер остановлен"

echo ""
echo "ИТОГО: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
