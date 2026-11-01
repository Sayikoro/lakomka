#!/bin/bash
# Task 115 E2E: админ-панель — левый сайдбар вместо верхней шапки.
#   Стенд: .deploy-package :8090 (docroot, dev-router) = эмуляция прода.
#   A) гость: страница входа БЕЗ сайдбара (оболочка не рисуется)
#   B) админ (JS-fetch логин → кука): сайдбар слева, все разделы
#      супер-админа, активный пункт подсвечен, навигация работает,
#      бейдж заказов на месте, выход на месте
#   C) мобильный (390×844): сайдбар спрятан, бургер открывает меню,
#      клик по разделу закрывает меню и переходит на страницу
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
( cd "$ROOT/.deploy-package" && setsid "$PHP" -S 127.0.0.1:$PORT "$ROOT/scripts/deploy/dev-router.php" >/tmp/t115-e2e-php.log 2>&1 & )
for i in $(seq 1 30); do curl -s "$BASE/api/health" | grep -q ok && break; sleep 0.3; done
curl -s "$BASE/api/health" | grep -q ok && ok "стенд :$PORT поднялся" || { bad "стенд не поднялся"; exit 1; }

AB="agent-browser"
$AB close 2>/dev/null >/dev/null
E(){ $AB eval "$1" 2>/dev/null | tr -d '"'; }

echo "── A. Гость: страница входа без оболочки ──"
$AB set viewport 1440 900 >/dev/null 2>&1
$AB open "$BASE/admin/orders" >/dev/null 2>&1
sleep 3
URL=$($AB get url 2>/dev/null)
case "$URL" in
  *admin/login*) ok "гость переброшен на вход ($URL)";;
  *) bad "гость не на странице входа: $URL";;
esac
SB=$(E "document.querySelector('[data-testid=\"admin-sidebar\"]') ? 'YES' : 'NO'")
[ "$SB" = "NO" ] && ok "у гостя на странице входа сайдбара нет" || bad "сайдбар на странице входа ($SB)"
H1=$(E "(function(){var f=document.querySelector('form');return f&&f.textContent.indexOf('Вход в админку')>=0?'YES':'NO'})()")
[ "$H1" = "YES" ] && ok "форма «Вход в админку» на месте" || bad "форма входа не найдена"

echo "── B. Админ: сайдбар, активный пункт, навигация ──"
$AB eval "fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@lakomka.local',password:'Lakomka2026!'})}).then(r=>r.json()).then(j=>{window.__login=j&&j.data?'OK':'ERR';return window.__login})" >/dev/null 2>&1
sleep 2
L=$(E "window.__login||''")
[ "$L" = "OK" ] && ok "логин из браузера прошёл" || bad "логин: $L"

$AB open "$BASE/admin/orders" >/dev/null 2>&1
sleep 4
SB=$(E "document.querySelector('[data-testid=\"admin-sidebar\"]') ? 'YES' : 'NO'")
[ "$SB" = "YES" ] && ok "сайдбар отрисован" || bad "сайдбара нет ($SB)"
LEFT=$(E "(function(){var s=document.querySelector('[data-testid=\"admin-sidebar\"]');if(!s)return 'NONE';var b=s.getBoundingClientRect();return Math.round(b.left)+':'+Math.round(b.width)})()")
[ "$LEFT" = "0:256" ] && ok "сайдбар прижат влево (left=0, ширина 256) [$LEFT]" || bad "сайдбар не слева: $LEFT"
CNT=$(E "document.querySelectorAll('[data-testid=\"admin-sidebar\"] nav a').length")
[ "$CNT" = "9" ] && ok "у супер-админа 9 разделов (включая Пользователи/Настройки) [$CNT]" || bad "разделов: $CNT"
ACT=$(E "(function(){var a=document.querySelector('[data-testid=\"admin-sidebar\"] a[aria-current=\"page\"]');return a?a.textContent.trim():'NONE'})()")
case "$ACT" in
  *"Заказы"*) ok "активный пункт — Заказы [$ACT]";;
  *) bad "активный пункт не Заказы: $ACT";;
esac
EM=$(E "(function(){var s=document.querySelector('[data-testid=\"admin-sidebar\"]');return s&&s.textContent.indexOf('admin@lakomka.local')>=0?'YES':'NO'})()")
[ "$EM" = "YES" ] && ok "email админа в сайдбаре" || bad "email не найден"
LO=$(E "(function(){var s=document.querySelector('[data-testid=\"admin-sidebar\"]');return s&&s.textContent.indexOf('Выйти')>=0?'YES':'NO'})()")
[ "$LO" = "YES" ] && ok "кнопка «Выйти» в сайдбаре" || bad "«Выйти» не найдена"
OB=$(E "(function(){var b=document.querySelector('[data-testid=\"version-badge\"]');return b?b.textContent.trim():'NONE'})()")
[ "$OB" != "NONE" ] && ok "плашка версии/обновления в сайдбаре [$OB]" || bad "version-badge не найден"

# навигация по сайдбару: Товары
$AB eval "(function(){var links=document.querySelectorAll('[data-testid=\"admin-sidebar\"] nav a');for(var i=0;i<links.length;i++){if(links[i].textContent.indexOf('Товары')>=0){links[i].click();return 'CLICKED'}}return 'NOPE'})()" >/dev/null 2>&1
sleep 4
U=$($AB get url 2>/dev/null)
case "$U" in
  *admin/products*) ok "клик «Товары» привёл на $U";;
  *) bad "переход на Товары не случился: $U";;
esac
ACT=$(E "(function(){var a=document.querySelector('[data-testid=\"admin-sidebar\"] a[aria-current=\"page\"]');return a?a.textContent.trim():'NONE'})()")
case "$ACT" in
  *"Товары"*) ok "активный пункт переключился на Товары";;
  *) bad "активный пункт после перехода: $ACT";;
esac
TBL=$(E "document.querySelector('main') && document.querySelector('main').textContent.length > 200 ? 'YES' : 'NO'")
[ "$TBL" = "YES" ] && ok "контент страницы Товары отрисовался" || bad "main пустой"

echo "── C. Мобильный (390×844): бургер + выезжающее меню ──"
# После смены вьюпорта вкладка может перегидратироваться — ждём сайдбар
$AB set viewport 390 844 >/dev/null 2>&1
SB=NO
for i in $(seq 1 10); do
  SB=$(E "document.querySelector('[data-testid=\"admin-sidebar\"]') ? 'YES' : 'NO'")
  [ "$SB" = "YES" ] && break
  sleep 1
done
[ "$SB" = "YES" ] && ok "на мобильном сайдбар в DOM" || bad "сайдбара нет после ресайза"
X=$(E "(function(){var s=document.querySelector('[data-testid=\"admin-sidebar\"]');var b=s.getBoundingClientRect();return Math.round(b.left)})()")
[ "$X" -lt 0 ] 2>/dev/null && ok "на мобильном сайдбар спрятан за левый край (left=$X)" || bad "сайдбар не спрятан (left=$X)"
BR=$(E "(function(){var b=document.querySelector('button[aria-label=\"Открыть меню\"]');if(!b)return 'NO';var r=b.getBoundingClientRect();return r.width>0?'YES':'NO'})()")
[ "$BR" = "YES" ] && ok "бургер виден на мобильном" || bad "бургера нет"
# Клик с ретраями (гидратация может догуливать после ресайза)
OPENED=NO
for i in $(seq 1 5); do
  $AB eval "document.querySelector('button[aria-label=\"Открыть меню\"]').click()" >/dev/null 2>&1
  sleep 1
  X=$(E "(function(){var s=document.querySelector('[data-testid=\"admin-sidebar\"]');var b=s.getBoundingClientRect();return Math.round(b.left)})()")
  if [ "$X" = "0" ]; then OPENED=YES; break; fi
  sleep 1
done
[ "$OPENED" = "YES" ] && ok "бургер открыл меню (left=0)" || bad "меню не открылось (left=$X)"
OV=$(E "(function(){var o=document.querySelector('.bg-black\\\\/40');return o&&getComputedStyle(o).opacity==='1'?'YES':'NO'})()")
[ "$OV" = "YES" ] && ok "затемнение под меню видно" || bad "затемнения нет"
$AB eval "(function(){var links=document.querySelectorAll('[data-testid=\"admin-sidebar\"] nav a');for(var i=0;i<links.length;i++){if(links[i].textContent.indexOf('Заказы')>=0){links[i].click();return 'CLICKED'}}return 'NOPE'})()" >/dev/null 2>&1
sleep 3
U=$($AB get url 2>/dev/null)
case "$U" in
  *admin/orders*) ok "клик в меню привёл на Заказы ($U)";;
  *) bad "переход на Заказы не случился: $U";;
esac
X=$(E "(function(){var s=document.querySelector('[data-testid=\"admin-sidebar\"]');var b=s.getBoundingClientRect();return Math.round(b.left)})()")
[ "$X" -lt 0 ] 2>/dev/null && ok "меню закрылось после перехода (left=$X)" || bad "меню не закрылось (left=$X)"

$AB screenshot /tmp/t115-mobile-menu.png >/dev/null 2>&1
$AB set viewport 1440 900 >/dev/null 2>&1
sleep 1
$AB screenshot /tmp/t115-desktop.png >/dev/null 2>&1

echo "── ИТОГ: PASS=$PASS FAIL=$FAIL ──"
[ "$FAIL" = "0" ]
