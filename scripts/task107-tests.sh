#!/usr/bin/env bash
# Тесты Task 107-109:
#   107 — Яндекс.Метрика: ключ ym_id (админка + витрина), валидация;
#   108 — Telegram: ключи tg_bot_token (секрет, маска)/tg_chat_id,
#         валидация, /admin/settings/test-telegram, заказ живёт при
#         неверном боте (ошибка только в error_log);
#   109 — JSON-LD товара: availability по реальному остатку
#         (stock 0 → OutOfStock, stock > 0 → InStock) + OG-мета на странице.
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
PHP="$(command -v php || true)"
[ -z "$PHP" ] && [ -x "$ROOT/.ztools/php" ] && PHP="$ROOT/.ztools/php"
[ -z "$PHP" ] && [ -x "$ROOT/.ztools/bin" ] && PHP="$ROOT/.ztools/bin"
[ -z "$PHP" ] && [ -x "$ROOT/../.ztools/php" ] && PHP="$ROOT/../.ztools/php"
[ -z "$PHP" ] && [ -x "$ROOT/../.ztools/bin" ] && PHP="$ROOT/../.ztools/bin"
[ -n "$PHP" ] || { echo "php не найден"; exit 1; }
PORT=8017
BASE="http://127.0.0.1:$PORT/api"
LOG=/tmp/t107-php.log
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  OK  $1"; }
bad()  { FAIL=$((FAIL+1)); echo "FAIL  $1"; }
check(){ if [ "$1" = "$2" ]; then ok "$3"; else bad "$3 (ожидалось '$2', получено '$1')"; fi; }
contains(){ case "$1" in *"$2"*) ok "$3";; *) bad "$3 (в ответе нет '$2')";; esac; }
notcontains(){ case "$1" in *"$2"*) bad "$3 (в ответе ЛИШНЕЕ '$2')";; *) ok "$3";; esac; }
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
# phpq — быстрый вызов php -r с аргументами: phpq '<код>' <args...>
phpq(){ "$PHP" -r "$1" "${@:2}"; }
mkdir -p /tmp/t107

echo "── Старт сервера :$PORT (лог $LOG) ──"
pkill -f "php.*127.0.0.1:$PORT" 2>/dev/null; sleep 1
( setsid "$PHP" -S 127.0.0.1:$PORT backend/public/index.php >"$LOG" 2>&1 & )
for i in $(seq 1 30); do
  curl -s "http://127.0.0.1:$PORT/api/health" | grep -q ok && break
  sleep 0.3
done
curl -s "$BASE/health" | grep -q ok && ok "сервер поднялся" || bad "сервер не поднялся"

echo "── Подготовка: ключей ym_id/tg_* в БД нет (симуляция обновления со старой версии) ──"
phpq '
$pdo = new PDO("sqlite:backend/storage/database.sqlite");
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$pdo->prepare("DELETE FROM settings WHERE key IN (?, ?, ?)")->execute(["ym_id","tg_bot_token","tg_chat_id"]);
echo "cleaned\n";
' >/tmp/t107-clean.log 2>&1 || { cat /tmp/t107-clean.log; echo "чистка не прошла"; exit 1; }
ok "ключи ym_id/tg_bot_token/tg_chat_id удалены из settings"

CJ=/tmp/t107-cookies.txt; rm -f "$CJ"
LOGIN=$(curl -s -c "$CJ" -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"admin@lakomka.local","password":"Lakomka2026!"}')
[ -n "$(jget "$LOGIN" "data.token")" ] && ok "админ залогинен" || bad "логин не удался: $LOGIN"

echo "── 107: пустые дефолты ──"
PUB=$(curl -s "$BASE/settings/public")
check "$(jget "$PUB" "data.ym_id")" "" "витрина без ключа: ym_id пуст (счётчик не вшивается)"
notcontains "$PUB" "tg_bot_token" "витрина НЕ отдаёт tg-ключи (секрет)"
ADM=$(curl -s -b "$CJ" "$BASE/admin/settings")
check "$(jget "$ADM" "data.ym_id")" "" "админка без ключа: ym_id пуст"
check "$(jget "$ADM" "data.tg_bot_token_set")" "false" "админка: tg_bot_token_set=false"
check "$(jget "$ADM" "data.tg_bot_token")" "" "админка: tg_bot_token пуст"

echo "── 107: сохранение и валидация ym_id ──"
R=$(curl -s -b "$CJ" -X POST "$BASE/admin/settings" -H "Content-Type: application/json" -d '{"ym_id":"12345678"}')
check "$(jget "$R" "data.ok")" "true" "POST ym_id=12345678 сохраняется"
PUB=$(curl -s "$BASE/settings/public")
check "$(jget "$PUB" "data.ym_id")" "12345678" "витрина отдаёт ym_id=12345678"
R=$(curl -s -b "$CJ" -X POST "$BASE/admin/settings" -H "Content-Type: application/json" -d '{"ym_id":"12ab"}')
contains "$(jget "$R" "error")" "только цифры" "мусор в ym_id → честная 422"
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$CJ" -X POST "$BASE/admin/settings" -H "Content-Type: application/json" -d '{"ym_id":"123"}')
check "$code" "422" "3 цифры в ym_id → 422"
curl -s -b "$CJ" -X POST "$BASE/admin/settings" -H "Content-Type: application/json" -d '{"ym_id":""}' >/dev/null
PUB=$(curl -s "$BASE/settings/public")
check "$(jget "$PUB" "data.ym_id")" "" "пустой ym_id очищает счётчик"

echo "── 108: chat_id — форматы ──"
R=$(curl -s -b "$CJ" -X POST "$BASE/admin/settings" -H "Content-Type: application/json" -d '{"tg_chat_id":"123456789"}')
check "$(jget "$R" "data.ok")" "true" "chat_id числом принимается"
R=$(curl -s -b "$CJ" -X POST "$BASE/admin/settings" -H "Content-Type: application/json" -d '{"tg_chat_id":"-1001234567890"}')
check "$(jget "$R" "data.ok")" "true" "отрицательный chat_id (группа/канал) принимается"
R=$(curl -s -b "$CJ" -X POST "$BASE/admin/settings" -H "Content-Type: application/json" -d '{"tg_chat_id":"@my_channel"}')
check "$(jget "$R" "data.ok")" "true" "@username канала принимается"
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$CJ" -X POST "$BASE/admin/settings" -H "Content-Type: application/json" -d '{"tg_chat_id":"!!!xyz"}')
check "$code" "422" "мусор в chat_id → 422"

echo "── 108: токен — валидация, маска, секретность ──"
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$CJ" -X POST "$BASE/admin/settings" -H "Content-Type: application/json" -d '{"tg_bot_token":"notatoken"}')
check "$code" "422" "токен без двоеточия → 422"
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$CJ" -X POST "$BASE/admin/settings" -H "Content-Type: application/json" -d '{"tg_bot_token":"123456:short"}')
check "$code" "422" "короткий хвост токена → 422"
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$CJ" -X POST "$BASE/admin/settings" -H "Content-Type: application/json" -d '{"tg_bot_token":"••••••••"}')
check "$code" "422" "вставленная маска → 422"
TOKEN="123456789:AAElAbCdEfGhIjKlMnOpQrStUvWxYz1234"
R=$(curl -s -b "$CJ" -X POST "$BASE/admin/settings" -H "Content-Type: application/json" -d "{\"tg_bot_token\":\"$TOKEN\",\"tg_chat_id\":\"123456789\"}")
check "$(jget "$R" "data.ok")" "true" "корректный токен сохраняется"
ADM=$(curl -s -b "$CJ" "$BASE/admin/settings")
check "$(jget "$ADM" "data.tg_bot_token")" "••••••••" "админка отдаёт токен маской"
check "$(jget "$ADM" "data.tg_bot_token_set")" "true" "tg_bot_token_set=true"
notcontains "$ADM" "AAElAbCdEfGhIjKlMnOpQrStUvWxYz1234" "реальный токен НЕ утекает в админ-API"
curl -s -b "$CJ" -X POST "$BASE/admin/settings" -H "Content-Type: application/json" -d '{"tg_bot_token":""}' >/dev/null
ADM=$(curl -s -b "$CJ" "$BASE/admin/settings")
check "$(jget "$ADM" "data.tg_bot_token_set")" "true" "пустой токен = не менять (set остаётся true)"
PUB=$(curl -s "$BASE/settings/public")
notcontains "$PUB" "AAEl" "токен НЕ утекает в /settings/public"
notcontains "$PUB" "tg_chat_id" "chat_id тоже не отдаётся витрине"

echo "── 108: test-telegram ──"
# Ключи заданы фейковым токеном: запрос дойдёт до api.telegram.org → HTTP 401 Unauthorized
R=$(curl -s -b "$CJ" -X POST "$BASE/admin/settings/test-telegram")
contains "$(jget "$R" "error")" "Telegram" "фейковый токен → ошибка именно от Telegram API (сеть работает)"
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$CJ" -X POST "$BASE/admin/settings/test-telegram")
check "$code" "500" "фейковый токен → 500 (не 2xx)"
# Теперь ключей нет: sendMessage честно скажет «не задан»
phpq '
$pdo = new PDO("sqlite:backend/storage/database.sqlite");
$pdo->prepare("DELETE FROM settings WHERE key IN (?, ?)")->execute(["tg_bot_token","tg_chat_id"]);
echo "cleaned\n";
' >/dev/null 2>&1
R=$(curl -s -b "$CJ" -X POST "$BASE/admin/settings/test-telegram")
contains "$(jget "$R" "error")" "Не задан" "без ключей → честная подсказка «Не задан токен…»"

echo "── 108: заказ живёт при неработающем боте ──"
# Фейковый токен + заказ: заказ ДОЛЖЕН оформиться (201),
# ошибка Telegram — только в error_log сервера
PID=$(phpq '
$pdo = new PDO("sqlite:backend/storage/database.sqlite");
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$pdo->prepare("INSERT INTO settings (key, value) VALUES (?, ?), (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    ->execute(["tg_bot_token","123456789:AAElAbCdEfGhIjKlMnOpQrStUvWxYz1234","tg_chat_id","123456789"]);
$pid = (int)$pdo->query("SELECT id FROM products WHERE is_published = 1 AND deleted_at IS NULL AND stock_qty > 0 ORDER BY id LIMIT 1")->fetchColumn();
echo $pid;
')
[ -n "$PID" ] && ok "товар для заказа: #$PID" || { bad "нет товара для заказа"; exit 1; }
# error_log бэкенда уходит в storage/php-errors.log (см. ini_set в index.php) — читаем его
ERRLOG=backend/storage/php-errors.log
ERRSIZE=$(stat -c %s "$ERRLOG" 2>/dev/null || echo 0)
: > "$LOG"
code=$(curl -s -o /tmp/t107-order.json -w "%{http_code}" -X POST "$BASE/orders" -H "Content-Type: application/json" \
  -d "{\"customer_name\":\"Е2Е 107 ТГ\",\"customer_phone\":\"+79001234567\",\"delivery_method\":\"pickup\",\"items\":[{\"product_id\":$PID,\"qty\":1}]}")
check "$code" "201" "заказ с фейковым токеном всё равно оформляется (201)"
check "$(jget "$(cat /tmp/t107-order.json)" "data.status")" "new" "статус заказа new"
sleep 1
contains "$(tail -c +$((ERRSIZE+1)) "$ERRLOG" 2>/dev/null)" "[telegram]" "ошибка Telegram зафиксирована в php-errors.log (не в ответе клиенту)"
ORDER_NUM=$(jget "$(cat /tmp/t107-order.json)" "data.order_number")
ok "заказ $ORDER_NUM создан (потом вычищается)"

echo "── 107/108: журнал действий ──"
LOGRESP=$(curl -s -b "$CJ" "$BASE/admin/log?limit=100")
contains "$LOGRESP" "settings.update" "в журнале есть settings.update (ключи менялись)"

echo "── 109: JSON-LD товара по реальному остатку (через dev-сервер :3000) ──"
if curl -s -o /dev/null --max-time 5 "http://localhost:3000/"; then
  SLUG=$(curl -s "$BASE/products" | python3 -c "
import json,sys
d=json.load(sys.stdin)['data']
p=next((x for x in d if x.get('show_in_catalog')==1 and (x.get('stock_qty') or 0)>0), None)
print(p['slug'] if p else '')")
  [ -n "$SLUG" ] && ok "товар с остатком: $SLUG" || bad "не нашли товар с остатком"
  if [ -n "$SLUG" ]; then
    PAGE=$(curl -s --max-time 60 "http://localhost:3000/product/$SLUG")
    contains "$PAGE" '"@type":"Product"' "JSON-LD Product есть на странице товара"
    contains "$PAGE" 'https://schema.org/InStock' "остаток > 0 → InStock"
    contains "$PAGE" 'itemCondition' "itemCondition NewCondition на месте"
    contains "$PAGE" 'og:image' "OG-картинка в мета-тегах"
    # Ставим остаток 0 → OutOfStock, потом возвращаем
    phpq '
$pdo = new PDO("sqlite:backend/storage/database.sqlite");
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$stmt = $pdo->prepare("SELECT stock_qty FROM products WHERE slug = ?");
$stmt->execute([$argv[1]]);
$st = (int)$stmt->fetchColumn();
$pdo->prepare("UPDATE products SET stock_qty = 0 WHERE slug = ?")->execute([$argv[1]]);
file_put_contents("/tmp/t107-restore.txt", (string)$st);
echo "was $st\n";
' "$SLUG" >/tmp/t107-stock.log 2>&1 || { cat /tmp/t107-stock.log; bad "не удалось обнулить остаток"; }
    if [ -f /tmp/t107-restore.txt ]; then
      PAGE=$(curl -s --max-time 60 "http://localhost:3000/product/$SLUG")
      contains "$PAGE" 'https://schema.org/OutOfStock' "остаток 0 → OutOfStock (честно для поисковиков)"
      ST=$(cat /tmp/t107-restore.txt)
      phpq '
$pdo = new PDO("sqlite:backend/storage/database.sqlite");
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$pdo->prepare("UPDATE products SET stock_qty = ? WHERE slug = ?")->execute([(int)$argv[1], $argv[2]]);
echo "restored\n";
' "$ST" "$SLUG" >/dev/null 2>&1
      ok "остаток товара возвращён ($ST)"
      rm -f /tmp/t107-restore.txt
    fi
  fi
else
  bad "dev-сервер :3000 недоступен — JSON-LD-проверки пропущены (E2E покроет)"
fi

echo "── Чистка ──"
phpq '
$pdo = new PDO("sqlite:backend/storage/database.sqlite");
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$pdo->prepare("DELETE FROM settings WHERE key IN (?, ?, ?)")->execute(["ym_id","tg_bot_token","tg_chat_id"]);
$stmt = $pdo->prepare("SELECT id FROM orders WHERE order_number = ?");
$stmt->execute([$argv[1]]);
$oid = $stmt->fetchColumn();
if ($oid) {
  $pdo->prepare("DELETE FROM order_items WHERE order_id = ?")->execute([$oid]);
  $pdo->prepare("DELETE FROM order_status_history WHERE order_id = ?")->execute([$oid]);
  $pdo->prepare("DELETE FROM orders WHERE id = ?")->execute([$oid]);
  echo "order removed\n";
} else { echo "order not found\n"; }
echo "settings cleaned\n";
' "$ORDER_NUM" >/tmp/t107-final.log 2>&1 || { cat /tmp/t107-final.log; bad "чистка не прошла"; }
ok "ключи ym_id/tg_* удалены, тестовый заказ вычищен"

pkill -f "php.*127.0.0.1:$PORT" 2>/dev/null || true
echo ""
echo "════════════════════════════════"
echo "ИТОГО: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ] || exit 1
