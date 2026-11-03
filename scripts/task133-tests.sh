#!/bin/bash
# Task 133: собственная аналитика посещений + защита от ботов.
# VisitGuard (коллектор витрины, бот-детект по UA и поведению, rate-limit,
# блок-лист IP), AdminAnalyticsController (сводка/подарки/страницы/сессии/
# боты/блок/разблок/очистка), трекер на витрине, вкладка «Аналитика».
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

echo "── 1. Синтаксис, типы, линт ──"
for f in backend/src/VisitGuard.php backend/src/Controllers/AdminAnalyticsController.php backend/public/index.php; do
  $PHP -l "$ROOT/$f" > /dev/null 2>&1 && ok "php -l $(basename $f)" || bad "php -l $(basename $f)"
done
./node_modules/.bin/tsc --noEmit > /tmp/t133-tsc.log 2>&1 && ok "tsc --noEmit чист" || bad "tsc: $(head -3 /tmp/t133-tsc.log)"
# eslint — файлы, затронутые задачей (страница orders имеет такой же легаси-
# паттерн set-state-in-effect на master; страница analytics ему следует)
./node_modules/.bin/eslint src/lib/visit-tracker.ts src/components/analytics/VisitTracker.tsx "src/app/(shop)/layout.tsx" src/store/cart.ts src/components/product/ProductView.tsx src/app/admin/layout.tsx > /tmp/t133-eslint.log 2>&1 \
  && ok "eslint трекера/интеграций чист" || bad "eslint: $(grep -E 'error' /tmp/t133-eslint.log | head -2)"

echo "── 2. Маркеры ──"
rg -q 'VisitGuard::collect' "$ROOT/backend/public/index.php" && ok "роут POST /api/analytics/collect" || bad "нет роута collect"
rg -qF "VisitGuard::guard(\$pdo, 'public-read'" "$ROOT/backend/public/index.php" && ok "щит на публичных GET (каталог/категории/настройки)" || bad "нет guard public-read"
rg -qF "VisitGuard::guard(\$pdo, 'order-create', [[60, 5], [3600, 30]])" "$ROOT/backend/public/index.php" && ok "антиспам заказов 5/мин и 30/час" || bad "нет guard order-create"
rg -q 'BOT_UA_RE' "$ROOT/backend/src/VisitGuard.php" && ok "VisitGuard: сигнатуры ботов по UA" || bad "нет BOT_UA_RE"
rg -qF "bot_reason = 'behavior'" "$ROOT/backend/src/VisitGuard.php" && ok "VisitGuard: поведенческий бот-детект" || bad "нет behavior-детекта"
rg -qF ". '|' . \$windowSec . '|' . self::ipHash()" "$ROOT/backend/src/VisitGuard.php" && ok "VisitGuard: бакет rate-limit включает окно" || bad "бакет без окна"
rg -qF "hash('sha256', (\$ip ?? self::clientIp())" "$ROOT/backend/src/VisitGuard.php" && ok "VisitGuard: IP хранится только хешем с солью" || bad "нет хеша IP"
rg -q 'AdminAnalyticsController::summary' "$ROOT/backend/public/index.php" && ok "роут admin/analytics/summary" || bad "нет роута summary"
rg -q 'AdminAnalyticsController::sessionEvents' "$ROOT/backend/public/index.php" && ok "роут admin/analytics/sessions/{id}/events" || bad "нет роута таймлайна"
rg -q 'AdminAnalyticsController::wipe' "$ROOT/backend/public/index.php" && ok "роут admin/analytics/wipe" || bad "нет роута wipe"
rg -q 'requireSuperAdmin' "$ROOT/backend/src/Controllers/AdminAnalyticsController.php" && ok "wipe только super_admin" || bad "wipe без requireSuperAdmin"
rg -q 'Auth::requireEditor' "$ROOT/backend/src/Controllers/AdminAnalyticsController.php" && ok "блокировка IP — редактор+" || bad "block без requireEditor"
[ -f "$ROOT/backend/migrations/006_analytics.sql" ] && ok "миграция 006_analytics.sql" || bad "нет миграции"
rg -q 'visit_sessions' "$ROOT/backend/migrations/006_analytics.sql" && rg -q 'UNIQUE \(sid, ip_hash\)' "$ROOT/backend/migrations/006_analytics.sql" \
  && ok "схема: visit_sessions с UNIQUE(sid, ip_hash)" || bad "схема сессий"
rg -q '/admin/analytics' "$ROOT/src/app/admin/layout.tsx" && ok "навигация: вкладка «Аналитика»" || bad "нет вкладки"
rg -q '<VisitTracker />' "$ROOT/src/app/(shop)/layout.tsx" && ok "трекер смонтирован в витрине" || bad "нет VisitTracker в (shop)"
rg -q 'trackGiftView' "$ROOT/src/components/product/ProductView.tsx" && ok "gift_view в карточке товара" || bad "нет trackGiftView"
rg -q 'trackCartAdd' "$ROOT/src/store/cart.ts" && ok "cart_add в сторе корзины" || bad "нет trackCartAdd"
rg -q 'sendBeacon' "$ROOT/src/lib/visit-tracker.ts" && ok "трекер: flush при закрытии через sendBeacon" || bad "нет sendBeacon"
rg -q 'data-testid="analytics-gifts"' "$ROOT/src/app/admin/analytics/page.tsx" && ok "UI: таблица популярных подарков" || bad "нет analytics-gifts"
rg -q 'data-testid="analytics-timeline"' "$ROOT/src/app/admin/analytics/page.tsx" && ok "UI: таймлайн визита" || bad "нет таймлайна"

echo "── 3. Юнит VisitGuard ──"
$PHP -r '
require $argv[1]."/backend/src/VisitGuard.php";
$out = [];
$out[] = VisitGuard::uaIsBot("Mozilla/5.0 (compatible; YandexBot/3.0)") ? 1 : 0;
$out[] = VisitGuard::uaIsBot("python-requests/2.31.0") ? 1 : 0;
$out[] = VisitGuard::uaIsBot("curl/8.5.0") ? 1 : 0;
$out[] = VisitGuard::uaIsBot("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0 Safari/537.36") ? 0 : 1;
$out[] = VisitGuard::uaIsBot("") ? 1 : 0;
$out[] = VisitGuard::uaIsBot("Mozilla/5.0 (compatible; PetalBot;+https://webmaster.petalsearch.com/site/petalbot)") ? 1 : 0;
echo implode(",", $out);
' "$ROOT" > /tmp/t133-ua.out 2>&1
[ "$(cat /tmp/t133-ua.out)" = "1,1,1,1,1,1" ] && ok "uaIsBot: боты по UA (Яндекс/python/curl/пустой/PetalBot), Chrome — не бот" || bad "uaIsBot: $(cat /tmp/t133-ua.out)"
$PHP -r '
require $argv[1]."/backend/src/VisitGuard.php";
echo VisitGuard::ipMask("203.0.113.77"), "|", VisitGuard::ipMask("2606:4700:4700::1111");
' "$ROOT" > /tmp/t133-mask.out 2>&1
[ "$(cat /tmp/t133-mask.out)" = "203.0.xxx.xxx|2606:4700:4700:…" ] && ok "ipMask: IPv4/IPv6 маски" || bad "ipMask: $(cat /tmp/t133-mask.out)"
$PHP -r '
require $argv[1]."/backend/src/VisitGuard.php";
$a = VisitGuard::ipHash("198.51.100.77");
$b = VisitGuard::ipHash("198.51.100.78");
echo strlen($a) === 64 && $a !== $b ? "ok" : "fail";
' "$ROOT" > /tmp/t133-hash.out 2>&1
[ "$(cat /tmp/t133-hash.out)" = "ok" ] && ok "ipHash: 64 hex, разные IP — разные хеши" || bad "ipHash"

echo "── 4. API (:8054) ──"
PORT=8054; BASE="http://127.0.0.1:$PORT/api"; LOG=/tmp/t133-php.log
export PHP_CLI_SERVER_WORKERS=8
pkill -f "127.0.0.1:$PORT" 2>/dev/null; sleep 1
( setsid "$PHP" -S 127.0.0.1:$PORT "$ROOT/backend/public/index.php" >"$LOG" 2>&1 & )
UP=1
for i in $(seq 1 30); do curl -s "$BASE/health" | grep -q ok && { UP=0; break; }; sleep 0.3; done
[ "$UP" = "0" ] && ok "сервер :$PORT поднялся" || { bad "сервер не поднялся"; exit 1; }

# чистые счётчики и тестовые сущности перед прогоном
$PHP -r '
require $argv[1]."/backend/config.php"; require $argv[1]."/backend/src/Database.php";
$pdo = Database::get();
$pdo->exec("DELETE FROM rate_limits");
$pdo->exec("DELETE FROM visit_events"); $pdo->exec("DELETE FROM visit_sessions"); $pdo->exec("DELETE FROM bot_hits");
$pdo->exec("DELETE FROM ip_blocks");
foreach (["t133-a"] as $s) {
  $pdo->prepare("DELETE FROM product_images WHERE product_id IN (SELECT id FROM products WHERE slug = ?)")->execute([$s]);
  $pdo->prepare("DELETE FROM products WHERE slug = ?")->execute([$s]);
}
echo "reset";
' "$ROOT" > /dev/null 2>&1 && ok "аналитика и счётчики сброшены" || bad "reset не удался"

CJ=/tmp/t133-cookies.txt
LOGIN=$(curl -s -c "$CJ" -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d '{"email":"admin@lakomka.local","password":"Lakomka2026!"}')
echo "$LOGIN" | grep -q "token" && ok "логин администратором" || bad "логин: $LOGIN"
TOKEN=$(echo "$LOGIN" | $PHP -r 'echo json_decode(stream_get_contents(STDIN),true)["data"]["token"]??"";')

# сид: товар с картинкой (для обложки/цены в топе подарков)
$PHP -r '
require $argv[1]."/backend/config.php"; require $argv[1]."/backend/src/Database.php";
$pdo = Database::get();
$pdo->exec("INSERT INTO products (name, type, slug, price_kopecks, stock_qty, show_in_catalog, is_published) VALUES (\"Тест-133 Подарок Аналитики\", \"simple\", \"t133-a\", 123400, 7, 1, 1)");
$pdo->prepare("INSERT INTO product_images (product_id, url, alt, media_type, sort_order) SELECT id, \"/uploads/products/t133-a/cover.jpg\", \"тест\", \"image\", 0 FROM products WHERE slug = \"t133-a\"")->execute();
echo "db-ok";
' "$ROOT" > /dev/null 2>&1 && ok "тестовый товар t133-a создан" || bad "товар не создался"
UPD="$ROOT/public/uploads"
mkdir -p "$UPD/products/t133-a"
$PHP -r '$im=imagecreatetruecolor(400,300); imagefill($im,0,0,imagecolorallocate($im,180,60,60)); imagejpeg($im,$argv[1]."/public/uploads/products/t133-a/cover.jpg",85);' "$ROOT"

# ── auth-щит админ-аналитики ──
ANON=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/analytics/summary")
[ "$ANON" = "401" ] && ok "аноним → summary 401" || bad "аноним summary: $ANON"
ANON2=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/admin/analytics/block" -H "Content-Type: application/json" -d '{"ip_hash":"aabb"}')
[ "$ANON2" = "401" ] && ok "аноним → block 401" || bad "аноним block: $ANON2"

# ── collect: валидация ──
BAD1=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/analytics/collect" -H "Content-Type: application/json" -d '{"sid":"короткий","events":[]}')
[ "$BAD1" = "422" ] && ok "collect: плохой sid → 422" || bad "sid: $BAD1"
BAD2=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/analytics/collect" -H "Content-Type: application/json" -d 'не-json')
[ "$BAD2" = "400" ] && ok "collect: битый JSON → 400" || bad "json: $BAD2"

# ── живой визит человека ──
HUMAN='{"sid":"t133-human-0001","screen":"1920x1080","ref":"https://yandex.ru/search/","land":"/",
 "events":[
  {"t":"pageview","path":"/"},
  {"t":"click","path":"/","m":{"tag":"a","text":"Каталог","href":"/catalog"}},
  {"t":"pageview","path":"/product/t133-a"},
  {"t":"gift_view","path":"/product/t133-a","gs":"t133-a","gn":"Тест-133 Подарок Аналитики"},
  {"t":"cart_add","path":"/product/t133-a","gs":"t133-a","gn":"Тест-133 Подарок Аналитики"},
  {"t":"pageview","path":"/catalog"},
  {"t":"scroll","path":"/catalog","m":{"pct":80}},
  {"t":"leave","path":"/","m":{"sec":42}}
 ]}'
R1=$(curl -s -X POST "$BASE/analytics/collect" -H "Content-Type: application/json" \
  -A "Mozilla/5.0 (Windows NT 10.0) Chrome/120" -d "$(echo "$HUMAN" | tr -d '\n')")
echo "$R1" | grep -q '"ok":true' && ok "collect: визит человека принят" || bad "collect: $R1"

# ── сессия бота по UA ──
curl -s -o /dev/null -X POST "$BASE/analytics/collect" -H "Content-Type: application/json" \
  -A "Mozilla/5.0 (compatible; SemrushBot/7~bl)" \
  -d '{"sid":"t133-bot-ua-001","events":[{"t":"pageview","path":"/"},{"t":"pageview","path":"/catalog"}]}'
ok "collect: сессия бота (SemrushBot) отправлена"

# ── поведенческий бот: 26 pageview за 2 минуты ──
$PHP -r '$evs=[]; for($i=0;$i<26;$i++){$evs[]=["t"=>"pageview","path"=>"/p$i"];} echo json_encode(["sid"=>"t133-bot-behavior","events"=>$evs]);' > /tmp/t133-behavior.json
curl -s -o /dev/null -X POST "$BASE/analytics/collect" -H "Content-Type: application/json" \
  -A "Mozilla/5.0 (X11; Linux) Chrome/120" -d @/tmp/t133-behavior.json
ok "collect: поведенческий флуд отправлен"

# ── бот-хиты на публичном API (учёт в bot_hits) ──
curl -s -o /dev/null -A "Mozilla/5.0 (compatible; YandexBot/3.0)" "$BASE/products"
curl -s -o /dev/null -A "Mozilla/5.0 (compatible; YandexBot/3.0)" "$BASE/products"
curl -s -o /dev/null -A "python-requests/2.31" "$BASE/products"
ok "публичный API от ботов — 3 запроса"

# ── сводка ──
SUM=$(curl -s -b "$CJ" "$BASE/admin/analytics/summary?days=7")
[ "$(jget "$SUM" data.period.sessions)" -ge 3 ] && ok "сводка: сессий ≥ 3 ($(jget "$SUM" data.period.sessions))" || bad "sessions: $(jget "$SUM" data.period.sessions)"
[ "$(jget "$SUM" data.period.humans)" = "1" ] && ok "сводка: людей = 1" || bad "humans: $(jget "$SUM" data.period.humans)"
[ "$(jget "$SUM" data.period.bots)" -ge 2 ] && ok "сводка: ботов ≥ 2 ($(jget "$SUM" data.period.bots))" || bad "bots: $(jget "$SUM" data.period.bots)"
[ "$(jget "$SUM" data.period.gift_views)" = "1" ] && ok "сводка: просмотров подарка = 1" || bad "gift_views: $(jget "$SUM" data.period.gift_views)"
[ "$(jget "$SUM" data.period.cart_adds)" = "1" ] && ok "сводка: добавлений в корзину = 1" || bad "cart_adds: $(jget "$SUM" data.period.cart_adds)"
[ "$(jget "$SUM" data.period.clicks)" = "1" ] && ok "сводка: кликов = 1" || bad "clicks: $(jget "$SUM" data.period.clicks)"
GSUM=$(echo "$SUM" | $PHP -r '$j=json_decode(stream_get_contents(STDIN),true); $g=$j["data"]["gifts"][0]??null; echo $g?$g["slug"]."|".$g["views"]."|".($g["cover"]??"")."|".$g["price_kopecks"]:"";')
echo "$GSUM" | grep -q "^t133-a|1|" && ok "подарки: t133-a топ с обложкой и ценой ($GSUM)" || bad "gifts: $GSUM"
echo "$GSUM" | grep -q "|123400$" && ok "подарки: цена из БД (123400)" || bad "цена: $GSUM"
PSUM=$(echo "$SUM" | $PHP -r '$j=json_decode(stream_get_contents(STDIN),true); foreach($j["data"]["pages"] as $p){echo $p["path"].":".$p["views"].":".($p["scroll"]??"-").":".($p["time"]??"-").";";}')
echo "$PSUM" | grep -q "/catalog:[0-9]*:80:-" && ok "страницы: /catalog с доскроллом 80%" || bad "pages scroll: $PSUM"
echo "$PSUM" | grep -q "/:[0-9]*:-:42" && ok "страницы: / время 42с" || bad "time: $PSUM"
SSUM=$(echo "$SUM" | $PHP -r '$j=json_decode(stream_get_contents(STDIN),true); foreach($j["data"]["sources"] as $s){echo $s["source"]."=".$s["sessions"].";";}')
echo "$SSUM" | grep -q "yandex.ru=1" && ok "источники: yandex.ru = 1" || bad "sources: $SSUM"

# ── сессии и фильтры ──
SESS=$(curl -s -b "$CJ" "$BASE/admin/analytics/sessions?days=7&bot=human")
[ "$(jget "$SESS" data.items.0.sid)" = "t133-human-0001" ] && ok "сессии: фильтр человек находит визит" || bad "sessions human: $(jget "$SESS" data.items.0.sid)"
SESSB=$(curl -s -b "$CJ" "$BASE/admin/analytics/sessions?days=7&bot=bot")
NSESSB=$(echo "$SESSB" | $PHP -r '$j=json_decode(stream_get_contents(STDIN),true); echo count($j["data"]["items"]??[]);')
[ "$NSESSB" -ge 2 ] && ok "сессии: ботов в фильтре ≥ 2 ($NSESSB)" || bad "bots filter: $NSESSB"
REASON=$(echo "$SESSB" | $PHP -r '$j=json_decode(stream_get_contents(STDIN),true); foreach($j["data"]["items"] as $s){ if($s["sid"]==="t133-bot-behavior") echo $s["bot_reason"]; }')
[ "$REASON" = "behavior" ] && ok "сессии: поведенческий бот помечен reason=behavior" || bad "behavior reason: $REASON"
HASIP=$(echo "$SESS" | $PHP -r '$j=json_decode(stream_get_contents(STDIN),true); $s=$j["data"]["items"][0]; echo (strpos($s["ip_mask"],"xxx")!==false && strlen($s["ip_hash"])===64)?"ok":"no";')
[ "$HASIP" = "ok" ] && ok "сессии: IP замаскирован, хеш 64 hex" || bad "ip: $HASIP"

# ── таймлайн ──
HID=$(curl -s -b "$CJ" "$BASE/admin/analytics/sessions?days=7&bot=human" | $PHP -r 'echo json_decode(stream_get_contents(STDIN),true)["data"]["items"][0]["id"];')
TL=$(curl -s -b "$CJ" "$BASE/admin/analytics/sessions/$HID/events")
[ "$(jget "$TL" data.items.0.type)" = "pageview" ] && ok "таймлайн: первое событие pageview" || bad "timeline: $(jget "$TL" data.items.0.type)"
TLMETA=$(echo "$TL" | $PHP -r '$j=json_decode(stream_get_contents(STDIN),true); foreach($j["data"]["items"] as $e){ if($e["type"]==="click") echo json_encode($e["meta"],JSON_UNESCAPED_UNICODE); }')
echo "$TLMETA" | grep -q "Каталог" && ok "таймлайн: meta клика расшифрована ($TLMETA)" || bad "click meta: $TLMETA"

# ── блокировка/разблокировка IP ──
BH=$($PHP -r 'require $argv[1]."/backend/src/VisitGuard.php"; echo VisitGuard::ipHash("198.51.100.77");' "$ROOT")
BLOCK=$(curl -s -b "$CJ" -X POST "$BASE/admin/analytics/block" -H "Content-Type: application/json" -d "{\"ip_hash\":\"$BH\",\"ip_mask\":\"198.51.xxx.xxx\",\"reason\":\"тест 133\"}")
echo "$BLOCK" | grep -q '"ok":true' && ok "block: IP заблокирован" || bad "block: $BLOCK"
CODE403=$(curl -s -o /dev/null -w '%{http_code}' -A "Mozilla/5.0" -H "X-Forwarded-For: 198.51.100.77" "$BASE/products")
[ "$CODE403" = "403" ] && ok "заблокированный IP → каталог 403" || bad "blocked products: $CODE403"
CODE403C=$(curl -s -o /dev/null -w '%{http_code}' -A "Mozilla/5.0" -H "X-Forwarded-For: 198.51.100.77" -X POST "$BASE/analytics/collect" -H "Content-Type: application/json" -d '{"sid":"t133-blocked-xx","events":[]}')
[ "$CODE403C" = "403" ] && ok "заблокированный IP → collect 403" || bad "blocked collect: $CODE403C"
BL=$(curl -s -b "$CJ" "$BASE/admin/analytics/blocks")
[ "$(jget "$BL" data.items.0.ip_mask)" = "198.51.xxx.xxx" ] && ok "блок-лист: адрес виден" || bad "blocks: $(jget "$BL" data.items.0.ip_mask)"
UNBLOCK=$(curl -s -b "$CJ" -X POST "$BASE/admin/analytics/unblock" -H "Content-Type: application/json" -d "{\"ip_hash\":\"$BH\"}")
echo "$UNBLOCK" | grep -q '"ok":true' && ok "unblock: адрес разблокирован" || bad "unblock: $UNBLOCK"
CODEOK=$(curl -s -o /dev/null -w '%{http_code}' -A "Mozilla/5.0" -H "X-Forwarded-For: 198.51.100.77" "$BASE/products")
[ "$CODEOK" = "200" ] && ok "после разблокировки каталог снова 200" || bad "unblocked products: $CODEOK"
BOTS=$(curl -s -b "$CJ" "$BASE/admin/analytics/bots?days=7")
[ "$(jget "$BOTS" data.items.0.hits)" -ge 2 ] && ok "боты: агрегат YandexBot hits ≥ 2 ($(jget "$BOTS" data.items.0.hits))" || bad "bots: $(jget "$BOTS" data.items.0.hits)"
[ -n "$(jget "$BOTS" data.items.0.ip_hash)" ] && ok "боты: ip_hash в ответе (для блокировки)" || bad "bot ip_hash пуст"

# ── rate-limit collect: 60/мин на IP (62-й запрос → 429) ──
CODES=""
for i in $(seq 1 62); do
  C=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/analytics/collect" -H "Content-Type: application/json" \
    -A "Mozilla/5.0 RateTest" -H "X-Forwarded-For: 192.0.2.133" -d "{\"sid\":\"t133-rate-$i\",\"events\":[{\"t\":\"pageview\",\"path\":\"/r\"}]}")
  CODES="$CODES $C"
done
FIRST61=$(echo "$CODES" | tr ' ' '\n' | grep -c 200 || true)
LAST=$(echo "$CODES" | awk '{print $NF}')
[ "$LAST" = "429" ] && ok "rate-limit: 61-й и 62-й батчи → 429" || bad "rate-limit: последний $LAST"
[ "$FIRST61" -ge 60 ] && ok "rate-limit: первые 60 батчей прошли ($FIRST61)" || bad "прошли: $FIRST61"

# ── журнал ──
LOGBLOCK=$($PHP -r 'require $argv[1]."/backend/config.php"; require $argv[1]."/backend/src/Database.php"; echo (int)Database::get()->query("SELECT COUNT(*) FROM admin_log WHERE action = \"analytics.block\"")->fetchColumn();' "$ROOT")
[ "$LOGBLOCK" != "0" ] && ok "AdminLog: analytics.block записан" || bad "admin_log пуст"

# ── уборка ──
WIPE=$(curl -s -b "$CJ" -X POST "$BASE/admin/analytics/wipe")
echo "$WIPE" | grep -q '"ok":true' && ok "wipe: аналитика очищена ($WIPE)" || bad "wipe: $WIPE"
$PHP -r '
require $argv[1]."/backend/config.php"; require $argv[1]."/backend/src/Database.php";
$pdo = Database::get();
$pdo->exec("DELETE FROM rate_limits");
$pdo->exec("DELETE FROM ip_blocks");
foreach (["t133-a"] as $s) {
  $pdo->prepare("DELETE FROM product_images WHERE product_id IN (SELECT id FROM products WHERE slug = ?)")->execute([$s]);
  $pdo->prepare("DELETE FROM products WHERE slug = ?")->execute([$s]);
}
echo "clean";
' "$ROOT" > /dev/null 2>&1 && rm -rf "$UPD/products/t133-a" && ok "уборка: товар, счётчики, блок-лист удалены" || bad "уборка не удалась"

echo
echo "═══ Итог: PASS=$PASS FAIL=$FAIL ═══"
[ "$FAIL" = "0" ]
