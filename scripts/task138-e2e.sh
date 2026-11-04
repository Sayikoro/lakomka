#!/bin/bash
# Task 138 E2E-обёртка: стенд .deploy-package :8093 + Playwright (task138-e2e.cjs).
# Перед тестом в БД СТЕНДА вносится «дрейф» данных первого товара каталога
# (цена +1 копейка, id медиа +900000) — живые данные расходятся с запечёнными,
# как на проде (перезаливки медиа на сервере меняют id). Затем проверяется,
# что слайды НЕ перемонтируются (моргиания) и видео не грузится само.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); echo "  OK  $1"; }
bad(){ FAIL=$((FAIL+1)); echo "  FAIL $1"; }

[ -f "$ROOT/.deploy-package/index.html" ] || { echo "нет .deploy-package — сначала MODE=both bash scripts/build-static.sh"; exit 1; }
PHP="$(command -v php 2>/dev/null || true)"
[ -z "$PHP" ] && [ -x "$ROOT/.ztools/php" ] && PHP="$ROOT/.ztools/php"
[ -z "$PHP" ] && [ -x "$ROOT/../.ztools/php" ] && PHP="$(readlink -f "$ROOT/../.ztools/php")"
[ -n "$PHP" ] || { echo "php не найден"; exit 1; }

STAND_DB="$ROOT/.deploy-package/backend/storage/database.sqlite"
[ -f "$STAND_DB" ] || { echo "нет БД стенда: $STAND_DB"; exit 1; }

echo "── 0. Дрейф данных первого товара в БД стенда ──"
python3 - "$STAND_DB" <<'EOF'
import sqlite3, sys
con = sqlite3.connect(sys.argv[1])
row = con.execute("""
    SELECT p.id FROM products p
    JOIN product_images pi ON pi.product_id = p.id
    WHERE p.deleted_at IS NULL
    ORDER BY p.id DESC LIMIT 1
""").fetchone()
if not row:
    print("нет товара с медиа"); sys.exit(1)
pid = row[0]
con.execute("UPDATE products SET price_kopecks = price_kopecks + 1 WHERE id = ?", (pid,))
n = con.execute("UPDATE product_images SET id = id + 900000 WHERE product_id = ?", (pid,)).rowcount
con.commit()
print(f"дрейф: product_id={pid}, медиа-строк сдвинуто: {n}")
EOF
[ $? -eq 0 ] && ok "цена +1 копейка и id медиа сдвинуты (живые ≠ запечённые)" || bad "дрейф не применён"

echo "── 0.1 Стенд :8093 ──"
PORT=8093; BASE="http://127.0.0.1:$PORT"
export PHP_CLI_SERVER_WORKERS=8
pkill -f "127.0.0.1:$PORT" 2>/dev/null; sleep 1
( cd "$ROOT/.deploy-package" && setsid "$PHP" -S 127.0.0.1:$PORT "$ROOT/scripts/deploy/dev-router.php" >/tmp/t138-stand.log 2>&1 & )
for i in $(seq 1 30); do curl -s "$BASE/api/health" 2>/dev/null | grep -q ok && break; sleep 0.3; done
curl -s "$BASE/api/health" | grep -q ok && ok "стенд :$PORT поднялся" || bad "стенд не поднялся (см. /tmp/t138-stand.log)"

curl -s "$BASE/api/settings/public" | grep -q '"card_video_enabled":false' \
  && ok "API стенда: card_video_enabled=false (dev-БД=0)" \
  || bad "API стенда вернул не false"

echo "── 1. Playwright: часть off (A/B/C) ──"
node scripts/task138-e2e.cjs "$BASE" off
E2E=$?
[ "$E2E" = "0" ] && ok "task138-e2e off (A/B/C) зелёный" || bad "task138-e2e off провален"

echo "── 1.1 Включаем видео в БД стенда (галочка владельца = 1) ──"
python3 - "$STAND_DB" <<'EOF'
import sqlite3, sys
con = sqlite3.connect(sys.argv[1])
con.execute("UPDATE settings SET value='1' WHERE key='card_video_enabled'")
con.commit()
print("card_video_enabled = 1")
EOF
ok "БД стенда: card_video_enabled=1"

echo "── 2. Playwright: часть on (D) ──"
node scripts/task138-e2e.cjs "$BASE" on
E2E=$?
[ "$E2E" = "0" ] && ok "task138-e2e on (D) зелёный" || bad "task138-e2e on провален"

echo "── 3. Возврат БД стенда (видео выключены) ──"
python3 - "$STAND_DB" <<'EOF'
import sqlite3, sys
con = sqlite3.connect(sys.argv[1])
con.execute("UPDATE settings SET value='0' WHERE key='card_video_enabled'")
con.commit()
print("card_video_enabled восстановлен в 0")
EOF
ok "БД стенда возвращена к выключенным видео"

echo ""
echo "ИТОГО: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
