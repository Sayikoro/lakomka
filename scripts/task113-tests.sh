#!/bin/bash
# Task 113: медиа-синк через канал обновления + сторож навигации.
#   1) php -l, tsc, чанк сборки содержит location.assign (сторож)
#   2) MODE=media build: архив только uploads/** + манифест media_sync
#   3) staging-стенд apply: media-архив досыпает uploads/**, журнал
#      last-media-sync.json, version.json не тронут; чужие пути → отказ;
#      ОБЫЧНЫЙ апдейт по-прежнему пропускает медиа (регресс)
#   4) E2E сторожа: пейлоад товара отдаёт мусор → навигация «залипает» →
#      через ~8с жёсткий переход доводит пользователя до страницы товара
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PHP="$(command -v php 2>/dev/null || true)"
[ -z "$PHP" ] && [ -x "$ROOT/.ztools/php" ] && PHP="$ROOT/.ztools/php"
[ -z "$PHP" ] && [ -x "$ROOT/../.ztools/php" ] && PHP="$ROOT/../.ztools/php"
[ -n "$PHP" ] || { echo "php не найден"; exit 1; }
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  OK  $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  FAIL $1"; }
chk()  { if [ "$2" = "1" ]; then ok "$1"; else bad "$1"; fi; }
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

echo "── 1. Синтаксис, типы, сторож в сборке ──"
$PHP -l "$ROOT/backend/src/Controllers/AdminSiteUpdateController.php" > /dev/null 2>&1 && ok "php -l AdminSiteUpdateController" || bad "php -l AdminSiteUpdateController"
rg -q "location\.assign" "$ROOT/src/components/ui/RoutePreloader.tsx" && ok "сторож (location.assign) в исходнике прелоадера" || bad "сторожа нет в исходнике"
if [ -d "$ROOT/.deploy-package/_next/static/chunks" ]; then
  rg -lq "location\.assign" "$ROOT/.deploy-package/_next/static/chunks/" 2>/dev/null \
    && ok "в собранном пакете есть location.assign (сторож собран)" \
    || bad "в собранных чанках нет сторожа (пакет старый?)"
else
  bad "нет .deploy-package/_next/static/chunks — сначала MODE=both build"
fi

echo "── 2. MODE=media: архив только uploads/** + манифест ──"
MEDIA_ZIP=$(ls -1 "$ROOT/download"/lakomka-media-*.zip 2>/dev/null | tail -1)
if [ -n "$MEDIA_ZIP" ] && [ -s "$MEDIA_ZIP" ]; then
  ok "медиа-архив собран: $(basename "$MEDIA_ZIP") ($(du -h "$MEDIA_ZIP" | cut -f1))"
  python3 - "$MEDIA_ZIP" > /tmp/t113-media-zip.txt 2>&1 <<'PY'
import json, sys, zipfile
z = zipfile.ZipFile(sys.argv[1])
names = [n for n in z.namelist() if not n.endswith('/')]
manifest = None
media = []
bad_paths = []
for n in names:
    if n == 'update-manifest.json':
        manifest = json.loads(z.read(n)); continue
    (media if n.startswith('uploads/') else bad_paths).append(n)
ver = ''
try:
    ver = json.loads(z.read('update-manifest.json'))['version'] if manifest else ''
except Exception:
    pass
print(f"MANIFEST_SYNC={'yes' if manifest and manifest.get('media_sync') else 'no'}")
print(f"MEDIA_FILES={len(media)}")
print(f"BAD_PATHS={len(bad_paths)}")
print(f"VERSION={ver}")
PY
  [ "$(jget "$(cat /tmp/t113-media-zip.txt | tr '\n' '|')" "MANIFEST_SYNC")" = "" ] && true
  MS=$(grep -o "MANIFEST_SYNC=[a-z]*" /tmp/t113-media-zip.txt | cut -d= -f2)
  MF=$(grep -o "MEDIA_FILES=[0-9]*" /tmp/t113-media-zip.txt | cut -d= -f2)
  BP=$(grep -o "BAD_PATHS=[0-9]*" /tmp/t113-media-zip.txt | cut -d= -f2)
  MVER=$(grep -o "VERSION=.*" /tmp/t113-media-zip.txt | cut -d= -f2)
  [ "$MS" = "yes" ] && ok "манифест media_sync:true" || bad "манифест без media_sync"
  LOCAL_UPLOADS=$(cd "$ROOT/.deploy-package" && find uploads -type f | wc -l)
  [ "$MF" = "$LOCAL_UPLOADS" ] && ok "все медиа в архиве: $MF файлов (= пакету)" || bad "файлов в архиве $MF, в пакете $LOCAL_UPLOADS"
  [ "$BP" = "0" ] && ok "посторонних путей нет (только uploads/)" || bad "посторонние пути в медиа-архиве: $BP"
  PKG_VER=$(sed -n 's/.*"version":"\([^"]*\)".*/\1/p' "$ROOT/.deploy-package/backend/version.json" | head -1)
  [ "$MVER" = "$PKG_VER" ] && ok "версия архива = версии пакета ($PKG_VER)" || bad "версия архива $MVER ≠ пакета $PKG_VER"
else
  bad "медиа-архив не найден в download/ (запусти MODE=media build)"
fi

echo "── 3. Медиа-синк через API (staging-стенд) ──"
PORT=8023; BASE="http://127.0.0.1:$PORT/api"; LOG=/tmp/t113-php.log
CJ=/tmp/t113-cookies.txt
pkill -f "127.0.0.1:$PORT" 2>/dev/null; sleep 1
( setsid "$PHP" -S 127.0.0.1:$PORT backend/public/index.php >"$LOG" 2>&1 & )
for i in $(seq 1 30); do curl -s "$BASE/health" | grep -q ok && break; sleep 0.3; done
curl -s "$BASE/health" | grep -q ok && ok "сервер :$PORT поднялся" || bad "сервер не поднялся"

STAGE=/tmp/t113-stage; rm -rf "$STAGE"; mkdir -p "$STAGE/backend/storage"
echo "<html>staging-113</html>" > "$STAGE/index.html"
cp "$ROOT/scripts/deploy/.htaccess" "$STAGE/.htaccess"
echo "$STAGE" > "$ROOT/backend/UPDATE_ROOT"

LOGIN=$(curl -s -c "$CJ" -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d '{"email":"admin@lakomka.local","password":"Lakomka2026!"}')
[ -n "$(jget "$LOGIN" "data.token")" ] && ok "суперадмин залогинен" || bad "логин: $LOGIN"

mkzips() {
python3 - "$ROOT" <<'PY'
import json, sys, zipfile, os
root = sys.argv[1]
t = '/tmp/t113'
os.makedirs(t, exist_ok=True)
# 1) корректный медиа-архив
with zipfile.ZipFile(f'{t}/media-ok.zip', 'w') as z:
    z.writestr('update-manifest.json', json.dumps({"type":"media","media_sync":True,"version":"test-113","built_at":"2026-11-01T00:00:00Z"}))
    z.writestr('uploads/products/e2e-113/0.webp', b'RIFF\x24\x00\x00\x00WEBPVP8 fake-e2e-113')
    z.writestr('uploads/products/e2e-113/1.webp', b'RIFF\x24\x00\x00\x00WEBPVP8 fake-e2e-113-1')
# 2) вредоносный «медиа»-архив с кодом сайта
with zipfile.ZipFile(f'{t}/media-bad.zip', 'w') as z:
    z.writestr('update-manifest.json', json.dumps({"type":"media","media_sync":True,"version":"evil"}))
    z.writestr('uploads/ok.bin', b'x')
    z.writestr('backend/version.json', json.dumps({"version":"evil"}))
    z.writestr('index.html', '<html>evil</html>')
# 3) обычный апдейт, внутри есть медиа (должно быть пропущено)
with zipfile.ZipFile(f'{t}/site-media.zip', 'w') as z:
    z.writestr('update-manifest.json', json.dumps({"type":"update","version":"test-113s"}))
    z.writestr('index.html', '<html>staging-113-site</html>')
    z.writestr('backend/public/index.php', "<?php echo 'x';")
    z.writestr('uploads/skipme.bin', b'skip')
PY
}
mkzips

upzip() { # $1 zip, → file_name
  B64=$(base64 -w0 "$1")
  BODY=$(B64="$B64" python3 -c 'import json,os,random; print(json.dumps({"upload_id":"t113-%d" % random.randint(100000000,999999999),"chunk_index":0,"total_chunks":1,"filename":"t113.zip","chunk_base64":os.environ["B64"]}))')
  RES=$(curl -s -b "$CJ" -X POST "$BASE/admin/upload/chunk" -H "Content-Type: application/json" -d "$BODY")
  jget "$RES" "data.file_name"
}

UP=$(upzip /tmp/t113/media-ok.zip)
[ -n "$UP" ] && ok "медиа-архив загружен чанком" || bad "загрузка медиа-архива: $UP"
APPLY=$(curl -s -b "$CJ" -X POST "$BASE/admin/site-update/apply" -H "Content-Type: application/json" -d "{\"file_name\":\"$UP\"}")
[ "$(jget "$APPLY" "data.ok")" = "true" ] && ok "apply ok=true" || bad "apply медиа: $APPLY"
[ "$(jget "$APPLY" "data.media_sync")" = "true" ] && ok "ответ помечен media_sync=true" || bad "media_sync не в ответе: $APPLY"
[ "$(jget "$APPLY" "data.files")" = "2" ] && ok "дослано файлов: 2" || bad "files: $APPLY"
[ -f "$STAGE/uploads/products/e2e-113/0.webp" ] && ok "uploads/products/e2e-113/0.webp появился на стенде" || bad "файл не долетел"
[ -f "$STAGE/uploads/products/e2e-113/1.webp" ] && ok "uploads/products/e2e-113/1.webp появился на стенде" || bad "второй файл не долетел"
[ -f "$STAGE/backend/storage/last-media-sync.json" ] && ok "журнал last-media-sync.json записан" || bad "журнала медиа нет"
jget "$(cat "$STAGE/backend/storage/last-media-sync.json" 2>/dev/null)" "kind" | grep -q "^media$" && ok "в журнале kind=media, version=$(jget "$(cat "$STAGE/backend/storage/last-media-sync.json")" "version")" || bad "kind не media"
[ ! -f "$STAGE/backend/storage/last-update.json" ] && ok "last-update.json НЕ тронут" || bad "last-update.json записан (не должен)"
STATUS=$(curl -s -b "$CJ" "$BASE/admin/site-update")
[ "$(jget "$STATUS" "data.last_media_sync.version")" = "test-113" ] && ok "status отдаёт last_media_sync.version" || bad "status без last_media_sync: $STATUS"

UP2=$(upzip /tmp/t113/media-bad.zip)
BADRES=$(curl -s -b "$CJ" -X POST "$BASE/admin/site-update/apply" -H "Content-Type: application/json" -d "{\"file_name\":\"$UP2\"}")
if echo "$BADRES" | grep -q "может содержать только файлы внутри uploads/" && [ ! -f "$STAGE/backend/version.json" ] && grep -q "staging-113" "$STAGE/index.html"; then
  ok "вредоносный «медиа»-архив отклонён: $(echo "$BADRES" | head -c 80)…"
else
  bad "вредоносный архив: $BADRES"
fi

UP3=$(upzip /tmp/t113/site-media.zip)
APPLY3=$(curl -s -b "$CJ" -X POST "$BASE/admin/site-update/apply" -H "Content-Type: application/json" -d "{\"file_name\":\"$UP3\"}")
[ "$(jget "$APPLY3" "data.ok")" = "true" ] && ok "обычный апдейт применился" || bad "обычный апдейт: $APPLY3"
SK=$(jget "$APPLY3" "data.skipped_media")
[ "$SK" = "1" ] && ok "медиа в обычном апдейте пропущено (skipped_media=1) — регресс цел" || bad "skipped_media: $APPLY3"
[ ! -f "$STAGE/uploads/skipme.bin" ] && ok "uploads/skipme.bin НЕ записан" || bad "медиа записалось в обычном режиме!"
grep -q "staging-113-site" "$STAGE/index.html" && ok "index.html обновился" || bad "index.html не обновился"
MSYNC=$(jget "$APPLY3" "data.media_sync")
[ "$MSYNC" = "false" ] && ok "обычный апдейт помечен media_sync=false" || bad "media_sync обычного: $APPLY3"

echo "── 4. E2E: страница ослепла после открытия → авто-ремонт перезагрузкой ──"
pkill -f "127.0.0.1:8090" 2>/dev/null; sleep 1
# 8 воркеров (как на Apache прода): однопроцессный php -S ставит фетч пейлоада
# в очередь за сотней запросов каталога — рендер «висит» десятки секунд
( cd "$ROOT/.deploy-package" && setsid env PHP_CLI_SERVER_WORKERS=8 "$PHP" -S 127.0.0.1:8090 "$ROOT/scripts/deploy/dev-router.php" >/tmp/t113-8090.log 2>&1 & )
for i in $(seq 1 30); do curl -s -o /dev/null "http://127.0.0.1:8090/" && break; sleep 0.3; done
agent-browser open "http://127.0.0.1:8090/catalog/" --timeout 60000 >/dev/null 2>&1
sleep 2.5
agent-browser eval "try{sessionStorage.clear()}catch(e){}; 'cleared'" >/dev/null 2>&1
# Сценарий «страница ослепла» (крайний случай сбоя рендера сегмента): товар
# открылся, затем контент исчез (эквивалент упавшего рендера при живом root).
# Авто-ремонт обязан на двухступенчатой проверке (2.5с+2с) заметить пустоту,
# очистить сегмент-кэш и перезагрузиться → страница возвращается.
# ПРОГРЕВ: сначала открываем товар и возвращаемся — чтобы клик в замеряемом
# проходе рендерился мгновенно из кэша (детерминированный тайминг ослепления).
agent-browser eval "var a=document.querySelector('a[href*=\"shestigrannik-5152\"]'); a ? (a.click(),'warm') : 'NO-LINK'" >/dev/null 2>&1
WARM=""; for i in $(seq 1 40); do
  H=$(agent-browser eval "document.querySelector('h1') ? 'YES' : 'NO'" 2>/dev/null | tr -d '"')
  [ "$H" = "YES" ] && WARM=1 && break
  sleep 0.5
done
[ -n "$WARM" ] && ok "прогрев: товар открылся" || bad "прогрев не удался"
agent-browser back >/dev/null 2>&1
sleep 2
# флаг ремонта здесь чист (очистка была до прогрева, здоровые страницы его не ставят)
T0=$(date +%s%N)
agent-browser eval "var a=document.querySelector('a[href*=\"shestigrannik-5152\"]'); a ? (a.click(),'target-found') : 'NO-LINK'" > /tmp/t113-click.txt 2>&1
grep -q "target-found" /tmp/t113-click.txt && ok "клик по товару выполнен" || bad "ссылка не найдена: $(cat /tmp/t113-click.txt)"
# ждём коммит рендера (root жив, H1 на месте) — окно маленькое: вайп должен
# попасть ДО финальной проверки ремонта (+4.5с от смены адреса)
RENDERED=""; for i in $(seq 1 10); do
  H=$(agent-browser eval "document.querySelector('h1') ? 'YES' : 'NO'" 2>/dev/null | tr -d '"')
  [ "$H" = "YES" ] && RENDERED=$(( ($(date +%s%N)-T0)/1000000000 )) && break
  sleep 0.1
done
[ -n "$RENDERED" ] && ok "товар отрисовался за ${RENDERED}с (root жив)" || bad "рендер не дождались (${RENDERED:-нет})"
# ослепляем: контент исчез, root жив — как при сбое рендера сегмента
agent-browser eval "document.querySelector('main').innerHTML=''; 'wiped'" >/dev/null 2>&1
W=$(agent-browser eval "(document.querySelector('main')?.textContent||'').trim().length" 2>/dev/null)
[ "$W" = "0" ] && ok "контент исчез (страница ослепла)" || bad "main не очищен: $W"
# ремонт (+2.5с, повтор +2с) → перезагрузка → здоровая страница
H1=""; for i in $(seq 1 60); do
  H=$(agent-browser eval "document.querySelector('h1') ? 'YES' : 'NO'" 2>/dev/null | tr -d '"')
  if [ "$H" = "YES" ]; then H1=$(( ($(date +%s%N)-T0)/1000000000 )); break; fi
  sleep 0.5
done
NAVTYPE=$(agent-browser eval "performance.getEntriesByType('navigation')[0]?.type ?? 'none'" 2>/dev/null)
FLAG=$(agent-browser eval "sessionStorage.getItem('lakomka-blank-repair') ?? 'none'" 2>/dev/null)
if [ -n "$H1" ] && echo "$NAVTYPE" | grep -q "reload" && echo "$FLAG" | grep -q "shestigrannik"; then
  ok "авто-ремонт вернул страницу за ${H1}с после клика (navigation=reload, флаг выставлен)"
else
  bad "авто-ремонт не подтвердился (H1=${H1:-нет}, nav=$NAVTYPE, flag=$FLAG)"
fi
# контроль: обычная навигация не задета — другой товар открывается быстро, без ремонта
T0=$(date +%s%N)
agent-browser eval "var ls=document.querySelectorAll('a[href^=\"/product/\"]'); ls[0].click(),'ok'" >/dev/null 2>&1
OKFAST=""; for i in $(seq 1 20); do U=$(agent-browser get url 2>/dev/null); H=$(agent-browser eval "document.querySelector('h1')?'YES':'NO'" 2>/dev/null | tr -d '"'); if [[ "$U" == *"/product/"* ]] && [ "$H" = "YES" ]; then OKFAST=$(( ($(date +%s%N)-T0)/1000000000 )); break; fi; sleep 0.5; done
[ -n "$OKFAST" ] && [ "$OKFAST" -le 5 ] && ok "обычная навигация не задета: товар за ${OKFAST}с" || bad "обычная навигация сломана (${OKFAST:-нет})"
agent-browser open "about:blank" >/dev/null 2>&1

echo "── уборка ──"
pkill -f "127.0.0.1:$PORT" 2>/dev/null
pkill -f "127.0.0.1:8090" 2>/dev/null
rm -f "$ROOT/backend/UPDATE_ROOT"
rm -rf "$ROOT/backend/storage/chunked-uploads/"t113-* 2>/dev/null
rm -rf /tmp/t113 /tmp/t113-stage /tmp/t113-cookies.txt /tmp/t113-body.json 2>/dev/null
[ -f "$ROOT/backend/UPDATE_ROOT" ] && bad "UPDATE_ROOT не убран" || ok "UPDATE_ROOT убран, серверы погашены"

echo "ИТОГ: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ] && echo "TASK113 TESTS OK" || echo "TASK113 TESTS FAILED"
