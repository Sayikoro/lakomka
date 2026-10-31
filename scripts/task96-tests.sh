#!/usr/bin/env bash
# Тесты Task 96 — галочка «Показывать видео в карточках каталога»:
#   - ключ настроек card_video_enabled читается/пишется через
#     /api/admin/settings, публикуется через /api/settings/public;
#   - значения по умолчанию: ключа нет в БД → витрина true, админка «1»
#     (историческое поведение — видео показывается);
#   - булевы значения принимаются в любом виде («0»/«1», true/false);
#   - мусорное значение → 422; null → ключ не меняется;
#   - регресс соседних буланов (hero_slider_enabled) и других ключей.
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
PHP="$(command -v php || true)"
[ -z "$PHP" ] && [ -x "$ROOT/.ztools/php" ] && PHP="$ROOT/.ztools/php"
[ -z "$PHP" ] && [ -x "$ROOT/../.ztools/php" ] && PHP="$ROOT/../.ztools/php"
[ -n "$PHP" ] || { echo "php не найден"; exit 1; }
PORT=8015
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
mkdir -p /tmp/t96

echo "── Подготовка: ключа card_video_enabled в БД нет (симуляция обновления со старой версии) ──"
$PHP -r '
$pdo = new PDO("sqlite:backend/storage/database.sqlite");
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$pdo->prepare("DELETE FROM settings WHERE key = ?")->execute(["card_video_enabled"]);
echo "cleaned\n";
' >/tmp/t96-clean.log 2>&1 || { cat /tmp/t96-clean.log; echo "чистка не прошла"; exit 1; }
ok "ключ card_video_enabled удалён из settings"

echo "── Старт сервера :$PORT ──"
pkill -f "php.*127.0.0.1:$PORT" 2>/dev/null; sleep 1
( setsid "$PHP" -S 127.0.0.1:$PORT backend/public/index.php >/tmp/t96-php.log 2>&1 & )
for i in $(seq 1 20); do
  curl -s "http://127.0.0.1:$PORT/api/health" | grep -q ok && break
  sleep 0.5
done
curl -s "$BASE/health" | grep -q ok && ok "сервер поднялся" || bad "сервер не поднялся"

echo "── Дефолты при отсутствии ключа ──"
PUB=$(curl -s "$BASE/settings/public")
check "$(jget "$PUB" "data.card_video_enabled")" "true" "витрина без ключа: card_video_enabled=true (видео показывается)"

CJ=/tmp/t96-cookies.txt
LOGIN=$(curl -s -c "$CJ" -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"admin@lakomka.local","password":"Lakomka2026!"}')
[ -n "$(jget "$LOGIN" "data.token")" ] && ok "админ залогинен" || bad "логин не удался: $LOGIN"

ADM=$(curl -s -b "$CJ" "$BASE/admin/settings")
check "$(jget "$ADM" "data.card_video_enabled")" "1" "админка без ключа: показывает фактическое поведение («1»)"

echo "── Выключение галочки ──"
R=$(curl -s -b "$CJ" -X POST "$BASE/admin/settings" -H "Content-Type: application/json" -d '{"card_video_enabled":"0"}')
check "$(jget "$R" "data.ok")" "true" "POST card_video_enabled=0 сохраняется"
PUB=$(curl -s "$BASE/settings/public")
check "$(jget "$PUB" "data.card_video_enabled")" "false" "витрина отдаёт card_video_enabled=false"
ADM=$(curl -s -b "$CJ" "$BASE/admin/settings")
check "$(jget "$ADM" "data.card_video_enabled")" "0" "админка читает «0»"

echo "── Форматы значений ──"
R=$(curl -s -b "$CJ" -X POST "$BASE/admin/settings" -H "Content-Type: application/json" -d '{"card_video_enabled":true}')
check "$(jget "$R" "data.ok")" "true" "POST булевым true принимается"
PUB=$(curl -s "$BASE/settings/public")
check "$(jget "$PUB" "data.card_video_enabled")" "true" "после true витрина отдаёт true"

CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$CJ" -X POST "$BASE/admin/settings" -H "Content-Type: application/json" -d '{"card_video_enabled":"maybe"}')
check "$CODE" "422" "мусорное значение «maybe» → 422"

R=$(curl -s -b "$CJ" -X POST "$BASE/admin/settings" -H "Content-Type: application/json" -d '{"card_video_enabled":"0"}')
check "$(jget "$R" "data.ok")" "true" "вернули «0» для проверки null"
curl -s -b "$CJ" -X POST "$BASE/admin/settings" -H "Content-Type: application/json" -d '{"card_video_enabled":null}' >/dev/null
PUB=$(curl -s "$BASE/settings/public")
check "$(jget "$PUB" "data.card_video_enabled")" "false" "null не меняет ключ (осталось false)"

echo "── Регресс соседних настроек (тот же payload) ──"
R=$(curl -s -b "$CJ" -X POST "$BASE/admin/settings" -H "Content-Type: application/json" \
  -d '{"card_video_enabled":"1","hero_slider_enabled":"1"}')
check "$(jget "$R" "data.ok")" "true" "совместное сохранение card_video_enabled + hero_slider_enabled"
PUB=$(curl -s "$BASE/settings/public")
check "$(jget "$PUB" "data.card_video_enabled")" "true" "card_video_enabled=1 дошёл до витрины"
check "$(jget "$PUB" "data.hero_slider_enabled")" "true" "hero_slider_enabled=1 не сломался"
R=$(curl -s -b "$CJ" -X POST "$BASE/admin/settings" -H "Content-Type: application/json" \
  -d '{"hero_slider_enabled":"0","product_card_template":"new"}')
check "$(jget "$R" "data.ok")" "true" "hero_slider_enabled возвращён на «0», шаблон «new»"
ADM=$(curl -s -b "$CJ" "$BASE/admin/settings")
check "$(jget "$ADM" "data.product_card_template")" "new" "шаблон карточки не изменился"
check "$(jget "$ADM" "data.smtp_pass_set")" "false" "smtp_pass_set отдаётся (список ключей не пострадал; пароль в dev-БД не задан)"

echo "── Витрина после выключения: карточки без видео определяются на клиенте (API-контракт) ──"
PUB=$(curl -s "$BASE/settings/public")
check "$(jget "$PUB" "data.product_card_template")" "new" "витрина отдаёт шаблон вместе с флагом (один запрос)"
PROD=$(curl -s "$BASE/products")
echo "$PROD" > /tmp/t96-products.json
NVID=$(python3 -c "
import json
d=json.load(open('/tmp/t96-products.json'))['data']
n=0
for p in d:
    for m in p.get('media', []):
        if m.get('type')=='video': n+=1; break
print(n)")
[ "$NVID" -gt 0 ] && ok "в каталоге есть товары с видео ($NVID шт.) — фильтр на клиенте применим" || bad "нет товаров с видео для фильтра"

echo
echo "═══ Итог: PASS=$PASS FAIL=$FAIL ═══"
pkill -f "php.*127.0.0.1:$PORT" 2>/dev/null
[ "$FAIL" -eq 0 ]
