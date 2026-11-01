#!/usr/bin/env bash
# Тесты Task 97-106 — 10 улучшений админки:
#   97 — бейдж заказов (unread-эндпоинт);
#   98 — дублирование товара;
#   99 — массовые операции (status/category/price_percent/delete);
#  100 — мягкое удаление товаров + корзина файлов + restore + purge;
#  101 — медиа-счётчики (imgs/vids) в списке товаров;
#  103 — неиспользуемые файлы (unused + unused-purge, referenced-защита);
#  104 — журнал действий (admin_log + эндпоинт /admin/log);
#  105 — бэкап БД (/admin/db-backup, SQLite-заголовок);
#  106 — миграция 004 (admin_log + products.deleted_at).
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
PHP="$(command -v php || true)"
if [ -z "$PHP" ]; then
  for c in "$ROOT/.ztools/php" "$ROOT/.ztools/bin" "$ROOT/../.ztools/php" "$ROOT/../.ztools/bin"; do
    if [ -x "$c" ]; then PHP="$c"; break; fi
  done
fi
[ -n "$PHP" ] || { echo "php не найден"; exit 1; }
PORT=8016
BASE="http://127.0.0.1:$PORT/api"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  OK  $1"; }
bad()  { FAIL=$((FAIL+1)); echo "FAIL  $1"; }
check(){ if [ "$1" = "$2" ]; then ok "$3"; else bad "$3 (ожидалось '$2', получено '$1')"; fi; }
jget(){ python3 -c "
import json,sys
try:
    d=json.loads(sys.argv[1])
    for k in sys.argv[2].split('.'):
        d=d[int(k)] if k.lstrip('-').isdigit() else d[k]
    if isinstance(d,bool): d=str(d).lower()
    print(d)
except Exception:
    print('')" "$1" "$2" 2>/dev/null; }
mkdir -p /tmp/t97
TS=$(date +%s)
SLUG_A="test-97-a-$TS"
SLUG_B="test-97-b-$TS"

echo "── Старт сервера :$PORT ──"
pkill -f "php.*127.0.0.1:$PORT" 2>/dev/null; sleep 1
( setsid "$PHP" -S 127.0.0.1:$PORT backend/public/index.php >/tmp/t97-php.log 2>&1 & )
for i in $(seq 1 20); do
  curl -s "http://127.0.0.1:$PORT/api/health" | grep -q ok && break
  sleep 0.5
done
curl -s "$BASE/health" | grep -q ok && ok "сервер поднялся" || bad "сервер не поднялся"

CJ=/tmp/t97-cookies.txt
LOGIN=$(curl -s -c "$CJ" -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"admin@lakomka.local","password":"Lakomka2026!"}')
[ -n "$(jget "$LOGIN" "data.token")" ] && ok "админ залогинен" || bad "логин не удался: $LOGIN"

echo "── Task 106: миграция 004 ──"
$PHP -r '
$pdo = new PDO("sqlite:backend/storage/database.sqlite");
$t = $pdo->query("SELECT name FROM sqlite_master WHERE type=\"table\" AND name=\"admin_log\"")->fetchColumn();
echo $t ? "log-ok\n" : "log-missing\n";
$cols = $pdo->query("PRAGMA table_info(products)")->fetchAll(PDO::FETCH_COLUMN, 1);
echo in_array("deleted_at", $cols, true) ? "del-ok\n" : "del-missing\n";
' > /tmp/t97-mig.log 2>&1
grep -q "log-ok" /tmp/t97-mig.log && ok "таблица admin_log создана" || bad "admin_log отсутствует"
grep -q "del-ok" /tmp/t97-mig.log && ok "products.deleted_at добавлен" || bad "deleted_at отсутствует"

echo "── Посев товаров и файлов ──"
PA=$(curl -s -b "$CJ" -X POST "$BASE/admin/products" -H "Content-Type: application/json" \
  -d "{\"name\":\"Тест 97 А\",\"slug\":\"$SLUG_A\",\"type\":\"simple\",\"price_kopecks\":100000,\"show_in_catalog\":1,\"is_published\":1}")
PID_A=$(jget "$PA" "data.id")
[ -n "$PID_A" ] && ok "товар А создан (#$PID_A)" || bad "товар А не создался: $PA"
PB=$(curl -s -b "$CJ" -X POST "$BASE/admin/products" -H "Content-Type: application/json" \
  -d "{\"name\":\"Тест 97 Б\",\"slug\":\"$SLUG_B\",\"type\":\"simple\",\"price_kopecks\":250000,\"show_in_catalog\":1,\"is_published\":1}")
PID_B=$(jget "$PB" "data.id")
[ -n "$PID_B" ] && ok "товар Б создан (#$PID_B)" || bad "товар Б не создался: $PB"

mkdir -p "public/uploads/тест 97"
printf 'hello-97' > "public/uploads/тест 97/свободный.txt"
printf 'used-97' > "public/uploads/тест 97/занятый.txt"
$PHP -r '
$pdo = new PDO("sqlite:backend/storage/database.sqlite");
$pdo->prepare("INSERT INTO product_images (product_id, url, alt, media_type, sort_order) VALUES (?, ?, ?, \"image\", 0)")
    ->execute([(int)$argv[1], "/uploads/тест 97/занятый.txt", null]);
$pdo->prepare("INSERT INTO product_images (product_id, url, alt, media_type, sort_order) VALUES (?, ?, ?, \"video\", 1)")
    ->execute([(int)$argv[1], "/uploads/тест 97/клип.mp4", null]);
echo "seeded\n";
' "$PID_A" >/dev/null 2>&1 && ok "привязки посеяны (файл + видео)" || bad "посев привязок не удался"

echo "── Task 101: медиа-счётчики в списке ──"
LIST=$(curl -s -b "$CJ" -G "$BASE/admin/products" --data-urlencode "q=Тест 97 А")
check "$(jget "$LIST" "data.0.imgs")" "1" "imgs=1 у товара А"
check "$(jget "$LIST" "data.0.vids")" "1" "vids=1 у товара А"

echo "── Task 98: дублирование ──"
DUP=$(curl -s -b "$CJ" -X POST "$BASE/admin/products/$PID_A/duplicate")
DUP_ID=$(jget "$DUP" "data.id")
check "$(jget "$DUP" "data.slug")" "$SLUG_A-copy" "slug копии — <slug>-copy"
NAME_A=$(jget "$(curl -s -b "$CJ" "$BASE/admin/products/$PID_A")" "data.name")
check "$(jget "$DUP" "data.name")" "${NAME_A} (копия)" "имя копии с «(копия)»"
DUPROW=$(curl -s -b "$CJ" "$BASE/admin/products/$DUP_ID")
check "$(jget "$DUPROW" "data.is_published")" "0" "копия — черновик (is_published=0)"
$PHP -r '
$pdo = new PDO("sqlite:backend/storage/database.sqlite");
$n = (int)$pdo->query("SELECT COUNT(*) FROM product_images WHERE product_id = " . (int)$argv[1])->fetchColumn();
echo $n;
' "$DUP_ID" > /tmp/t97-dupmedia.log 2>&1
check "$(cat /tmp/t97-dupmedia.log)" "2" "копия получила обе медиа-записи"

echo "── Task 99: массовые операции ──"
R=$(curl -s -b "$CJ" -X POST "$BASE/admin/products/bulk" -H "Content-Type: application/json" \
  -d "{\"ids\":[$PID_A,$PID_B],\"action\":\"status\",\"value\":{\"is_published\":0}}")
check "$(jget "$R" "data.updated")" "2" "bulk status: скрыто 2 товара"
PUBA=$(jget "$(curl -s -b "$CJ" "$BASE/admin/products/$PID_A")" "data.is_published")
check "$PUBA" "0" "товар А скрыт после bulk"
R=$(curl -s -b "$CJ" -X POST "$BASE/admin/products/bulk" -H "Content-Type: application/json" \
  -d "{\"ids\":[$PID_A],\"action\":\"price_percent\",\"value\":10}")
check "$(jget "$R" "data.updated")" "1" "bulk price: изменён 1"
PRICE=$(jget "$(curl -s -b "$CJ" "$BASE/admin/products/$PID_A")" "data.price_kopecks")
check "$PRICE" "110000" "цена 1000 ₽ +10% = 1100 ₽ (округление до рубля)"
R=$(curl -s -b "$CJ" -X POST "$BASE/admin/products/bulk" -H "Content-Type: application/json" \
  -d "{\"ids\":[$PID_A],\"action\":\"price_percent\",\"value\":0}")
check "$(jget "$R" "error" 2>/dev/null || echo x)" "Процент от -90 до 90, не 0" "bulk price 0% отклоняется"
CATS=$(curl -s "$BASE/categories")
CAT_ID=$(echo "$CATS" | python3 -c "import sys,json; d=json.load(sys.stdin)['data']; print(d[0]['id'] if d else '')")
if [ -n "$CAT_ID" ]; then
  R=$(curl -s -b "$CJ" -X POST "$BASE/admin/products/bulk" -H "Content-Type: application/json" \
    -d "{\"ids\":[$PID_B],\"action\":\"category\",\"value\":$CAT_ID}")
  check "$(jget "$R" "data.updated")" "1" "bulk category: назначена категория #$CAT_ID"
else
  ok "категорий нет — bulk category пропущен"
fi

echo "── Task 100: корзина файлов ──"
R=$(curl -s -b "$CJ" -X POST "$BASE/admin/files/delete" -H "Content-Type: application/json" \
  -d '{"path":"media/тест 97/свободный.txt"}')
check "$(jget "$R" "data.trashed")" "true" "media-удаление = перемещение в корзину"
[ ! -f "public/uploads/тест 97/свободный.txt" ] && ok "файла больше на месте" || bad "файл остался на месте"
TRASH=$(curl -s -b "$CJ" "$BASE/admin/files/trash")
TRASH_ID=$(jget "$TRASH" "data.items.0.id")
check "$(jget "$TRASH" "data.items.0.name")" "свободный.txt" "корзина показывает файл"
R=$(curl -s -b "$CJ" "$BASE/admin/files?path=media")
echo "$R" | python3 -c "
import sys,json
names=[e['name'] for e in json.load(sys.stdin)['data']['entries']]
sys.exit(0 if '.trash' not in names else 1)" && ok ".trash скрыт из списка media" || bad ".trash виден в списке"
R=$(curl -s -b "$CJ" -X POST "$BASE/admin/files/restore" -H "Content-Type: application/json" -d "{\"id\":\"$TRASH_ID\"}")
check "$(jget "$R" "data.path")" "тест 97/свободный.txt" "restore вернул файл на место"
[ -f "public/uploads/тест 97/свободный.txt" ] && ok "файл снова на диске" || bad "файла нет после restore"
R=$(curl -s -b "$CJ" -X POST "$BASE/admin/files/delete" -H "Content-Type: application/json" \
  -d '{"path":"media/тест 97/занятый.txt"}')
CODE=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin).get('error','')[:20])" 2>/dev/null)
[ -n "$CODE" ] && ok "referenced-файл защищён: $CODE" || bad "referenced-файл удалился без защиты!"
[ -f "public/uploads/тест 97/занятый.txt" ] && ok "referenced-файл цел" || bad "referenced-файл пропал"

echo "── Task 103: неиспользуемые файлы ──"
UNUSED=$(curl -s -b "$CJ" "$BASE/admin/files/unused")
echo "$UNUSED" | python3 -c "
import sys,json
paths=[i['path'] for i in json.load(sys.stdin)['data']['items']]
ok1 = 'тест 97/свободный.txt' in paths
ok2 = 'тест 97/занятый.txt' not in paths
print('BOTH' if (ok1 and ok2) else ('FREE_ONLY' if ok1 else 'MISS'))" > /tmp/t97-unused.log
check "$(cat /tmp/t97-unused.log)" "BOTH" "unused: свободный найден, занятый исключён"
R=$(curl -s -b "$CJ" -X POST "$BASE/admin/files/unused-purge" -H "Content-Type: application/json" \
  -d '{"paths":["тест 97/свободный.txt","тест 97/занятый.txt","../hack"]}')
check "$(jget "$R" "data.deleted")" "1" "purge: удалён 1 (занятый перепроверен, traversal отброшен)"
[ ! -f "public/uploads/тест 97/свободный.txt" ] && ok "свободный файл удалён навсегда" || bad "свободный не удалён"

echo "── Task 100: мягкое удаление и корзина товаров ──"
R=$(curl -s -b "$CJ" -X POST "$BASE/admin/products/bulk" -H "Content-Type: application/json" \
  -d "{\"ids\":[$PID_A,$PID_B,\"$DUP_ID\"],\"action\":\"status\",\"value\":{\"is_published\":1,\"show_in_catalog\":1}}")
R=$(curl -s -b "$CJ" -X DELETE "$BASE/admin/products/$PID_A")
check "$(jget "$R" "data.soft")" "true" "DELETE без force — мягкое удаление"
DELA=$($PHP -r '$pdo=new PDO("sqlite:backend/storage/database.sqlite"); echo $pdo->query("SELECT deleted_at IS NOT NULL FROM products WHERE id=".(int)$argv[1])->fetchColumn();' "$PID_A")
check "$DELA" "1" "deleted_at проставлен"
LIST=$(curl -s -b "$CJ" "$BASE/admin/products")
echo "$LIST" | python3 -c "
import sys,json
ids=[str(p['id']) for p in json.load(sys.stdin)['data']]
sys.exit(0 if '$PID_A' not in ids else 1)" && ok "удалённый товар исчез из обычного списка" || bad "удалённый товар виден в списке"
PUB=$(curl -s "$BASE/products")
echo "$PUB" | python3 -c "
import sys,json
slugs=[p['slug'] for p in json.load(sys.stdin)['data']]
sys.exit(0 if '$SLUG_A' not in slugs and '$SLUG_B' in slugs else 1)" && ok "витрина не отдаёт удалённый (Б жив)" || bad "витрина сломалась"
DLIST=$(curl -s -b "$CJ" "$BASE/admin/products?filter=deleted")
check "$(jget "$DLIST" "data.0.id")" "$PID_A" "корзина (filter=deleted) содержит удалённый"
R=$(curl -s -b "$CJ" -X POST "$BASE/admin/products/$PID_A/restore")
check "$(jget "$R" "data.ok")" "true" "restore вернул товар"
DELA=$($PHP -r '$pdo=new PDO("sqlite:backend/storage/database.sqlite"); echo $pdo->query("SELECT deleted_at IS NULL FROM products WHERE id=".(int)$argv[1])->fetchColumn();' "$PID_A")
check "$DELA" "1" "deleted_at сброшен"
R=$(curl -s -b "$CJ" -X POST "$BASE/admin/products/bulk" -H "Content-Type: application/json" \
  -d "{\"ids\":[$PID_A,$PID_B],\"action\":\"delete\",\"value\":null}")
check "$(jget "$R" "data.updated")" "2" "bulk delete: 2 в корзину"
R=$(curl -s -b "$CJ" -X DELETE "$BASE/admin/products/$PID_A?force=1")
check "$(jget "$R" "data.soft")" "false" "force=1 — полное удаление"
CNT=$($PHP -r '$pdo=new PDO("sqlite:backend/storage/database.sqlite"); echo $pdo->query("SELECT COUNT(*) FROM products WHERE id=".(int)$argv[1])->fetchColumn();' "$PID_A")
check "$CNT" "0" "товар А полностью удалён из БД"
R=$(curl -s -b "$CJ" -X DELETE "$BASE/admin/products/$PID_B?force=1")
check "$(jget "$R" "data.ok")" "true" "товар Б удалён навсегда из корзины"
curl -s -b "$CJ" -X DELETE "$BASE/admin/products/$DUP_ID?force=1" >/dev/null

echo "── Task 97: unread-заказы ──"
$PHP -r '
$pdo = new PDO("sqlite:backend/storage/database.sqlite");
$pdo->exec("INSERT INTO orders (order_number, customer_name, customer_phone, delivery_method, total_kopecks, status, customer_phone_hash, customer_email, address, comment) VALUES (\"Т97-1\", \"x\", \"y\", \"city\", 100000, \"new\", \"z\", \"e\", \"a\", \"c\")");
echo "seeded\n";
' >/dev/null 2>&1 && ok "тестовый заказ посеян" || bad "заказ не посеялся"
UN=$(curl -s -b "$CJ" "$BASE/admin/orders/unread?since_id=0")
MAX_ID=$(jget "$UN" "data.max_id")
check "$(jget "$UN" "data.count_new")" "1" "unread: один заказ в статусе new"
check "$(jget "$UN" "data.latest.order_number")" "Т97-1" "unread: последний заказ виден"
UN2=$(curl -s -b "$CJ" "$BASE/admin/orders/unread?since_id=$MAX_ID")
check "$(jget "$UN2" "data.count_since")" "0" "unread после прочтения = 0"
OID=$(jget "$UN" "data.latest.id")
R=$(curl -s -b "$CJ" -X POST "$BASE/admin/orders/$OID" -H "Content-Type: application/json" \
  -d '{"status":"confirmed"}')
check "$(jget "$R" "data.status")" "confirmed" "статус заказа меняется (для журнала)"
$PHP -r '$pdo=new PDO("sqlite:backend/storage/database.sqlite"); $pdo->exec("DELETE FROM orders WHERE order_number=\"Т97-1\""); echo "cleaned\n";' >/dev/null 2>&1

echo "── Task 105: бэкап БД ──"
curl -s -b "$CJ" -o /tmp/t97-backup.sqlite "$BASE/admin/db-backup"
HEADB=$(head -c 15 /tmp/t97-backup.sqlite)
check "$HEADB" "SQLite format 3" "бэкап — валидный SQLite-файл"
[ -s /tmp/t97-backup.sqlite ] && ok "бэкап не пустой" || bad "бэкап пустой"

echo "── Task 104: журнал действий ──"
curl -s -b "$CJ" -X POST "$BASE/admin/settings" -H "Content-Type: application/json" \
  -d '{"card_video_enabled":"1"}' >/dev/null
LOG=$(curl -s -b "$CJ" "$BASE/admin/log?limit=50")
echo "$LOG" | python3 -c "
import sys,json
acts=[i['action'] for i in json.load(sys.stdin)['data']['items']]
need={'product.create','product.duplicate','product.bulk-status','product.delete','files.delete','files.restore','settings.update','order.status'}
print('ALL' if need.issubset(set(acts)) else 'MISS:'+','.join(sorted(need-set(acts))))" > /tmp/t97-log.log
check "$(cat /tmp/t97-log.log)" "ALL" "в журнале есть все ключевые действия"

echo "── Уборка ──"
rm -rf "public/uploads/тест 97" "public/uploads/.trash"
$PHP -r '
$pdo = new PDO("sqlite:backend/storage/database.sqlite");
$pdo->exec("DELETE FROM product_images WHERE product_id IN (SELECT id FROM products WHERE slug LIKE \"test-97-%\")");
$pdo->exec("DELETE FROM bundle_items WHERE product_id IN (SELECT id FROM products WHERE slug LIKE \"test-97-%\") OR component_id IN (SELECT id FROM products WHERE slug LIKE \"test-97-%\")");
$pdo->exec("DELETE FROM products WHERE slug LIKE \"test-97-%\"");
$pdo->exec("DELETE FROM admin_log");
echo "cleaned\n";
' >/tmp/t97-clean.log 2>&1 && ok "тестовые товары/журнал вычищены" || bad "уборка не прошла"
pkill -f "php.*127.0.0.1:$PORT" 2>/dev/null

echo
echo "═══ Итог: PASS=$PASS FAIL=$FAIL ═══"
[ "$FAIL" -eq 0 ]
