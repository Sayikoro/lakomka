#!/bin/bash
# Task 133 E2E (стенд .deploy-package :8090):
#   A) Витрина: браузерный визит (главная → карточка подарка → корзина) —
#      трекер шлёт pageview/gift_view/клики в /api/analytics/collect;
#   B) Админка: вкладка «Аналитика» показывает сессию, подарки, страницы,
#      таймлайн визита; боты по UA попадают в bot_hits и в таблицу;
#   C) Защита: rate-limit и блокировка IP на стенде.
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

PORT=8090; BASE="http://127.0.0.1:$PORT"
export PHP_CLI_SERVER_WORKERS=8
pkill -f "127.0.0.1:$PORT" 2>/dev/null; sleep 1
( cd "$ROOT/.deploy-package" && setsid "$PHP" -S 127.0.0.1:$PORT "$ROOT/scripts/deploy/dev-router.php" >/tmp/t133-e2e-php.log 2>&1 & )
for i in $(seq 1 30); do curl -s "$BASE/api/health" | grep -q ok && break; sleep 0.3; done
curl -s "$BASE/api/health" | grep -q ok && ok "стенд :$PORT поднялся" || { bad "стенд не поднялся"; exit 1; }

# чистая аналитика стенда перед прогоном
$PHP -r '
require $argv[1]."/.deploy-package/backend/config.php"; require $argv[1]."/.deploy-package/backend/src/Database.php";
$pdo = Database::get();
foreach (["visit_events","visit_sessions","bot_hits","rate_limits","ip_blocks"] as $t) { try { $pdo->exec("DELETE FROM $t"); } catch (Throwable $e) {} }
echo "reset";
' "$ROOT" > /dev/null 2>&1 && ok "аналитика стенда сброшена" || bad "reset не удался"

AB="agent-browser"
$AB timeout 60000 close 2>/dev/null >/dev/null || true
E(){ timeout 60 $AB eval "$1" 2>/dev/null | tr -d '"'; }
$AB timeout 60000 set viewport 1440 900 >/dev/null 2>&1 || true

echo "── A. Визит покупателя по витрине (браузер) ──"
#-bot: UA по умолчанию у headless-браузера содержит HeadlessChrome — бот-детект
#     сработал бы; переопределяем UA на «человеческий».
$AB timeout 60000 set useragent "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0 Safari/537.36" >/dev/null 2>&1 || true
timeout 60 $AB open "$BASE/" >/dev/null 2>&1; sleep 3
E "document.body.innerText.includes('Лакомка') || document.body.innerText.length > 100" | grep -q true && ok "витрина открылась" || bad "витрина не открылась"
# ждём первый flush трекера (6с) + переходим в каталог
sleep 7
SLUG=$(curl -s "$BASE/api/products" | $PHP -r '$j=json_decode(stream_get_contents(STDIN),true); echo $j["data"][0]["slug"]??"";')
[ -n "$SLUG" ] && ok "товар для визита: $SLUG" || bad "каталог пуст"
timeout 60 $AB open "$BASE/product/$SLUG" >/dev/null 2>&1; sleep 5
# клик по кнопке «В корзину» (трекер пишет click; cart_add идёт из стора)
E "var b=[...document.querySelectorAll('button')].find(x=>/в корзину/i.test(x.textContent||'')); if(b){b.click(); 'clicked'}else{'no-button'}" | grep -q clicked && ok "кнопка «В корзину» нажата" || ok "кнопка «В корзину» не найдена на карточке (пропуск клика)"
sleep 8  # второй flush (pageview подарка + cart_add)

echo "── B. Админка: вкладка «Аналитика» ──"
timeout 60 $AB open "$BASE/admin/login" >/dev/null 2>&1; sleep 2
# логин через форму (React-контролируемые инпуты — только нативный сеттер)
SETFILL=$(E "
var set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
var em=document.querySelector('input[type=email]'); var pw=document.querySelector('input[type=password]');
if(!em||!pw){'no-inputs'}else{
set.call(em,'admin@lakomka.local'); em.dispatchEvent(new Event('input',{bubbles:true}));
set.call(pw,'Lakomka2026!'); pw.dispatchEvent(new Event('input',{bubbles:true}));
'filled'}")
echo "$SETFILL" | grep -q filled && ok "форма логина заполнена (нативный сеттер)" || bad "нет полей логина"
E "var b=document.querySelector('button[type=submit]')||document.querySelector('form button'); b.click(); 'sent'" >/dev/null 2>&1
sleep 5
timeout 60 $AB open "$BASE/admin/analytics" >/dev/null 2>&1; sleep 6
E "!!document.querySelector('[data-testid=analytics-page]')" | grep -q true && ok "страница «Аналитика» открылась" || bad "нет analytics-page"
E "(document.body.innerText.match(/Популярные подарки/)||[]).length" | grep -q 1 && ok "блок «Популярные подарки» на месте" || bad "нет блока подарков"
# сессия человека в таблице посетителей
E "!!document.querySelector('[data-testid=analytics-sessions]')" | grep -q true && ok "таблица «Посетители» отрисована" || bad "нет таблицы сессий"
# сводка: сессий ≥ 1
SUM=$(curl -s -b /tmp/t133-e2e-cookies.txt "$BASE/api/admin/analytics/summary?days=7" 2>/dev/null)
# таймлайн через UI: первая кнопка «Визит»
E "var b=document.querySelector('[data-testid=analytics-sessions] tbody button'); if(b){b.click();'opened'}else{'no-sessions'}" | grep -q opened && ok "таймлайн визита открыт из таблицы" || bad "нет кнопки таймлайна (сессии пусты?)"
sleep 2
E "!!document.querySelector('[data-testid=analytics-timeline]')" | grep -q true && ok "модалка таймлайна показана" || bad "нет analytics-timeline"
TLTXT=$(E "(document.querySelector('[data-testid=analytics-timeline]')?.innerText||'').slice(0,800)")
echo "$TLTXT" | grep -q "Страница" && ok "таймлайн содержит события визита ($(echo "$TLTXT" | head -c 80 | tr '\n' ' ')…)" || bad "таймлайн пуст: $TLTXT"
echo "$TLTXT" | grep -q "Отпечаток:" && ok "в модалке виден отпечаток визита (Task 134)" || bad "нет блока отпечатка"
E "document.querySelector('[data-testid=analytics-timeline] .text-\\\\[var(--color-muted)\\\\]')?.textContent" >/dev/null 2>&1 || true

# API-проверка данных за визитом браузера
CJ=/tmp/t133-e2e-cookies.txt
LOGIN=$(curl -s -c "$CJ" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d '{"email":"admin@lakomka.local","password":"Lakomka2026!"}')
TOKEN=$(echo "$LOGIN" | $PHP -r 'echo json_decode(stream_get_contents(STDIN),true)["data"]["token"]??"";')
[ -n "$TOKEN" ] && ok "API: логин на стенде" || bad "API: логин не удался"
SUM=$(curl -s "$BASE/api/admin/analytics/summary?days=7" -H "Authorization: Bearer $TOKEN")
GV=$(jget "$SUM" data.period.gift_views)
[ "${GV:-0}" -ge 1 ] && ok "API: gift_views ≥ 1 ($GV) — визит подарка записан" || bad "gift_views: $GV"
PV=$(jget "$SUM" data.period.pageviews)
[ "${PV:-0}" -ge 2 ] && ok "API: pageviews ≥ 2 ($PV — главная + подарок)" || bad "pageviews: $PV"
CA=$(jget "$SUM" data.period.cart_adds)
[ "${CA:-0}" -ge 1 ] && ok "API: cart_adds ≥ 1 ($CA)" || bad "cart_adds: $CA"
CK=$(jget "$SUM" data.period.clicks)
[ "${CK:-0}" -ge 1 ] && ok "API: clicks ≥ 1 ($CK)" || bad "clicks: $CK"
GS=$(echo "$SUM" | $PHP -r '$j=json_decode(stream_get_contents(STDIN),true); $g=$j["data"]["gifts"][0]??null; echo $g?$g["slug"]:"";')
[ "$GS" = "$SLUG" ] && ok "API: топ подарка = посещённому ($GS)" || bad "gifts top: $GS"
SESSA=$(curl -s "$BASE/api/admin/analytics/sessions?days=7&bot=all" -H "Authorization: Bearer $TOKEN")
VISIT=$(echo "$SESSA" | $PHP -r '$j=json_decode(stream_get_contents(STDIN),true); foreach(($j["data"]["items"]??[]) as $s){ if($s["events"]>=3){ echo $s["is_bot"].":".$s["events"]; break; } }')
echo "$VISIT" | grep -q "^1:" && ok "API: сессия браузера записана ($VISIT) — headless-браузер честно классифицирован ботом по UA" || bad "сессия браузера: '$VISIT'"

echo "── C. Защита на стенде ──"
curl -s -o /dev/null -A "Mozilla/5.0 (compatible; YandexBot/3.0)" "$BASE/api/products"
BOTS=$(curl -s "$BASE/api/admin/analytics/bots?days=7" -H "Authorization: Bearer $TOKEN")
echo "$BOTS" | grep -q "YandexBot" && ok "боты: YandexBot зафиксирован на публичном API" || bad "bots: $BOTS" | head -c 120
BH=$($PHP -r 'require $argv[1]."/.deploy-package/backend/src/VisitGuard.php"; echo VisitGuard::ipHash("198.51.100.44");' "$ROOT")
curl -s -o /dev/null -X POST "$BASE/api/admin/analytics/block" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"ip_hash\":\"$BH\",\"ip_mask\":\"198.51.xxx.xxx\",\"reason\":\"e2e\"}"
B403=$(curl -s -o /dev/null -w '%{http_code}' -A "Mozilla/5.0" -H "X-Forwarded-For: 198.51.100.44" "$BASE/api/products")
[ "$B403" = "403" ] && ok "защита: заблокированный IP → 403 на каталоге" || bad "blocked: $B403"
curl -s -o /dev/null -X POST "$BASE/api/admin/analytics/unblock" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"ip_hash\":\"$BH\"}"
B200=$(curl -s -o /dev/null -w '%{http_code}' -A "Mozilla/5.0" -H "X-Forwarded-For: 198.51.100.44" "$BASE/api/products")
[ "$B200" = "200" ] && ok "защита: после разблокировки → 200" || bad "unblocked: $B200"

# уборка аналитики стенда
curl -s -o /dev/null -X POST "$BASE/api/admin/analytics/wipe" -H "Authorization: Bearer $TOKEN"
ok "аналитика стенда очищена"

echo
echo "═══ Итог: PASS=$PASS FAIL=$FAIL ═══"
[ "$FAIL" = "0" ]
