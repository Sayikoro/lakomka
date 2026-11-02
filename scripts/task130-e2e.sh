#!/bin/bash
# Task 130 E2E (стенд .deploy-package :8090):
#   A) Товары: пагинация без бесконечного цикла — 20 строк на странице,
#      панель «Страница 1 из N», число запросов к /api/admin/products за 5 с
#      единичное (раньше — бесконечный перезапрос из-за facets в deps);
#   B) Корзина файлов: в диалоге — счётчик позиций, кнопка «Очистить корзину»,
#      позиция показывает НАЗВАНИЕ ПОДАРКА (по папке products/<папка>);
#   C) API стенда: восстановление из корзины, скачивание с as= именем подарка,
#      trash-empty очищает всё.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PHP="$(command -v php 2>/dev/null || true)"
[ -z "$PHP" ] && [ -x "$ROOT/../.ztools/php" ] && PHP="$(readlink -f "$ROOT/../.ztools/php")"
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); echo "  OK  $1"; }
bad(){ FAIL=$((FAIL+1)); echo "  FAIL $1"; }

PORT=8090; BASE="http://127.0.0.1:$PORT"
export PHP_CLI_SERVER_WORKERS=8
pkill -f "127.0.0.1:$PORT" 2>/dev/null; sleep 1
( cd "$ROOT/.deploy-package" && setsid "$PHP" -S 127.0.0.1:$PORT "$ROOT/scripts/deploy/dev-router.php" >/tmp/t130-e2e-php.log 2>&1 & )
for i in $(seq 1 30); do curl -s "$BASE/api/health" | grep -q ok && break; sleep 0.3; done
curl -s "$BASE/api/health" | grep -q ok && ok "стенд :$PORT поднялся" || { bad "стенд не поднялся"; exit 1; }

UP="$ROOT/.deploy-package/uploads"
# ── сид: позиция корзины с orig в папке РЕАЛЬНОГО товара стенда ──
REALDIR=$(ls -d "$UP"/products/*/ 2>/dev/null | head -1)
[ -n "$REALDIR" ] || { bad "нет папок товаров на стенде"; exit 1; }
FOLDER=$(basename "$REALDIR")
SEEDID="20991231-235959-e2e130"
mkdir -p "$UP/.trash/$SEEDID"
echo "e2e" > "$UP/.trash/$SEEDID/video-9.mov"
cat > "$UP/.trash/$SEEDID/meta.json" <<EOF
{"orig":"products/$FOLDER/video-9.mov","name":"video-9.mov","is_dir":false,"moved_at":"$(date -u +%Y-%m-%dT%H:%M:%S+00:00)"}
EOF
ok "сид: позиция корзины в папке $FOLDER"

AB="agent-browser"
$AB close 2>/dev/null >/dev/null
E(){ $AB eval "$1" 2>/dev/null | tr -d '"'; }
$AB set viewport 1440 900 >/dev/null 2>&1

echo "── A. Товары: пагинация (20/стр, без цикла) ──"
$AB open "$BASE/admin/orders" >/dev/null 2>&1; sleep 3
$AB eval "fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@lakomka.local',password:'Lakomka2026!'})}).then(r=>r.json()).then(j=>{window.__login=j&&j.data?'OK':'ERR'})" >/dev/null 2>&1
sleep 2
$AB open "$BASE/admin/products" >/dev/null 2>&1; sleep 6
ROWS=$(E "(function(){var t=document.querySelector('tbody');return t?t.querySelectorAll('tr').length:0;})()")
[ "${ROWS:-0}" = "20" ] && ok "на странице ровно 20 строк [$ROWS]" || bad "строк: $ROWS (ожидали 20)"
PAG=$(E "(function(){var p=document.querySelector('[data-testid=\"pagination\"]');return p?p.textContent.slice(0,60):'NOPANEL';})()")
echo "$PAG" | grep -q "Страница 1 из" && ok "панель пагинации на месте [$PAG]" || bad "нет панели: $PAG"
sleep 5
REQS=$(E "performance.getEntriesByType('resource').filter(function(e){return e.name.indexOf('/api/admin/products')>=0;}).length")
sleep 4
REQS2=$(E "performance.getEntriesByType('resource').filter(function(e){return e.name.indexOf('/api/admin/products')>=0;}).length")
[ "${REQS:-99}" -le 6 ] && ok "запросов к /api/admin/products за ~11 с: [$REQS] (первые подстройки фасетов)" || bad "слишком много запросов: $REQS"
[ "${REQS2:-99}" = "${REQS:-98}" ] && ok "за следующие 4 с ни одного нового запроса [$REQS2] — цикла нет" || bad "запросы продолжаются: $REQS → $REQS2"
IND=$(E "(function(){var s=document.body.textContent;return s.indexOf('обновляем…')>=0?'FLICKER':'stable';})()")
[ "$IND" = "stable" ] && ok "индикатор «обновляем…» не мигает постоянно" || bad "список всё ещё крутится"

echo "── B. Корзина файлов: подарки и «Очистить корзину» ──"
$AB open "$BASE/admin/files" >/dev/null 2>&1; sleep 4
# раздел «Медиа товаров» — только в нём есть корзина (кнопки в шапке media)
$AB eval "(function(){var tds=document.querySelectorAll('td,button,a,span');for(var i=0;i<tds.length;i++){if((tds[i].textContent||'').trim().indexOf('Медиа товаров')===0){tds[i].click();return 'clicked';}}return 'notfound';})()" >/dev/null 2>&1
sleep 2
$AB eval "(function(){var bs=document.querySelectorAll('button');for(var i=0;i<bs.length;i++){if(bs[i].textContent.trim()==='Корзина'){bs[i].click();return 'clicked';}}return 'notfound';})()" >/dev/null 2>&1
sleep 2
DLG=$(E "(function(){var h=document.querySelectorAll('h3');for(var i=0;i<h.length;i++){if(h[i].textContent.indexOf('Корзина')===0)return 'open';}return 'closed';})()")
[ "$DLG" = "open" ] && ok "диалог корзины открыт" || bad "диалог не открылся"
CNT=$(E "(function(){var h=document.querySelectorAll('h3');for(var i=0;i<h.length;i++){if(h[i].textContent.indexOf('Корзина')===0)return h[i].textContent.replace('Корзина','').trim();}return '';})()")
echo "$CNT" | grep -q "позиций: 1" && ok "счётчик позиций [$CNT]" || bad "счётчик: $CNT"
GIFT=$(E "(function(){var sp=document.querySelectorAll('span');for(var i=0;i<sp.length;i++){if(sp[i].textContent.indexOf('🎁')===0)return sp[i].textContent.trim();}return 'NOGIFT';})()")
[ "$GIFT" != "NOGIFT" ] && [ -n "$GIFT" ] && ok "подарок виден в позиции [${GIFT:0:50}]" || bad "названия подарка нет: $GIFT"
EMPTYBTN=$(E "(function(){var bs=document.querySelectorAll('button');for(var i=0;i<bs.length;i++){if(bs[i].textContent.indexOf('Очистить корзину')>=0)return 'yes';}return 'no';})()")
[ "$EMPTYBTN" = "yes" ] && ok "кнопка «Очистить корзину» присутствует" || bad "нет кнопки очистки"
DLBTN=$(E "(function(){var bs=document.querySelectorAll('button');for(var i=0;i<bs.length;i++){if(bs[i].textContent.trim()==='⬇')return 'yes';}return 'no';})()")
[ "$DLBTN" = "yes" ] && ok "кнопка скачивания позиции (⬇) есть" || bad "нет скачивания"
$AB eval "(function(){var bs=document.querySelectorAll('button');for(var i=0;i<bs.length;i++){if(bs[i].textContent.trim()==='Закрыть'){bs[i].click();return 'ok';}}return 'no';})()" >/dev/null 2>&1

echo "── C. API стенда: restore / as= / trash-empty ──"
CJ=/tmp/t130-e2e-cookies.txt
curl -s -c "$CJ" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d '{"email":"admin@lakomka.local","password":"Lakomka2026!"}' > /dev/null
TR=$(curl -s -b "$CJ" "$BASE/api/admin/files/trash")
PN=$(echo "$TR" | python3 -c "
import json,sys
its=json.load(sys.stdin)['data']['items']
print(next((i['product']['name'] for i in its if i['id']=='$SEEDID'),'NOPROD'))")
[ "$PN" != "NOPROD" ] && [ -n "$PN" ] && ok "API: позиция знает подарок [$PN]" || bad "product: $PN"
DL=$(curl -s -b "$CJ" -D - -o /dev/null "$BASE/api/admin/files/download?path=media%2F.trash%2F$SEEDID%2Fvideo-9.mov&as=$(python3 -c "import urllib.parse;print(urllib.parse.quote('Тест Подарок.mov'))")" 2>/dev/null)
echo "$DL" | grep -qi 'filename="Тест Подарок.mov"' && ok "API: скачивание именем подарка (as=)" || bad "as=: $(echo "$DL" | grep -i disposition)"
# восстановление с фолбэком: ломаем имя файла внутри позиции
mv "$UP/.trash/$SEEDID/video-9.mov" "$UP/.trash/$SEEDID/renamed.mov"
RS=$(curl -s -b "$CJ" -X POST "$BASE/api/admin/files/restore" -H "Content-Type: application/json" -d "{\"id\":\"$SEEDID\"}")
echo "$RS" | grep -q '"ok":true' && [ -f "$UP/products/$FOLDER/video-9.mov" ] && ok "API: восстановление с несовпавшим meta.name" || bad "restore: $RS"
rm -f "$UP/products/$FOLDER/video-9.mov"
# сид-позиция №2 для очистки
mkdir -p "$UP/.trash/20991231-235959-e2e131"; echo "x" > "$UP/.trash/20991231-235959-e2e131/0.jpg"
EM=$(curl -s -b "$CJ" -X POST "$BASE/api/admin/files/trash-empty")
REM=$(echo "$EM" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['removed'])" 2>/dev/null)
[ "${REM:-0}" -ge 1 ] && ok "API: trash-empty удалил [$REM] позиций" || bad "removed: $EM"
LEFT=$(curl -s -b "$CJ" "$BASE/api/admin/files/trash" | python3 -c "import json,sys; print(len(json.load(sys.stdin)['data']['items']))" 2>/dev/null)
[ "${LEFT:-9}" = "0" ] && ok "API: корзина пуста" || bad "осталось: $LEFT"

$AB close 2>/dev/null >/dev/null
echo "═══ ИТОГ: PASS=$PASS FAIL=$FAIL ═══"
[ "$FAIL" = "0" ]
