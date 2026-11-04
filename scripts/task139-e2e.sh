#!/bin/bash
# Task 139 E2E-обёртка: стенд .deploy-package :8094 + Playwright (task139-e2e.cjs).
# Перед браузерными сценариями: синтетические события аналитики в БД СТЕНДА
# (gift_view ×10 + cart_add ×2) → проверка конверсии в /admin/analytics/summary;
# после браузерной части — проверка behavior-burst/click-no-move в БД стенда
# и security-заголовков API.
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

STAND_DB="$ROOT/.deploy-package/backend/storage/database.sqlite"
[ -f "$STAND_DB" ] || { echo "нет БД стенда: $STAND_DB"; exit 1; }

echo "── 0. Стенд :8094 ──"
PORT=8094; BASE="http://127.0.0.1:$PORT"
export PHP_CLI_SERVER_WORKERS=8
pkill -f "127.0.0.1:$PORT" 2>/dev/null; sleep 1
( cd "$ROOT/.deploy-package" && setsid "$PHP" -S 127.0.0.1:$PORT "$ROOT/scripts/deploy/dev-router.php" >/tmp/t139-stand.log 2>&1 & )
for i in $(seq 1 30); do curl -s "$BASE/api/health" 2>/dev/null | grep -q ok && break; sleep 0.3; done
curl -s "$BASE/api/health" | grep -q ok && ok "стенд :$PORT поднялся" || { bad "стенд не поднялся (см. /tmp/t139-stand.log)"; exit 1; }

echo "── 0.1 Синтетика аналитики в БД стенда (gift_view ×10, cart_add ×2) ──"
python3 - "$STAND_DB" <<'EOF'
import sqlite3, sys
con = sqlite3.connect(sys.argv[1])
# идемпотентность: пересеиваем с нуля (прошлый прогон/повторный запуск)
con.execute("DELETE FROM visit_events WHERE session_id IN (SELECT id FROM visit_sessions WHERE sid='e2e139seed')")
con.execute("DELETE FROM visit_sessions WHERE sid='e2e139seed'")
con.execute(
    "INSERT INTO visit_sessions (sid, ip_hash, ip_mask, user_agent, is_bot, bot_reason, referrer, landing, screen, views, events, first_seen, last_seen) "
    "VALUES ('e2e139seed', 'seed139hash', '203.0.xxx.xxx', 'Seed Agent', 0, '', '', '/catalog/', '1280x900', 11, 12, datetime('now'), datetime('now'))"
)
s_id = con.execute("SELECT id FROM visit_sessions WHERE sid='e2e139seed'").fetchone()[0]
for i in range(10):
    con.execute(
        "INSERT INTO visit_events (session_id, type, path, gift_slug, gift_name, meta, created_at) "
        "VALUES (?, 'gift_view', '/product/e2e-gift', 'e2e-gift', 'E2E Подарок', '', datetime('now'))",
        (s_id,),
    )
for i in range(2):
    con.execute(
        "INSERT INTO visit_events (session_id, type, path, gift_slug, gift_name, meta, created_at) "
        "VALUES (?, 'cart_add', '/product/e2e-gift', 'e2e-gift', 'E2E Подарок', '', datetime('now'))",
        (s_id,),
    )
con.commit()
print("синтетика пересеяна: 12 событий")
EOF
[ $? -eq 0 ] && ok "синтетика засеяна" || bad "синтетика не засеяна"

echo "── 0.2 Конверсия в summary (curl + логин) ──"
CJ=/tmp/t139-cookies.txt
LOGIN=$(curl -s -c "$CJ" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d '{"email":"admin@lakomka.local","password":"Lakomka2026!"}')
echo "$LOGIN" | grep -q '"data"' && ok "логин в админку стенда" || bad "логин не удался"
SUMMARY=$(curl -s -b "$CJ" "$BASE/api/admin/analytics/summary?days=30")
CONV=$(echo "$SUMMARY" | python3 -c "
import json, sys
j = json.load(sys.stdin)
gifts = j.get('data', {}).get('gifts', [])
row = next((g for g in gifts if g.get('slug') == 'e2e-gift'), None)
print(f\"{row['views']}|{row['cart_adds']}|{row['conv']}\" if row else 'MISSING')
")
[ "$CONV" = "10|2|20" ] \
  && ok "summary: 10 просмотров, 2 «в корзину», conv = 20%" \
  || bad "конверсия неожиданная: $CONV"

echo "── 0.3 Security-заголовки API ──"
HEADERS=$(curl -s -I "$BASE/api/health")
echo "$HEADERS" | grep -qi "X-Content-Type-Options: nosniff" && ok "nosniff присутствует" || bad "нет nosniff"
echo "$HEADERS" | grep -qi "X-Frame-Options: DENY" && ok "X-Frame-Options: DENY присутствует" || bad "нет X-Frame-Options"

echo "── 1. Playwright-сценарии (A–D) ──"
node scripts/task139-e2e.cjs "$BASE"
E2E=$?
[ "$E2E" = "0" ] && ok "task139-e2e.cjs зелёный" || bad "task139-e2e.cjs провален"

echo "── 2. Бото-детектор: проверка БД стенда ──"
DBCHECK="$(python3 - "$STAND_DB" <<'EOF'
import sqlite3, sys
con = sqlite3.connect(sys.argv[1])
burst = con.execute("SELECT bot_reason FROM visit_sessions WHERE sid LIKE 'e2e139%' AND bot_reason='behavior-burst' LIMIT 1").fetchone()
score = con.execute("SELECT bot_score FROM visit_sessions WHERE sid LIKE 'e2e139%' AND bot_score >= 25 LIMIT 1").fetchone()
honey = con.execute("SELECT hits FROM bot_hits WHERE path='POST /api/orders (honeypot)' LIMIT 1").fetchone()
orders = con.execute("SELECT COUNT(*) FROM orders WHERE customer_phone LIKE '%0000000000%'").fetchone()[0]
print(f"{'burst-ok' if burst else 'burst-miss'}|{score[0] if score else 0}|{honey[0] if honey else 0}|{orders}")
EOF
)"
echo "$DBCHECK" | grep -q "burst-ok" && ok "behavior-burst: сессия помечена is_bot (reason behavior-burst)" || bad "behavior-burst не сработал: $DBCHECK"
echo "$DBCHECK" | grep -qE '\|(2[5-9]|[3-9][0-9])\|' && ok "click-no-move: bot_score ≥ 25 у сессии с DOM-кликами" || bad "click-no-move не засчитан: $DBCHECK"
HONEY_HITS=$(echo "$DBCHECK" | cut -d'|' -f3)
[ "$HONEY_HITS" -ge 1 ] 2>/dev/null && ok "honeypot: bot_hits = $HONEY_HITS (POST /api/orders)" || bad "honeypot не попал в bot_hits: $DBCHECK"
HONEY_ORDER=$(echo "$DBCHECK" | cut -d'|' -f4)
[ "$HONEY_ORDER" = "0" ] && ok "honeypot-заказ НЕ создан в БД" || bad "honeypot-заказ создался: $HONEY_ORDER"

echo "── 3. Гигиена: honeypot-заказ теста остаётся только в БД стенда ──"
DEV_ORDERS="$(python3 -c "
import sqlite3
con = sqlite3.connect('backend/storage/database.sqlite')
print(con.execute('SELECT COUNT(*) FROM orders').fetchone()[0])
")"
[ "$DEV_ORDERS" = "0" ] && ok "dev-БД чиста (заказов 0)" || bad "dev-БД содержит заказы: $DEV_ORDERS"

echo ""
echo "ИТОГО: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
