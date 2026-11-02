#!/bin/bash
# Task 131 (аудит безопасности): приватность админских хранилищ и контейнмент путей.
#   1) Корзина файлов: storage/trash (вне publicRoot), миграция из uploads/.trash,
#      скачивание/удаление по историческому пути media/.trash/… работают.
#   2) Экспорты: storage/exports (вне publicRoot), миграция из publicRoot/exports,
#      скачивание по path=exports/… работает, публичной папки больше нет.
#   3) Auth-карта контроллеров без неожиданных дыр.
#   4) Контейнмент resolve(): .. / ..%2f / обход через trash-префикс отклоняются.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PHP="$(command -v php 2>/dev/null || true)"
[ -z "$PHP" ] && [ -x "$ROOT/.ztools/php" ] && PHP="$ROOT/.ztools/php"
[ -z "$PHP" ] && [ -x "$ROOT/../.ztools/php" ] && PHP="$(readlink -f "$ROOT/../.ztools/php")"
[ -n "$PHP" ] || { echo "php не найден"; exit 1; }
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); echo "  OK  $1"; }
bad(){ FAIL=$((FAIL+1)); echo "  FAIL $1"; }

echo "── 1. Auth-карта контроллеров ──"
CHECKS=$("$PHP" scripts/security-audit-auth.php 2>/dev/null | grep -c "<<< CHECK")
[ "${CHECKS:-9}" = "0" ] && ok "все admin-методы под Auth::* (внезапных: 0)" || bad "методов без auth: $CHECKS"

echo "── 2. Миграции и приватность хранилищ (API :8053) ──"
PORT=8053; BASE="http://127.0.0.1:$PORT/api"; LOG=/tmp/t131sec-php.log
export PHP_CLI_SERVER_WORKERS=8
pkill -f "127.0.0.1:$PORT" 2>/dev/null; sleep 1
rm -rf "$ROOT/public/exports" "$ROOT/backend/storage/exports" "$ROOT/backend/storage/trash" "$ROOT/public/uploads/.trash"

# сид ДО первого вызова API: старые публичные локации.
# id с HEX-суффиксом, moved_at свежий — иначе автоочистка 30 дней сразу съест позицию.
mkdir -p "$ROOT/public/exports" "$ROOT/public/uploads/.trash/20990101-000000-abc123"
echo "legacy-export" > "$ROOT/public/exports/old-export.zip"
echo "legacy-trash"   > "$ROOT/public/uploads/.trash/20990101-000000-abc123/old-file.dat"
cat > "$ROOT/public/uploads/.trash/20990101-000000-abc123/meta.json" \
  <<<'{"orig":"products/nowhere/old-file.dat","name":"old-file.dat","is_dir":false,"moved_at":"'"$(date -u +%Y-%m-%dT%H:%M:%S+00:00)"'"}'
ok "сид: legacy public/exports и uploads/.trash созданы"

( setsid "$PHP" -S 127.0.0.1:$PORT backend/public/index.php >"$LOG" 2>&1 & )
UP=1
for i in $(seq 1 30); do curl -s "$BASE/health" | grep -q ok && { UP=0; break; }; sleep 0.3; done
[ "$UP" = "0" ] && ok "сервер :$PORT поднялся" || { bad "сервер не поднялся"; exit 1; }

CJ=/tmp/t131sec-cookies.txt
LOGIN=$(curl -s -c "$CJ" -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d '{"email":"admin@lakomka.local","password":"Lakomka2026!"}')
echo "$LOGIN" | grep -q "token\|\"ok\"" && ok "логин администратором" || bad "логин: $LOGIN"

# первый вызов, читающий секции → миграция exports
curl -s -b "$CJ" "$BASE/admin/files?path=exports" > /dev/null
[ -d "$ROOT/backend/storage/exports" ] && ok "exports переехал в backend/storage" || bad "storage/exports не создан"
[ ! -d "$ROOT/public/exports" ] && ok "публичная папка public/exports исчезла" || bad "public/exports осталась"
[ -f "$ROOT/backend/storage/exports/old-export.zip" ] && ok "старый экспорт перенесён в приватное хранилище" || bad "old-export.zip не перенесён"

# первый вызов корзины → миграция trash
TL=$(curl -s -b "$CJ" "$BASE/admin/files/trash")
[ -d "$ROOT/backend/storage/trash" ] && ok "корзина переехала в backend/storage" || bad "storage/trash не создан"
[ ! -d "$ROOT/public/uploads/.trash" ] && ok "публичная папка uploads/.trash исчезла" || bad "uploads/.trash осталась"
echo "$TL" | grep -q "old-file.dat" && ok "legacy-позиция видна в списке корзины" || bad "legacy-позиция не видна"
echo "$TL" | grep -q "20990101-000000-abc123" && ok "id legacy-позиции сохранён" || bad "id потерян"

# скачивание по историческому пути media/.trash/…
D1=$(curl -s -b "$CJ" -o /dev/null -w '%{http_code}' "$BASE/admin/files/download?path=media%2F.trash%2F20990101-000000-abc123%2Fold-file.dat")
[ "$D1" = "200" ] && ok "download по media/.trash/… → 200 (auth)" || bad "download trash: $D1"
DA=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/files/download?path=media%2F.trash%2F20990101-000000-abc123%2Fold-file.dat")
[ "$DA" = "401" ] && ok "аноним → download trash 401" || bad "аноним download trash: $DA"
DE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/files/download?path=exports%2Fold-export.zip")
[ "$DE" = "401" ] && ok "аноним → download exports 401" || bad "аноним download exports: $DE"
D2=$(curl -s -b "$CJ" -o /dev/null -w '%{http_code}' "$BASE/admin/files/download?path=exports%2Fold-export.zip")
[ "$D2" = "200" ] && ok "download exports по path= → 200 (auth)" || bad "download exports: $D2"

# delete по историческому пути → purge
DEL=$(curl -s -b "$CJ" -X POST "$BASE/admin/files/delete" -H "Content-Type: application/json" -d '{"path":"media/.trash/20990101-000000-abc123"}')
echo "$DEL" | grep -q '"purged":true' && ok "delete media/.trash/<id> → purged" || bad "purge: $DEL"
[ ! -d "$ROOT/backend/storage/trash/20990101-000000-abc123" ] && ok "позиция физически стёрта" || bad "позиция осталась"

echo "── 3. Контейнмент путей ──"
T1=$(curl -s -b "$CJ" -o /dev/null -w '%{http_code}' "$BASE/admin/files/download?path=media/../config.php")
[ "$T1" = "400" ] || [ "$T1" = "404" ] && ok "..  в пути → $T1" || bad "media/../config.php: $T1"
T2=$(curl -s -b "$CJ" -o /dev/null -w '%{http_code}' --path-as-is "$BASE/admin/files/download?path=media/.trash/..%2F..%2Fconfig.php")
[ "$T2" = "400" ] || [ "$T2" = "404" ] && ok "закодированный обход через .trash → $T2" || bad "encoded traversal: $T2"
T3=$(curl -s -b "$CJ" -o /dev/null -w '%{http_code}' "$BASE/admin/files/download?path=media/.trash/")
[ "$T3" = "400" ] || [ "$T3" = "404" ] && ok "media/.trash без позиции → $T3" || bad "пустой trash-путь: $T3"
T4=$(curl -s -b "$CJ" -o /dev/null -w '%{http_code}' --path-as-is "$BASE/admin/files/download?path=backend/config.php")
[ "$T4" = "404" ] && ok "вне разделов (backend/config.php) → 404" || bad "backend/config.php: $T4"

echo "── 4. Секреты не в публичных ответах ──"
PS=$(curl -s "$BASE/settings/public")
echo "$PS" | grep -qiE "smtp|password|jwt|secret|token" && bad "publicShow отдаёт подозрительные ключи" || ok "public/settings без секретов"

echo
echo "═══ Итог: PASS=$PASS FAIL=$FAIL ═══"
[ "$FAIL" = "0" ]
