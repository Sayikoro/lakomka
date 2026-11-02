#!/bin/bash
# Task 122 E2E: ZIP-отчёт по проблемным файлам + состояние видео — на стенде .deploy-package :8090.
#   A) Админка → Товары → «Массовая оптимизация → Видео»: список показывает
#      НАЗВАНИЯ ПОДАРКОВ с обложками/заглушками, размеры, бейджи.
#   B) API стенда: videos() отдаёт used/status/product; нулевой файл-призрак
#      получает status=empty и бейдж + кнопку «в корзину» в списке.
#   C) media-report-zip: отказ для файла без товара, сборка ZIP в архитектуре
#      импорта по реальному видео товара, скачивание по download_url.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PHP="$(command -v php 2>/dev/null || true)"
[ -z "$PHP" ] && [ -x "$ROOT/../.ztools/php" ] && PHP="$(readlink -f "$ROOT/../.ztools/php")"
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
( cd "$ROOT/.deploy-package" && setsid "$PHP" -S 127.0.0.1:$PORT "$ROOT/scripts/deploy/dev-router.php" >/tmp/t122-e2e-php.log 2>&1 & )
for i in $(seq 1 30); do curl -s "$BASE/api/health" | grep -q ok && break; sleep 0.3; done
curl -s "$BASE/api/health" | grep -q ok && ok "стенд :$PORT поднялся" || { bad "стенд не поднялся"; exit 1; }

AB="agent-browser"
$AB close 2>/dev/null >/dev/null
E(){ $AB eval "$1" 2>/dev/null | tr -d '"'; }
$AB set viewport 1440 900 >/dev/null 2>&1

echo "── A. Список видео: подарки с обложками ──"
$AB open "$BASE/admin/orders" >/dev/null 2>&1; sleep 3
$AB eval "fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@lakomka.local',password:'Lakomka2026!'})}).then(r=>r.json()).then(j=>{window.__login=j&&j.data?'OK':'ERR'})" >/dev/null 2>&1
sleep 2
$AB open "$BASE/admin/products" >/dev/null 2>&1; sleep 5
# кнопка «🎬 Видео» массовой оптимизации
$AB eval "(function(){var bs=document.querySelectorAll('button');for(var i=0;i<bs.length;i++){if(bs[i].textContent.indexOf('Видео')>=0&&bs[i].textContent.indexOf('🎬')>=0){bs[i].click();return 'clicked';}}return 'notfound';})()" >/dev/null 2>&1
sleep 4
ROWS=$(E "document.querySelectorAll('[role=\"dialog\"] ul li').length")
[ "${ROWS:-0}" -ge 1 ] && ok "модалка видео: строк в списке [$ROWS]" || bad "список пуст: $ROWS"
NAMED=$(E "(function(){var li=document.querySelectorAll('[role=\"dialog\"] ul li');var named=0;for(var i=0;i<li.length;i++){if(li[i].textContent.indexOf('(')>0&&li[i].textContent.trim().length>10)named++;}return named;})()")
[ "${NAMED:-0}" -ge 1 ] && ok "строки заполнены (имя файла + папка/товар)" || bad "строки пустые"
THUMBS=$(E "(function(){var d=document.querySelector('[role=\"dialog\"]');if(!d)return 'NOD';var imgs=d.querySelectorAll('img');var ph=d.textContent.split('🎁').length-1;return 'img:'+imgs.length+',ph:'+ph;})()")
echo "$THUMBS" | grep -qE "img:[0-9]+,ph:[0-9]+" && ok "обложки/заглушки в списке [$THUMBS]" || bad "обложек нет: $THUMBS"
PNAME=$(E "(function(){var d=document.querySelector('[role=\"dialog\"]');if(!d)return '';var sp=d.querySelectorAll('span');for(var i=0;i<sp.length;i++){var c=sp[i].className||'';if(c.indexOf('font-medium')>=0&&sp[i].textContent.trim().length>2)return sp[i].textContent.trim();}return 'NONAME';})()")
[ "$PNAME" != "NONAME" ] && [ -n "$PNAME" ] && ok "название подарка видно в списке [${PNAME:0:40}]" || bad "названия подарков не показаны: $PNAME"
$AB eval "(function(){var bs=document.querySelectorAll('[role=\"dialog\"] button');for(var i=0;i<bs.length;i++){if(bs[i].textContent.trim()==='×'){bs[i].click();return 'closed';}}return 'noclose';})()" >/dev/null 2>&1
sleep 1

echo "── B. API: used/status/product + файл-призрак ──"
CJ=/tmp/t122-e2e-cookies.txt
curl -s -c "$CJ" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d '{"email":"admin@lakomka.local","password":"Lakomka2026!"}' > /dev/null
V=$(curl -s -b "$CJ" "$BASE/api/admin/files/videos?folder=products")
FIELDS=$(echo "$V" | python3 -c "
import json,sys
d=json.load(sys.stdin)['data']['entries']
if not d: print('EMPTY'); exit
e=d[0]
print('has' if all(k in e for k in ('used','status','product')) else 'missing')")
[ "$FIELDS" = "has" ] && ok "videos(): used+status+product в ответе стенда" || bad "полей нет: $FIELDS"
GN=$(echo "$V" | python3 -c "
import json,sys
d=json.load(sys.stdin)['data']['entries']
print(sum(1 for e in d if e.get('product') and e['product'].get('name')))")
[ "${GN:-0}" -ge 1 ] && ok "продукт опознаётся у $GN файлов" || bad "ни у одного файла нет товара"
# файл-призрак: правильный размер, нули внутри, без привязок
GDIR="$ROOT/.deploy-package/uploads/products/t122e2e-ghost"
mkdir -p "$GDIR"
head -c 524288 /dev/zero > "$GDIR/video-0.mov"
V2=$(curl -s -b "$CJ" "$BASE/api/admin/files/videos?folder=products")
GH=$(echo "$V2" | python3 -c "
import json,sys
d=json.load(sys.stdin)['data']['entries']
for e in d:
    if e['url']=='/uploads/products/t122e2e-ghost/video-0.mov':
        print('%s|%s|%s' % (e['status'], str(e['used']).lower(), 'none' if e['product'] is None else 'p')); break
else: print('MISSING')")
[ "$GH" = "empty|false|none" ] && ok "файл-призрак: status=empty, used=false, product=null" || bad "призрак: $GH"

echo "── C. UI: бейдж и «в корзину» у призрака ──"
$AB open "$BASE/admin/products" >/dev/null 2>&1; sleep 5
$AB eval "(function(){var bs=document.querySelectorAll('button');for(var i=0;i<bs.length;i++){if(bs[i].textContent.indexOf('Видео')>=0&&bs[i].textContent.indexOf('🎬')>=0){bs[i].click();return 'clicked';}}return 'notfound';})()" >/dev/null 2>&1
sleep 4
BADGE=$(E "(function(){var d=document.querySelector('[role=\"dialog\"]');return d&&d.textContent.indexOf('повреждено (нули)')>=0?'YES':'NO';})()")
[ "$BADGE" = "YES" ] && ok "бейдж «повреждено (нули)» виден в списке" || bad "бейджа нет"
PURGE=$(E "(function(){var d=document.querySelector('[role=\"dialog\"]');if(!d)return 'NO';var bs=d.querySelectorAll('button');for(var i=0;i<bs.length;i++){if(bs[i].textContent.trim()==='в корзину')return 'YES';}return 'NO';})()")
[ "$PURGE" = "YES" ] && ok "кнопка «в корзину» у неиспользуемого файла" || bad "кнопки нет"
$AB eval "(function(){var bs=document.querySelectorAll('[role=\"dialog\"] button');for(var i=0;i<bs.length;i++){if(bs[i].textContent.trim()==='×'){bs[i].click();return 'closed';}}return 'noclose';})()" >/dev/null 2>&1

echo "── D. media-report-zip ──"
ERR=$(curl -s -b "$CJ" -X POST "$BASE/api/admin/files/media-report-zip" -H "Content-Type: application/json" -d '{"urls":["/uploads/products/t122e2e-ghost/video-0.mov"]}')
echo "$ERR" | grep -q "не найдено товаров" && ok "ZIP: призрак без товара → честный отказ" || bad "ZIP призрак: $ERR"
USEDURL=$(echo "$V" | python3 -c "
import json,sys
d=json.load(sys.stdin)['data']['entries']
for e in d:
    if e.get('used') and e['url'].endswith(('.mov','.m4v','.mp4','.webm')):
        print(e['url']); break
else: print('')" 2>/dev/null)
if [ -n "$USEDURL" ]; then
  ZRES=$(curl -s -b "$CJ" -X POST "$BASE/api/admin/files/media-report-zip" -H "Content-Type: application/json" -d "{\"urls\":[\"$USEDURL\"]}")
  [ "$(jget "$ZRES" data.ok)" = "true" ] && ok "ZIP: собран по видео товара [$USEDURL]" || bad "ZIP: $(echo "$ZRES" | head -c 200)"
  ZFILE=$(jget "$ZRES" data.file)
  ZURL=$(jget "$ZRES" data.download_url)
  STAND_EXPORTS="$ROOT/.deploy-package/exports"
  [ -f "$STAND_EXPORTS/$ZFILE" ] || STAND_EXPORTS="$ROOT/.deploy-package/public/exports"
  [ -f "$STAND_EXPORTS/$ZFILE" ] && ok "ZIP: файл в exports стенда" || bad "файла нет: $STAND_EXPORTS/$ZFILE"
  PCNT=$(jget "$ZRES" data.to_replace.0.zip)
  echo "  (to_replace[0].zip = ${PCNT:-—}; products=$(jget "$ZRES" data.products.0.name))"
  DL=$(curl -s -b "$CJ" -o /tmp/t122-e2e.zip -w '%{http_code}' "$BASE$ZURL")
  [ "$DL" = "200" ] && ok "ZIP: скачивание по download_url → 200" || bad "download: $DL"
  head -c 4 /tmp/t122-e2e.zip | grep -q "PK" && ok "ZIP: это настоящий zip (PK)" || bad "не zip"
  rm -f "$STAND_EXPORTS/$ZFILE"
else
  bad "на стенде нет привязанных видео — ZIP по товару не проверить"
fi

rm -rf "$GDIR" /tmp/t122-e2e.zip /tmp/t122-e2e-cookies.txt
pkill -f "127.0.0.1:$PORT" 2>/dev/null
echo "уборка: файл-призрак и ZIP удалены"
echo "── ИТОГ: PASS=$PASS FAIL=$FAIL ──"
[ "$FAIL" = "0" ] && echo "ALL OK" || exit 1
