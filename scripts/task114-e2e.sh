#!/bin/bash
# Task 114 E2E: тулбар админа на витрине + метрика-блок на статическом стенде.
#   Стенд: .deploy-package :8090 (docroot, dev-router) = эмуляция прода.
#   Проверки:
#   A) гость: тулбара нет
#   B) админ (JS-fetch логин → кука): тулбар есть; на карточке товара —
#      кнопка «Редактировать товар» с ?id=
#   C) метрика-блок: после гидратации window.__ymCounterId = 113971152,
#      контейнер data-metrika содержит скрипт
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PHP="$(command -v php 2>/dev/null || true)"
[ -z "$PHP" ] && [ -x "$ROOT/../.ztools/php" ] && PHP="$(readlink -f "$ROOT/../.ztools/php")"
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); echo "  OK  $1"; }
bad(){ FAIL=$((FAIL+1)); echo "  FAIL $1"; }

PORT=8090; BASE="http://127.0.0.1:$PORT"
SLUG="kogda-prihodit-prazdnik-4900"
export PHP_CLI_SERVER_WORKERS=8
pkill -f "127.0.0.1:$PORT" 2>/dev/null; sleep 1
( cd "$ROOT/.deploy-package" && setsid "$PHP" -S 127.0.0.1:$PORT "$ROOT/scripts/deploy/dev-router.php" >/tmp/t114-e2e-php.log 2>&1 & )
for i in $(seq 1 30); do curl -s "$BASE/api/health" | grep -q ok && break; sleep 0.3; done
curl -s "$BASE/api/health" | grep -q ok && ok "стенд :$PORT поднялся (API отвечает)" || { bad "стенд не поднялся"; exit 1; }

# метрика-блок в dev-БД пакета (стенд берёт настройки из ПАКЕТНОЙ базы)
python3 - <<PY
import sqlite3
c = sqlite3.connect("$ROOT/.deploy-package/backend/storage/database.sqlite")
c.execute("INSERT INTO settings (key,value) VALUES ('metrika_code',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
 ("<script>window.__ymCounterId='113971152';window.__t114metrika=true;</script>",))
c.commit()
PY
ok "метрика-блок записан в пакетную БД"

AB="agent-browser"
$AB close 2>/dev/null >/dev/null

echo "── A. Гость: тулбара нет ──"
$AB open "$BASE/" >/dev/null 2>&1
sleep 3
TB=$($AB eval "document.querySelector('[data-testid=\"admin-toolbar\"]') ? 'YES' : 'NO'" 2>/dev/null | tr -d '"')
[ "$TB" = "NO" ] && ok "у гостя тулбара нет" || bad "у гостя виден тулбар ($TB)"

echo "── B. Админ: тулбар + кнопка редактирования ──"
$AB eval "fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@lakomka.local',password:'Lakomka2026!'})}).then(r=>r.json()).then(j=>{window.__login=j&&j.data?'OK':'ERR:'+JSON.stringify(j).slice(0,120);return window.__login})" >/dev/null 2>&1
sleep 2
L=$($AB eval "window.__login||''" 2>/dev/null | tr -d '"')
[ "$L" = "OK" ] && ok "логин из браузера прошёл" || bad "логин: $L"

$AB open "$BASE/product/$SLUG" >/dev/null 2>&1
sleep 4
TB=$($AB eval "document.querySelector('[data-testid=\"admin-toolbar\"]') ? 'YES' : 'NO'" 2>/dev/null | tr -d '"')
[ "$TB" = "YES" ] && ok "тулбар виден админу на карточке товара" || bad "тулбара нет ($TB)"
EDIT=$($AB eval "(function(){var a=document.querySelector('[data-testid=\"admin-toolbar\"] a');return a?a.getAttribute('href')+'|'+a.textContent.trim():'none'})()" 2>/dev/null | tr -d '"')
case "$EDIT" in
  *admin/products/edit*id=*) ok "кнопка «Редактировать товар»: $EDIT";;
  *) bad "кнопка редактирования не найдена: $EDIT";;
esac
PRODID=$(echo "$EDIT" | sed -n 's/.*id=\([0-9]*\).*/\1/p')
[ -n "$PRODID" ] && ok "id товара разрешён из слага ($PRODID)" || bad "id не разрешился"

# страница редактирования реально открывается по этому адресу
EDITURL=$(echo "$EDIT" | cut -d'|' -f1)
$AB open "$BASE$EDITURL" >/dev/null 2>&1
sleep 4
EDNAME=$($AB eval "(function(){var is=document.querySelectorAll('input');for(var k=0;k<is.length;k++){var v=(is[k].value||'').trim();if(v.length>2)return v.slice(0,40)}return 'empty'})()" 2>/dev/null | tr -d '"')
[ "$EDNAME" != "empty" ] && [ "$EDNAME" != "" ] && ok "страница редактирования открылась (товар: $EDNAME)" || bad "страница редактирования не отрисовалась ($EDNAME)"

PIDSQL=$(python3 -c "
import sqlite3
c = sqlite3.connect('$ROOT/.deploy-package/backend/storage/database.sqlite')
r = c.execute('SELECT id FROM products WHERE slug=?', ('$SLUG',)).fetchone()
print(r[0] if r else '')")
[ "$PRODID" = "$PIDSQL" ] && ok "id совпадает с базой ($PIDSQL)" || bad "id $PRODID ≠ базе $PIDSQL"

# тулбар и на обычной странице (каталог)
$AB open "$BASE/catalog" >/dev/null 2>&1
sleep 3
TB2=$($AB eval "document.querySelector('[data-testid=\"admin-toolbar\"]') ? 'YES' : 'NO'" 2>/dev/null | tr -d '"')
EDIT2=$($AB eval "(function(){var a=document.querySelector('[data-testid=\"admin-toolbar\"] a[href*=\"products/edit\"]');return a?'YES':'NO'})()" 2>/dev/null | tr -d '"')
[ "$TB2" = "YES" ] && [ "$EDIT2" = "NO" ] && ok "в каталоге тулбар есть, кнопки редактирования нет" || bad "каталог: тулбар=$TB2, кнопка=$EDIT2"

echo "── C. Метрика-блок ──"
$AB open "$BASE/" >/dev/null 2>&1
sleep 4
MID=$($AB eval "window.__ymCounterId||''" 2>/dev/null | tr -d '"')
[ "$MID" = "113971152" ] && ok "метрика исполнилась: __ymCounterId=113971152" || bad "__ymCounterId=$MID"
MJ=$($AB eval "window.__t114metrika===true?'YES':'NO'" 2>/dev/null | tr -d '"')
[ "$MJ" = "YES" ] && ok "блок с API отработал (живая доборка)" || bad "блок не исполнился"

echo "── уборка ──"
python3 - <<PY
import sqlite3
c = sqlite3.connect("$ROOT/.deploy-package/backend/storage/database.sqlite")
c.execute("DELETE FROM settings WHERE key='metrika_code'")
c.commit()
PY
$AB close >/dev/null 2>&1
pkill -f "127.0.0.1:$PORT" 2>/dev/null
ok "метрика-код из пакетной БД удалён, стенд погашен"

echo ""
echo "ИТОГ: $PASS passed, $FAIL failed"
[ "$FAIL" = "0" ]
