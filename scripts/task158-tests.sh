#!/bin/bash
# Task 158: три улучшения админки (просил владелец).
#
#   1. Поиск в админке без учёта регистра. LIKE в SQLite опускает
#      регистр только ASCII-букв — «сюрпризик» не находил «СЮРПРИЗИК».
#      Лечение: на соединение (Database::get) вешается SQL-функция
#      mb_lower() (mb_strtolower), ею опускаются ОБЕ стороны сравнения:
#      товары (название/SKU), конфеты (название/SKU/производитель),
#      заказы (номер с буквенным префиксом).
#   2. Блок «SEO — для поисковиков» в форме товара → скрывающаяся
#      панель: свёрнут по умолчанию, в шапке статус «заполнено /
#      не заполнено».
#   3. Блок «SEO категорий» на странице «Товары» → скрывающаяся
#      панель: свёрнут по умолчанию, в шапке «заполнено: N из M».
#   4. Быстрые действия в таблице товаров: кнопка «скрыть» одним
#      кликом гасит show_in_catalog + is_published (витрина требует
#      оба = 1), «в каталог» возвращает оба; у скрытого — метка «скрыт».
#
# Состав:
#  1. php -l изменённых, tsc, eslint.
#  2. Маркеры правок (мб-поиск, панели, быстрые действия).
#  3. Юнит: mb_lower на временной базе — и товары/конфеты/заказы
#     через СВЕЖИЙ PHP-сервер dev-бэкенда (маршруты /api/auth/login →
#     /api/admin/products?q=…): «сюрпризик» находит «СЮРПРИЗИК»,
#     «СЮРПРИЗИК» находит «сюрпризик», SKU в обоих регистрах.
#  4. E2E интерфейса — отдельно: task158-e2e.sh (стенд :8098).
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
for f in backend/src/Database.php \
         backend/src/Controllers/AdminProductsController.php \
         backend/src/Controllers/AdminCandyController.php \
         backend/src/Controllers/AdminOrdersController.php; do
  "$PHP" -l "$ROOT/$f" > /dev/null 2>&1 && ok "php -l $f" || bad "php -l $f"
done
if ./node_modules/.bin/tsc --noEmit > /tmp/tsc158.log 2>&1; then
  ok "tsc --noEmit без ошибок"
else
  bad "tsc --noEmit: $(head -3 /tmp/tsc158.log)"
fi
LINT_FILES="src/components/admin/ProductForm.tsx src/components/admin/ProductsTable.tsx src/components/admin/CategoriesSeo.tsx"
if ./node_modules/.bin/eslint $LINT_FILES > /tmp/eslint158.log 2>&1; then
  ok "eslint изменённых чист"
else
  bad "eslint: $(head -5 /tmp/eslint158.log)"
fi

echo "── 2. Маркеры правок ──"
D="backend/src/Database.php"
grep -q "sqliteCreateFunction" "$D" && grep -q "mb_lower" "$D" \
  && ok "Database: SQL-функция mb_lower регистрируется" || bad "нет mb_lower в Database.php"
grep -q "registerCaseInsensitiveHelpers" "$D" \
  && ok "Database: регистрация переиспользуемая (тесты зовут тот же путь)" || bad "нет registerCaseInsensitiveHelpers"
P="backend/src/Controllers/AdminProductsController.php"
grep -q "mb_lower(name) LIKE ? OR mb_lower(sku) LIKE ?" "$P" \
  && ok "товары: поиск по названию/SKU через mb_lower" || bad "товары: нет mb_lower-поиска"
C="backend/src/Controllers/AdminCandyController.php"
grep -q "mb_lower(p.name) LIKE ? OR mb_lower(p.sku) LIKE ? OR mb_lower(p.manufacturer) LIKE ?" "$C" \
  && ok "конфеты: поиск по названию/SKU/производителю через mb_lower" || bad "конфеты: нет mb_lower-поиска"
O="backend/src/Controllers/AdminOrdersController.php"
grep -q "mb_lower(order_number) LIKE ?" "$O" \
  && ok "заказы: поиск по номеру через mb_lower" || bad "заказы: нет mb_lower-поиска"
# старых регистра-зависимых LIKE в этих местах больше нет
grep -q "AND (name LIKE ? OR sku LIKE ?)" "$P" && bad "товары: остался старый регистр-зависимый LIKE" || ok "товары: старый LIKE вычищен"

F="src/components/admin/ProductForm.tsx"
grep -q 'data-testid="seo-panel-toggle"' "$F" \
  && ok "форма товара: SEO-панель с toggle" || bad "форма: нет seo-panel-toggle"
grep -q 'useState(false)' "$F" && grep -q "seoOpen" "$F" \
  && ok "форма товара: SEO-панель свёрнута по умолчанию" || bad "форма: SEO не свёрнут по умолчанию"
grep -q "не заполнено — можно оставить пустым" "$F" \
  && ok "форма товара: статус «не заполнено» в шапке панели" || bad "форма: нет статуса заполненности"
grep -q "заполнено" "$F" && grep -q 'text-\[#2e9e5b\]' "$F" \
  && ok "форма товара: статус «заполнено» зелёным" || bad "форма: нет зелёного статуса"
grep -q 'data-testid="seo-panel-content"' "$F" \
  && ok "форма товара: контент панели с testid" || bad "форма: нет seo-panel-content"

K="src/components/admin/CategoriesSeo.tsx"
grep -q 'data-testid="categories-seo-panel-toggle"' "$K" \
  && ok "SEO категорий: панель с toggle в шапке" || bad "SEO категорий: нет panel-toggle"
grep -q "panelOpen" "$K" && grep -q 'useState(false)' "$K" \
  && ok "SEO категорий: свёрнута по умолчанию" || bad "SEO категорий: не свёрнута"
grep -q "заполнено: \${filledCount} из \${cats.length}" "$K" \
  && ok "SEO категорий: счётчик «заполнено: N из M»" || bad "SEO категорий: нет счётчика"
grep -q 'data-testid="categories-seo-list"' "$K" \
  && ok "SEO категорий: список категорий на месте (внутри панели)" || bad "SEO категорий: пропал список"

T="src/components/admin/ProductsTable.tsx"
grep -q 'data-testid={`quick-hide-${p.id}`}' "$T" \
  && ok "таблица: кнопка «скрыть» одним кликом" || bad "таблица: нет quick-hide"
grep -q 'data-testid={`quick-show-${p.id}`}' "$T" \
  && ok "таблица: кнопка «в каталог» одним кликом" || bad "таблица: нет quick-show"
grep -q "show_in_catalog: 0, is_published: 0" "$T" \
  && ok "таблица: «скрыть» гасит ОБА флага (витрина требует оба =1)" || bad "таблица: «скрыть» не оба флага"
grep -q "show_in_catalog: 1, is_published: 1" "$T" \
  && ok "таблица: «в каталог» включает оба флага" || bad "таблица: «в каталог» не оба флага"
grep -q 'p.type !== "recipe" && (' "$T" \
  && ok "таблица: у «частей набора» быстрых действий нет" || bad "таблица: рецептам есть быстрое действие"
grep -q 'data-testid={`hidden-badge-${p.id}`}' "$T" \
  && ok "таблица: метка «скрыт» у скрытых товаров" || bad "таблица: нет метки «скрыт»"

echo "── 3. Юнит: mb_lower на временной базе ──"
TMPDB=$(mktemp /tmp/t158-XXXXXX.sqlite)
"$PHP" -r '
require $argv[1]."/backend/src/Database.php";
$pdo = new PDO("sqlite:".$argv[2]);
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
Database::registerCaseInsensitiveHelpers($pdo); // тот же продакшен-путь
$pdo->exec("CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT, sku TEXT, manufacturer TEXT, type TEXT, deleted_at TEXT)");
$in = $pdo->prepare("INSERT INTO products (name, sku, manufacturer, type) VALUES (?,?,?,\"bundle\")");
$in->execute(["СЮРПРИЗИК", "T158-ABC", "КОНТИ"]);
$in->execute(["Изюм в шоколаде", "T158-xyz", "конти"]);
// товары-поиск как в контроллере (ОБА плейсхолдера получают lowered)
$q = $pdo->prepare("SELECT COUNT(*) FROM products WHERE mb_lower(name) LIKE ? OR mb_lower(sku) LIKE ?");
$l1 = "%".mb_strtolower("сюрпризик","UTF-8")."%";
$q->execute([$l1, $l1]);
echo "prod_lower:", $q->fetchColumn(), "\n";
$l2 = "%".mb_strtolower("СЮРПРИЗИК","UTF-8")."%";
$q->execute([$l2, $l2]);
echo "prod_upper:", $q->fetchColumn(), "\n";
$l3 = "%".mb_strtolower("изюм","UTF-8")."%";
$q->execute([$l3, $l3]);
echo "prod_mixed:", $q->fetchColumn(), "\n";
$l4 = "%".mb_strtolower("t158-abc","UTF-8")."%";
$q->execute([$l4, $l4]);
echo "sku_lower:", $q->fetchColumn(), "\n";
// конфеты-поиск как в контроллере (ТРИ плейсхолдера, p. алиасы)
$q = $pdo->prepare("SELECT COUNT(*) FROM products p WHERE mb_lower(p.name) LIKE ? OR mb_lower(p.sku) LIKE ? OR mb_lower(p.manufacturer) LIKE ?");
$l5 = "%".mb_strtolower("конти","UTF-8")."%";
$q->execute([$l5, $l5, $l5]);
echo "candy_lower:", $q->fetchColumn(), "\n";
// старое поведение для сравнения: без mb_lower нижний регистр НЕ находит CAPS
$old = $pdo->prepare("SELECT COUNT(*) FROM products WHERE name LIKE ?");
$old->execute(["%сюрпризик%"]);
echo "old_like_lower:", $old->fetchColumn(), "\n";
' "$ROOT" "$TMPDB" > /tmp/t158-unit.txt 2>&1
u(){ grep -q "^$1:$2$" /tmp/t158-unit.txt && ok "$3" || bad "$3 (см. /tmp/t158-unit.txt: $(grep "^$1:" /tmp/t158-unit.txt))"; }
u prod_lower 1 "маловый запрос находит «СЮРПРИЗИК» (раньше — 0)"
u prod_upper 1 "ВЕРХНИЙ запрос тоже находит"
u prod_mixed 1 "смешанный запрос «изюм» находит «Изюм в шоколаде»"
u sku_lower 1 "SKU «t158-abc» (в нижнем) находит «T158-ABC»"
u candy_lower 2 "конфеты: «конти» в нижнем находит производителя «КОНТИ» (2 товара)"
u old_like_lower 0 "контроль: прежний LIKE в нижнем регистре НЕ находил (0) — регресс подтвердился"
rm -f "$TMPDB"

echo "── 4. Живой сервер dev-бэкенда: /api/admin/products?q=… ──"
PORT=8010
export PHP_CLI_SERVER_WORKERS=8
pkill -f "127.0.0.1:$PORT" 2>/dev/null; sleep 0.5
( cd "$ROOT/backend" && setsid "$PHP" -S 127.0.0.1:$PORT -t public >/tmp/t158-devsrv.log 2>&1 & )
for i in $(seq 1 30); do curl -s "http://127.0.0.1:$PORT/api/health" 2>/dev/null | grep -q ok && break; sleep 0.3; done
curl -s "http://127.0.0.1:$PORT/api/health" | grep -q ok && ok "dev-сервер :$PORT поднялся" || { echo "  FAIL dev-сервер не поднялся (см. /tmp/t158-devsrv.log)"; pkill -f "127.0.0.1:$PORT"; exit 1; }

# логин: в dev-БД сидим своего тест-админа (и удаляем его же перед выходом)
SEED=$("$PHP" -r '
require $argv[1]."/backend/src/Database.php";
$pdo = Database::get();
$pdo->prepare("DELETE FROM users WHERE email = ?")->execute(["t158@lakomka.local"]);
$pdo->prepare("INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)")
    ->execute(["t158@lakomka.local", password_hash("T158-Admin-2026!", PASSWORD_DEFAULT), "Тест 158", "super_admin"]);
echo "seeded";
' "$ROOT" 2>&1)
echo "$SEED" | grep -q seeded && ok "тест-админ в dev-БД" || bad "сид тест-админа: $SEED"

CJ=/tmp/t158-cookies.txt
LOGIN=$(curl -s -c "$CJ" -X POST -H "Content-Type: application/json" \
  -d '{"email":"t158@lakomka.local","password":"T158-Admin-2026!"}' \
  "http://127.0.0.1:$PORT/api/auth/login")
echo "$LOGIN" | grep -q '"ok":true\|super_admin' && ok "логин тест-админом" || bad "логин: $(echo "$LOGIN" | head -c 120)"

# имя тест-товара: гарантируем наличие CAPS-названия в dev-БД (без удаления живых)
mkout=$("$PHP" -r '
require $argv[1]."/backend/src/Database.php";
$pdo = Database::get();
$pdo->prepare("DELETE FROM products WHERE sku = ?")->execute(["T158-UNIT"]);
$pdo->prepare("DELETE FROM product_images WHERE product_id IN (SELECT id FROM products WHERE sku = ?)")->execute(["T158-UNIT"]);
$pdo->prepare("INSERT INTO products (slug, name, sku, type, price_kopecks, stock_qty, show_in_catalog, is_published) VALUES (?,?,?,?,?,?,?,?)")
    ->execute(["t158-unit", "Т158 ЮНИТ СЮРПРИЗИК", "T158-UNIT", "bundle", 0, 0, 0, 1]);
echo "created";
' "$ROOT" 2>&1)
echo "$mkout" | grep -q created && ok "тест-товар «Т158 ЮНИТ СЮРПРИЗИК» в dev-БД" || bad "создание тест-товара: $mkout"

search_test(){ # $1 = q, $2 = ожидание (кол-во с нашим SKU >= 1)
  R=$(curl -s -b "$CJ" "http://127.0.0.1:$PORT/api/admin/products?q=$1&per_page=200")
  N=$(python3 -c "
import json,sys
try:
    d=json.loads('''$R''')
    arr=d.get('data') or []
    if isinstance(arr, dict): arr=arr.get('data') or []
    print(sum(1 for x in arr if x.get('sku')=='T158-UNIT'))
except Exception as e:
    print('ERR', e)
")
  [ "$N" = "$2" ] && ok "поиск q=$1 → наш товар найден ($2)" || bad "поиск q=$1 → наш товар: $N (ожидалось $2)"
}
search_test "%D1%81%D1%8E%D1%80%D0%BF%D1%80%D0%B8%D0%B7%D0%B8%D0%BA" 1 "в живом API: q=«сюрпризик» (нижний) находит «ЮНИТ СЮРПРИЗИК»"
search_test "%D0%A1%D0%AE%D0%A0%D0%9F%D0%A0%D0%98%D0%97%D0%98%D0%9A" 1 "в живом API: q=«СЮРПРИЗИК» (верхний) тоже находит"
search_test "%D1%8E%D0%BD%D0%B8%D1%82" 1 "в живом API: q=«юнит» находит «ЮНИТ»"

# уборка
"$PHP" -r '
require $argv[1]."/backend/src/Database.php";
$pdo = Database::get();
$pdo->prepare("DELETE FROM products WHERE sku = ?")->execute(["T158-UNIT"]);
$pdo->prepare("DELETE FROM product_images WHERE product_id NOT IN (SELECT id FROM products)")->execute();
$pdo->prepare("DELETE FROM users WHERE email = ?")->execute(["t158@lakomka.local"]);
echo "cleaned";
' "$ROOT" > /dev/null 2>&1
pkill -f "127.0.0.1:$PORT" 2>/dev/null
ok "тест-товар и тест-админ вычищены, сервер остановлен"

echo ""
echo "ИТОГО: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
