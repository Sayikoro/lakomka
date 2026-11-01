#!/bin/bash
# Task 118 E2E: самовосстановление системных файлов витрины (снежинка херо-блока).
#   Стенд: .deploy-package :8090 = эмуляция прода.
#   A) имитируем поломку прода: удаляем snowflake/, brand/, ico-step*.svg, process-bg.png
#   B) браузер: снегопад рисуется, НО не делает запроса к /uploads/snowflake (снежинка вшита)
#   C) применяем НАСТОЯЩИЙ update-архив через API (chunk upload → site-update/apply):
#      ответ содержит system_restored, файлы вернулись на диск, HTTP 200
#   D) браузер после лечения: логотип и иконки шагов загружены, снегопад на месте
#   E) сканер unused на стенде не считает системные файлы мусором
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PHP="$(command -v php 2>/dev/null || true)"
[ -z "$PHP" ] && [ -x "$ROOT/../.ztools/php" ] && PHP="$(readlink -f "$ROOT/../.ztools/php")"
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); echo "  OK  $1"; }
bad(){ FAIL=$((FAIL+1)); echo "  FAIL $1"; }

UPDATE_ZIP="$ROOT/download/lakomka-update-$(ls "$ROOT/download" | grep -o 'lakomka-update-.*\.zip' | sort | tail -1 | sed 's/lakomka-update-//')"
[ -f "$UPDATE_ZIP" ] || { echo "update-архив не найден"; exit 1; }
echo "  (архив: $(basename "$UPDATE_ZIP"))"

PORT=8090; BASE="http://127.0.0.1:$PORT"
PKG="$ROOT/.deploy-package"
export PHP_CLI_SERVER_WORKERS=8
pkill -f "127.0.0.1:$PORT" 2>/dev/null; sleep 1
( cd "$PKG" && setsid "$PHP" -S 127.0.0.1:$PORT "$ROOT/scripts/deploy/dev-router.php" >/tmp/t118-e2e-php.log 2>&1 & )
for i in $(seq 1 30); do curl -s "$BASE/api/health" | grep -q ok && break; sleep 0.3; done
curl -s "$BASE/api/health" | grep -q ok && ok "стенд :$PORT поднялся" || { bad "стенд не поднялся"; exit 1; }

DB="$PKG/backend/storage/database.sqlite"
python3 -c "
import sqlite3
c = sqlite3.connect('$DB')
c.execute(\"INSERT INTO settings (key,value) VALUES ('snow_enabled','1') ON CONFLICT(key) DO UPDATE SET value='1'\")
c.commit(); print('snow_enabled=1')"
curl -s "$BASE/api/settings/public" | grep -q '"snow":{"enabled":true' && ok "снегопад включён на стенде" || bad "снег не включился"

echo "── A. Поломка: системные файлы удалены (как на проде) ──"
rm -rf "$PKG/uploads/snowflake" "$PKG/uploads/brand"
rm -f "$PKG/uploads/ico-step1.svg" "$PKG/uploads/ico-step2.svg" "$PKG/uploads/ico-step3.svg" "$PKG/uploads/process-bg.png"
[ ! -f "$PKG/uploads/snowflake/snowflake.svg" ] && [ ! -f "$PKG/uploads/brand/logo-lakomka.webp" ] && [ ! -f "$PKG/uploads/process-bg.png" ] && ok "uploads стенда обезображены (6 файлов нет)" || bad "не всё удалено"
curl -s -o /dev/null -w '' "$BASE/uploads/snowflake/snowflake.svg"
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/uploads/snowflake/snowflake.svg")
[ "$CODE" = "404" ] && ok "снежинка на стенде 404 (воспроизвели прод)" || bad "ожидалась 404: $CODE"

echo "── B. Браузер: снегопад жив БЕЗ файла снежинки ──"
AB="agent-browser"
$AB close 2>/dev/null >/dev/null
E(){ $AB eval "$1" 2>/dev/null | tr -d '"'; }
$AB set viewport 1440 900 >/dev/null 2>&1
$AB open "$BASE/" >/dev/null 2>&1
sleep 6
CV=$(E "(function(){var c=document.querySelector('canvas.pf-canvas');if(!c)return 'NO';return c.width>0&&c.height>0?'YES':'SIZE'})()")
[ "$CV" = "YES" ] && ok "canvas снегопада есть и имеет размер" || bad "canvas: $CV"
PX=$(E "(function(){var c=document.querySelector('canvas.pf-canvas');if(!c)return '-1';try{var x=c.getContext('2d').getImageData(0,0,c.width,Math.min(c.height,600)).data,n=0;for(var i=3;i<x.length;i+=4)if(x[i]>0)n++;return String(n)}catch(e){return 'ERR'}})()")
[ "$PX" != "-1" ] && [ "$PX" != "ERR" ] && [ "$PX" != "0" ] && ok "на canvas нарисованы снежинки (непрозрачных пикселей: $PX)" || bad "canvas пуст: $PX"
REQ=$(E "performance.getEntriesByType('resource').filter(function(r){return r.name.indexOf('/uploads/snowflake')>=0}).length")
[ "$REQ" = "0" ] && ok "запросов к /uploads/snowflake нет (снежинка вшита в код)" || bad "снежинка тянется по сети: $REQ"

echo "── C. Применяем настоящий update-архив через API ──"
APPLY_OUT=/tmp/t118-apply.txt
python3 - "$BASE" "$UPDATE_ZIP" > "$APPLY_OUT" <<'PY'
import json, base64, sys, urllib.request, http.cookiejar
BASE, ZIP = sys.argv[1], sys.argv[2]
cj = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
def post(path, data):
    req = urllib.request.Request(BASE + path, data=json.dumps(data).encode(),
                                 headers={'Content-Type': 'application/json'})
    return json.loads(op.open(req).read())
r = post('/api/auth/login', {'email': 'admin@lakomka.local', 'password': 'Lakomka2026!'})
assert r.get('data', {}).get('token'), 'login failed'
raw = open(ZIP, 'rb').read()
CH = 512 * 1024
total = (len(raw) + CH - 1) // CH
uid = 'task118e2eup2'
last = None
for i in range(total):
    part = base64.b64encode(raw[i*CH:(i+1)*CH]).decode()
    last = post('/api/admin/upload/chunk',
                {'upload_id': uid, 'chunk_index': i, 'total_chunks': total,
                 'filename': 'update.zip', 'chunk_base64': part})
    assert last.get('data'), f'chunk {i}: {last}'
res = post('/api/admin/site-update/apply', {'file_name': last['data']['file_name']})
d = res.get('data', {})
print('OK=' + ('1' if d.get('ok') else '0'))
print('RESTORED=' + '|'.join(d.get('system_restored', [])))
print('FILES=' + str(d.get('files', 0)))
PY
grep -q "^OK=1" "$APPLY_OUT" && ok "update-архив применён к стенду" || { bad "apply не прошёл: $(cat "$APPLY_OUT")"; echo "── ИТОГ: PASS=$PASS FAIL=$FAIL ──"; exit 1; }
RESTORED=$(grep '^RESTORED=' "$APPLY_OUT" | cut -d= -f2-)
N=0
for f in "uploads/snowflake/snowflake.svg" "uploads/brand/logo-lakomka.webp" "uploads/ico-step1.svg" "uploads/ico-step2.svg" "uploads/ico-step3.svg" "uploads/process-bg.png"; do
  echo "$RESTORED" | grep -q "$f" && N=$((N+1))
done
[ "$N" = "6" ] && ok "system_restored содержит все 6 системных файлов" || bad "в system_restored только $N из 6: $RESTORED"
[ -f "$PKG/uploads/snowflake/snowflake.svg" ] && [ -f "$PKG/uploads/brand/logo-lakomka.webp" ] && [ -f "$PKG/uploads/ico-step3.svg" ] && [ -f "$PKG/uploads/process-bg.png" ] && ok "файлы вернулись на диск" || bad "файлов на диске нет"
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/uploads/snowflake/snowflake.svg")
[ "$CODE" = "200" ] && ok "GET /uploads/snowflake/snowflake.svg → 200" || bad "снежинка: $CODE"

echo "── D. Браузер после лечения ──"
$AB open "$BASE/" >/dev/null 2>&1
sleep 6
IMG=$(E "(function(){var bad=0,imgs=document.querySelectorAll('img');for(var i=0;i<imgs.length;i++){if(imgs[i].src.indexOf('ico-step')>=0||imgs[i].src.indexOf('process-bg')>=0||imgs[i].src.indexOf('logo-lakomka')>=0){if(!(imgs[i].naturalWidth>0))bad++}}return bad>0?'BROKEN:'+bad:'ALL_OK'})()")
[ "$IMG" = "ALL_OK" ] && ok "логотип/иконки шагов/фон загружены (naturalWidth>0)" || bad "битые картинки: $IMG"
CV2=$(E "(function(){var c=document.querySelector('canvas.pf-canvas');return c&&c.width>0?'YES':'NO'})()")
[ "$CV2" = "YES" ] && ok "снегопад на месте после обновления" || bad "снегопад пропал: $CV2"
REQ2=$(E "performance.getEntriesByType('resource').filter(function(r){return r.name.indexOf('/uploads/snowflake')>=0}).length")
[ "$REQ2" = "0" ] && ok "снежинка по-прежнему без сети" || bad "появился сетевой запрос снежинки: $REQ2"

echo "── E. Сканер unused на стенде ──"
CJ=/tmp/t118-e2e-cookies.txt
LOGIN=$(curl -s -c "$CJ" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d '{"email":"admin@lakomka.local","password":"Lakomka2026!"}')
U=$(curl -s -b "$CJ" "$BASE/api/admin/files/unused")
echo "$U" | grep -q '"snowflake/snowflake.svg"' && bad "стенд: снежинка в unused!" || ok "стенд: снежинка не считается мусором"
echo "$U" | grep -q '"process-bg.png"' && bad "стенд: process-bg в unused!" || ok "стенд: process-bg не считается мусором"

pkill -f "127.0.0.1:$PORT" 2>/dev/null
echo "── ИТОГ: PASS=$PASS FAIL=$FAIL ──"
[ "$FAIL" = "0" ]
