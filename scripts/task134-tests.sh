#!/bin/bash
# Task 134: бот-детект v2 — отпечаток браузера + человеческий ввод.
# ИИ-агенты (DeepSeek и подобные) с обычным Chrome-UA больше не проходят
# как люди: трекер присылает env (webdriver/window.chrome/плагины/языки/
# тач) и sig (мышь/касания/клавиатура), сервер смотрит Accept-Language,
# взвешенный балл ≥60 → бот «fp:…», 30…59 → бейдж «Подозрение».
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
./node_modules/.bin/tsc --noEmit > /tmp/t134-tsc.log 2>&1 && ok "tsc --noEmit чист" || bad "tsc: $(head -3 /tmp/t134-tsc.log)"
./node_modules/.bin/eslint src/lib/visit-tracker.ts src/components/analytics/VisitTracker.tsx > /tmp/t134-eslint.log 2>&1 \
  && ok "eslint трекера чист" || bad "eslint: $(grep -E 'error' /tmp/t134-eslint.log | head -2)"

echo "── 2. Маркеры ──"
[ -f "$ROOT/backend/migrations/007_analytics_fingerprint.sql" ] && ok "миграция 007_analytics_fingerprint.sql" || bad "нет миграции 007"
rg -q 'ADD COLUMN bot_score' "$ROOT/backend/migrations/007_analytics_fingerprint.sql" \
  && rg -q 'ADD COLUMN webdriver' "$ROOT/backend/migrations/007_analytics_fingerprint.sql" \
  && rg -q 'ADD COLUMN no_input' "$ROOT/backend/migrations/007_analytics_fingerprint.sql" \
  && ok "схема: колонки bot_score/webdriver/no_input" || bad "схема миграции 007"
rg -q 'botScore' "$ROOT/backend/src/VisitGuard.php" && ok "VisitGuard: взвешенный botScore" || bad "нет botScore"
rg -q 'BOT_SCORE_THRESHOLD = 60' "$ROOT/backend/src/VisitGuard.php" && ok "VisitGuard: порог бота 60" || bad "нет порога"
rg -q 'SUSPICION_THRESHOLD = 30' "$ROOT/backend/src/VisitGuard.php" && ok "VisitGuard: порог подозрения 30" || bad "нет порога подозрения"
rg -qF "'fp:' . implode(',', \$fp['flags'])" "$ROOT/backend/src/VisitGuard.php" && ok "VisitGuard: reason «fp:флаги»" || bad "нет fp-reason"
rg -q 'no-lang' "$ROOT/backend/src/VisitGuard.php" && rg -q 'no-input' "$ROOT/backend/src/VisitGuard.php" \
  && ok "VisitGuard: флаги no-lang/no-input" || bad "нет флагов"
rg -q 'HTTP_ACCEPT_LANGUAGE' "$ROOT/backend/src/VisitGuard.php" && ok "VisitGuard: серверная проверка Accept-Language" || bad "нет проверки AL"
rg -q 'cleanEnv' "$ROOT/backend/src/VisitGuard.php" && ok "VisitGuard: env чистится (clamp/bool)" || bad "нет cleanEnv"
rg -q 'deepseek|perplexity|chatgpt-user' "$ROOT/backend/src/VisitGuard.php" && ok "VisitGuard: ИИ-краулеры в BOT_UA_RE" || bad "нет ИИ-краулеров"
rg -q 'bot_score, webdriver, mouse_moves' "$ROOT/backend/src/Controllers/AdminAnalyticsController.php" \
  && ok "контроллер: новые колонки в сессиях" || bad "нет колонок в SELECT"
rg -q 'VisitGuard::SUSPICION_THRESHOLD' "$ROOT/backend/src/Controllers/AdminAnalyticsController.php" \
  && rg -qF "'suspected' => \$suspected" "$ROOT/backend/src/Controllers/AdminAnalyticsController.php" \
  && ok "контроллер: счётчик «подозрительных» в сводке" || bad "нет suspected"
rg -q 'collectEnv' "$ROOT/src/lib/visit-tracker.ts" && ok "трекер: сбор отпечатка" || bad "нет collectEnv"
rg -q 'nav.webdriver === true' "$ROOT/src/lib/visit-tracker.ts" && ok "трекер: navigator.webdriver" || bad "нет webdriver"
rg -q 'mousemove' "$ROOT/src/lib/visit-tracker.ts" && rg -q 'touchstart' "$ROOT/src/lib/visit-tracker.ts" \
  && rg -q 'keydown' "$ROOT/src/lib/visit-tracker.ts" \
  && ok "трекер: счётчики мыши/касаний/клавиатуры" || bad "нет слушателей ввода"
rg -q 'payload.env = envSnapshot' "$ROOT/src/lib/visit-tracker.ts" && rg -q 'payload.sig' "$ROOT/src/lib/visit-tracker.ts" \
  && ok "трекер: env/sig в батче" || bad "env/sig не уходят"
rg -q 'Подозрение' "$ROOT/src/app/admin/analytics/page.tsx" && ok "UI: бейдж «Подозрение»" || bad "нет бейджа"
rg -q 'analytics-fp' "$ROOT/src/app/admin/analytics/page.tsx" && ok "UI: отпечаток в таймлайне" || bad "нет analytics-fp"
rg -qF '" (отпечаток)"' "$ROOT/src/app/admin/analytics/page.tsx" && ok "UI: суффикс бота «(отпечаток)»" || bad "нет суффикса"

echo "── 3. Юнит botScore ──"
$PHP -r '
require $argv[1]."/backend/src/VisitGuard.php";
$C = VisitGuard::BOT_SCORE_THRESHOLD;
// 1. webdriver один достаточен
$r = VisitGuard::botScore(["wd"=>1,"chrome"=>1,"plugins"=>5,"langs"=>2,"touch"=>0,"mm"=>0,"ts"=>0,"kd"=>0], true, true, 0, 2, 5);
$a1 = ($r["score"] >= 70 && in_array("webdriver", $r["flags"])) ? 1 : 0;
// 2. человек: полноценный ввод и нормальный отпечаток
$r2 = VisitGuard::botScore(["wd"=>0,"chrome"=>1,"plugins"=>5,"langs"=>3,"touch"=>0,"mm"=>12,"ts"=>0,"kd"=>2], true, true, 1, 3, 60);
$a2 = ($r2["score"] === 0) ? 1 : 0;
// 3. нет AL + UA обещает Chrome, а window.chrome нет → 65 ≥ порога
$r3 = VisitGuard::botScore(["wd"=>0,"chrome"=>0,"plugins"=>5,"langs"=>2,"touch"=>0,"mm"=>3,"ts"=>0,"kd"=>0,"ua"=>"Mozilla/5.0 Chrome/131.0.0.0"], true, false, 0, 1, 3);
$a3 = ($r3["score"] >= $C && in_array("no-chrome", $r3["flags"]) && in_array("no-lang", $r3["flags"])) ? 1 : 0;
// 4. тач-устройство без ввода не штрафуется
$r4 = VisitGuard::botScore(["wd"=>0,"chrome"=>1,"plugins"=>0,"langs"=>3,"touch"=>1,"mm"=>0,"ts"=>0,"kd"=>0], true, true, 0, 3, 60);
$a4 = (!in_array("no-input", $r4["flags"])) ? 1 : 0;
// 5. десктоп: 3+ страницы без единого ввода → +45, no_input=1
$r5 = VisitGuard::botScore(["wd"=>0,"chrome"=>1,"plugins"=>3,"langs"=>2,"touch"=>0,"mm"=>0,"ts"=>0,"kd"=>0], true, true, 0, 3, 30);
$a5 = ($r5["score"] >= 45 && $r5["no_input"] === 1 && in_array("no-input", $r5["flags"])) ? 1 : 0;
// 6. старый клиент без env: мягкие клиентские флаги не начисляются
$r6 = VisitGuard::botScore([], false, true, 0, 3, 30);
$a6 = ($r6["score"] === 0 && $r6["no_input"] === 0) ? 1 : 0;
// 7. быстрый отказ без ввода — слабый сигнал (10), человека не ботом
$r7 = VisitGuard::botScore(["wd"=>0,"chrome"=>1,"plugins"=>3,"langs"=>2,"touch"=>0,"mm"=>0,"ts"=>0,"kd"=>0], true, true, 0, 1, 2);
$a7 = ($r7["score"] === 10 && in_array("quiet", $r7["flags"]) && $r7["score"] < $C) ? 1 : 0;
echo implode(",", [$a1,$a2,$a3,$a4,$a5,$a6,$a7]);
' "$ROOT" > /tmp/t134-score.out 2>&1
[ "$(cat /tmp/t134-score.out)" = "1,1,1,1,1,1,1" ] && ok "botScore: 7 сценариев верны" || bad "botScore: $(cat /tmp/t134-score.out)"
$PHP -r '
require $argv[1]."/backend/src/VisitGuard.php";
$e = VisitGuard::cleanEnv(["wd"=>true,"chrome"=>"1","plugins"=>"999","langs"=>-5,"touch"=>1,"tz"=>"Europe/Moscow\u{0007}x"],["mm"=>"12","ts"=>[],"kd"=>200000]);
$ok1 = ($e["wd"]===1 && $e["chrome"]===1 && $e["plugins"]===99 && $e["langs"]===0 && $e["touch"]===1 && $e["mm"]===12 && $e["ts"]===0 && $e["kd"]===100000 && !str_contains($e["tz"],"\u{0007}"));
$b = VisitGuard::uaIsBot("Mozilla/5.0 (compatible; DeepseekBot/1.0; +https://chat.deepseek.com)") ? 1 : 0;
$p = VisitGuard::uaIsBot("PerplexityBot/1.0; +https://perplexity.ai/perplexitybot") ? 1 : 0;
$h = VisitGuard::uaIsBot("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36") ? 0 : 1;
echo ($ok1?"1":"0"), ",", $b, ",", $p, ",", $h;
' "$ROOT" > /tmp/t134-env.out 2>&1
[ "$(cat /tmp/t134-env.out)" = "1,1,1,1" ] && ok "cleanEnv clamp + DeepSeek/Perplexity в боты, Chrome — человек" || bad "cleanEnv/ua: $(cat /tmp/t134-env.out)"

echo "── 4. API (:8055) ──"
PORT=8055; BASE="http://127.0.0.1:$PORT/api"; LOG=/tmp/t134-php.log
export PHP_CLI_SERVER_WORKERS=8
pkill -f "127.0.0.1:$PORT" 2>/dev/null; sleep 1
( setsid "$PHP" -S 127.0.0.1:$PORT "$ROOT/backend/public/index.php" >"$LOG" 2>&1 & )
UP=1
for i in $(seq 1 30); do curl -s "$BASE/health" | grep -q ok && { UP=0; break; }; sleep 0.3; done
[ "$UP" = "0" ] && ok "сервер :$PORT поднялся" || { bad "сервер не поднялся"; exit 1; }

$PHP -r '
require $argv[1]."/backend/config.php"; require $argv[1]."/backend/src/Database.php";
$pdo = Database::get();
foreach (["DELETE FROM rate_limits","DELETE FROM visit_events","DELETE FROM visit_sessions","DELETE FROM bot_hits","DELETE FROM ip_blocks"] as $q) $pdo->exec($q);
echo "reset";
' "$ROOT" > /dev/null 2>&1 && ok "аналитика и счётчики сброшены" || bad "reset не удался"

CJ=/tmp/t134-cookies.txt
LOGIN=$(curl -s -c "$CJ" -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d '{"email":"admin@lakomka.local","password":"Lakomka2026!"}')
echo "$LOGIN" | grep -q "token" && ok "логин администратором" || bad "логин: $LOGIN"

CHROME_UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

# ── DeepSeek-подобный агент: обычный Chrome-UA, webdriver=true, без ввода ──
DS='{"sid":"t134-deepseek-001","screen":"1280x720","ref":"","land":"/",
 "env":{"wd":1,"chrome":1,"plugins":5,"langs":2,"tz":"Asia/Shanghai","touch":0},
 "sig":{"mm":0,"ts":0,"kd":0},
 "events":[{"t":"pageview","path":"/"},{"t":"pageview","path":"/catalog"}]}'
curl -s -o /dev/null -X POST "$BASE/analytics/collect" -H "Content-Type: application/json" \
  -A "$CHROME_UA" -H "Accept-Language: en-US,en;q=0.9" -d "$(echo "$DS" | tr -d '\n')"
ok "collect: DeepSeek-подобный агент отправлен"

# ── бот с замазанным webdriver: нет chrome-объекта, нет AL, голый клиент ──
PB='{"sid":"t134-patched-001","screen":"1920x1080","ref":"","land":"/",
 "env":{"wd":0,"chrome":0,"plugins":0,"langs":0,"tz":"","touch":0},
 "sig":{"mm":0,"ts":0,"kd":0},
 "events":[{"t":"pageview","path":"/"},{"t":"pageview","path":"/catalog"}]}'
curl -s -o /dev/null -X POST "$BASE/analytics/collect" -H "Content-Type: application/json" \
  -A "$CHROME_UA" -d "$(echo "$PB" | tr -d '\n')"
ok "collect: бот с замазанным webdriver отправлен"

# ── живой человек: мышь, клавиатура, клик, нормальный отпечаток ──
HU='{"sid":"t134-human-0001","screen":"1920x1080","ref":"https://ya.ru/","land":"/",
 "env":{"wd":0,"chrome":1,"plugins":5,"langs":3,"tz":"Europe/Moscow","touch":0},
 "sig":{"mm":37,"ts":0,"kd":4},
 "events":[
  {"t":"pageview","path":"/"},
  {"t":"click","path":"/","m":{"tag":"a","text":"Каталог","href":"/catalog"}},
  {"t":"pageview","path":"/catalog"},
  {"t":"scroll","path":"/catalog","m":{"pct":70}}
 ]}'
curl -s -o /dev/null -X POST "$BASE/analytics/collect" -H "Content-Type: application/json" \
  -A "$CHROME_UA" -H "Accept-Language: ru-RU,ru;q=0.9" -d "$(echo "$HU" | tr -d '\n')"
ok "collect: визит человека отправлен"

# ── подозрительный: читает 3 страницы без единого ввода (тач нет) ──
SP='{"sid":"t134-suspect-001","screen":"1600x900","ref":"","land":"/",
 "env":{"wd":0,"chrome":1,"plugins":3,"langs":2,"tz":"Europe/Berlin","touch":0},
 "sig":{"mm":0,"ts":0,"kd":0},
 "events":[{"t":"pageview","path":"/"},{"t":"pageview","path":"/catalog"},{"t":"pageview","path":"/candy"}]}'
curl -s -o /dev/null -X POST "$BASE/analytics/collect" -H "Content-Type: application/json" \
  -A "$CHROME_UA" -H "Accept-Language: de-DE,de;q=0.9" -d "$(echo "$SP" | tr -d '\n')"
ok "collect: подозрительная сессия (3 страницы без ввода) отправлена"

# ── легаси-клиент без env (старый фронт) с кликом — не трогаем ──
LG='{"sid":"t134-legacy-001","screen":"800x600","ref":"","land":"/",
 "events":[{"t":"pageview","path":"/"},{"t":"click","path":"/","m":{"tag":"a","text":"x"}}]}'
curl -s -o /dev/null -X POST "$BASE/analytics/collect" -H "Content-Type: application/json" \
  -A "$CHROME_UA" -d "$(echo "$LG" | tr -d '\n')"
ok "collect: легаси-батч без env отправлен"

# ── проверки классификации ──
SESS=$(curl -s -b "$CJ" "$BASE/admin/analytics/sessions?days=7&limit=200")
DSROW=$(echo "$SESS" | $PHP -r '$j=json_decode(stream_get_contents(STDIN),true); foreach($j["data"]["items"] as $s){ if($s["sid"]==="t134-deepseek-001") echo json_encode($s,JSON_UNESCAPED_UNICODE); }')
echo "$DSROW" | grep -q '"is_bot":1' && ok "DeepSeek-агент → бот" || bad "deepseek is_bot: $DSROW"
echo "$DSROW" | rg -q '"bot_reason":"fp:webdriver' && ok "DeepSeek-агент → reason fp:webdriver" || bad "deepseek reason: $(echo "$DSROW" | python3 -c 'import json,sys; print(json.loads(sys.stdin.read()).get("bot_reason",""))' 2>/dev/null)"
DPSCORE=$(echo "$DSROW" | $PHP -r '$s=json_decode(stream_get_contents(STDIN),true); echo (int)($s["bot_score"]??0);')
[ "$DPSCORE" -ge 70 ] && ok "DeepSeek-агент → bot_score ≥ 70 ($DPSCORE)" || bad "deepseek score: $DPSCORE"
PBROW=$(echo "$SESS" | $PHP -r '$j=json_decode(stream_get_contents(STDIN),true); foreach($j["data"]["items"] as $s){ if($s["sid"]==="t134-patched-001") echo json_encode($s,JSON_UNESCAPED_UNICODE); }')
echo "$PBROW" | rg -q '"bot_reason":"fp:no-chrome' && ok "замазанный webdriver → бот по сочетанию (fp:no-chrome,…)" || bad "patched reason: $(echo "$PBROW" | python3 -c 'import json,sys; print(json.loads(sys.stdin.read()).get("bot_reason",""))' 2>/dev/null)"
HUROW=$(echo "$SESS" | $PHP -r '$j=json_decode(stream_get_contents(STDIN),true); foreach($j["data"]["items"] as $s){ if($s["sid"]==="t134-human-0001") echo json_encode($s,JSON_UNESCAPED_UNICODE); }')
echo "$HUROW" | grep -q '"is_bot":0' && ok "человек с вводом → is_bot=0" || bad "human is_bot: $HUROW"
HUSCORE=$(echo "$HUROW" | $PHP -r '$s=json_decode(stream_get_contents(STDIN),true); echo (int)($s["bot_score"]??-1);')
[ "$HUSCORE" = "0" ] && ok "человек с вводом → bot_score=0" || bad "human score: $HUSCORE"
echo "$HUROW" | rg -q '"mouse_moves":37' && rg -q '"key_downs":4' <<< "$HUROW" && ok "человек: счётчики мыши/клавиатуры записаны (37/4)" || bad "human counters: $HUROW"
echo "$HUROW" | rg -q '"accept_lang":1' && ok "человек: Accept-Language зафиксирован" || bad "human al"
SPROW=$(echo "$SESS" | $PHP -r '$j=json_decode(stream_get_contents(STDIN),true); foreach($j["data"]["items"] as $s){ if($s["sid"]==="t134-suspect-001") echo json_encode($s,JSON_UNESCAPED_UNICODE); }')
SPB=$(echo "$SPROW" | $PHP -r '$s=json_decode(stream_get_contents(STDIN),true); echo (int)($s["bot_score"]??0);')
[ "$SPB" -ge 30 ] && [ "$SPB" -lt 60 ] && ok "подозрительный: 30 ≤ bot_score < 60 ($SPB), ещё не бот" || bad "suspect score: $SPB"
echo "$SPROW" | rg -q '"no_input":1' && ok "подозрительный: no_input=1" || bad "suspect no_input"
LGROW=$(echo "$SESS" | $PHP -r '$j=json_decode(stream_get_contents(STDIN),true); foreach($j["data"]["items"] as $s){ if($s["sid"]==="t134-legacy-001") echo json_encode($s,JSON_UNESCAPED_UNICODE); }')
echo "$LGROW" | grep -q '"is_bot":0' && ok "легаси-батч без env с кликом → человек" || bad "legacy is_bot: $LGROW"

# ── сводка: suspected и боты ──
SUM=$(curl -s -b "$CJ" "$BASE/admin/analytics/summary?days=7")
[ "$(jget "$SUM" data.period.suspected)" -ge 1 ] && ok "сводка: suspected ≥ 1 ($(jget "$SUM" data.period.suspected))" || bad "suspected: $(jget "$SUM" data.period.suspected)"
[ "$(jget "$SUM" data.period.bots)" -ge 2 ] && ok "сводка: ботов ≥ 2 ($(jget "$SUM" data.period.bots))" || bad "bots: $(jget "$SUM" data.period.bots)"

# ── таймлайн: отпечаток в sessionEvents ──
DSID=$(echo "$SESS" | $PHP -r '$j=json_decode(stream_get_contents(STDIN),true); foreach($j["data"]["items"] as $s){ if($s["sid"]==="t134-deepseek-001"){ echo $s["id"]; break; } }')
TL=$(curl -s -b "$CJ" "$BASE/admin/analytics/sessions/$DSID/events")
echo "$TL" | rg -qF '"fp":"{' && echo "$TL" | rg -qF '\"wd\":1' \
  && ok "таймлайн: сессия с отпечатком (fp с wd=1)" || bad "timeline fp: $(echo "$TL" | head -c 200)"

# ── поведенческий флуд: reason=behavior перекрывает fp ──
$PHP -r '$evs=[]; for($i=0;$i<26;$i++){$evs[]=["t"=>"pageview","path"=>"/f$i"];} echo json_encode(["sid"=>"t134-behavior-01","env"=>["wd"=>0,"chrome"=>1,"plugins"=>3,"langs"=>2,"tz"=>"","touch"=>0],"sig"=>["mm"=>0,"ts"=>0,"kd"=>0],"events"=>$evs]);' > /tmp/t134-behavior.json
curl -s -o /dev/null -X POST "$BASE/analytics/collect" -H "Content-Type: application/json" \
  -A "Mozilla/5.0 (X11; Linux) Chrome/120" -d @/tmp/t134-behavior.json
BROW=$(curl -s -b "$CJ" "$BASE/admin/analytics/sessions?days=7&bot=bot&limit=200" | $PHP -r '$j=json_decode(stream_get_contents(STDIN),true); foreach($j["data"]["items"] as $s){ if($s["sid"]==="t134-behavior-01") echo $s["bot_reason"]; }')
[ "$BROW" = "behavior" ] && ok "флуд: reason=behavior перекрывает отпечаток" || bad "behavior reason: $BROW"

# ── регресс: блок-лист и rate-limit collect не сломаны ──
BH=$($PHP -r 'require $argv[1]."/backend/src/VisitGuard.php"; echo VisitGuard::ipHash("203.0.113.50");' "$ROOT")
curl -s -o /dev/null -b "$CJ" -X POST "$BASE/admin/analytics/block" -H "Content-Type: application/json" -d "{\"ip_hash\":\"$BH\",\"ip_mask\":\"203.0.113.xxx\",\"reason\":\"тест 134\"}"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -A "$CHROME_UA" -H "X-Forwarded-For: 203.0.113.50" -X POST "$BASE/analytics/collect" -H "Content-Type: application/json" -d '{"sid":"t134-blocked-01","events":[]}')
[ "$CODE" = "403" ] && ok "заблокированный IP → collect 403" || bad "blocked: $CODE"
curl -s -o /dev/null -b "$CJ" -X POST "$BASE/admin/analytics/unblock" -H "Content-Type: application/json" -d "{\"ip_hash\":\"$BH\"}"

# ── уборка ──
WIPE=$(curl -s -b "$CJ" -X POST "$BASE/admin/analytics/wipe")
echo "$WIPE" | grep -q '"ok":true' && ok "wipe: аналитика очищена" || bad "wipe: $WIPE"
$PHP -r '
require $argv[1]."/backend/config.php"; require $argv[1]."/backend/src/Database.php";
$pdo = Database::get();
$pdo->exec("DELETE FROM rate_limits"); $pdo->exec("DELETE FROM ip_blocks");
echo "clean";
' "$ROOT" > /dev/null 2>&1 && ok "уборка: счётчики и блок-лист удалены" || bad "уборка не удалась"

echo
echo "═══ Итог: PASS=$PASS FAIL=$FAIL ═══"
[ "$FAIL" = "0" ]
