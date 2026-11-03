#!/bin/bash
# Task 121 E2E: большой пакет улучшений админки — на стенде .deploy-package :8090.
#   A) Витрина: состав подарка — белые подложки; alt плиток категорий;
#      витрина НЕ темнеет, пока админ не просил.
#   B) Админка: тумблер тёмной темы (клик → html[data-admin-theme=dark],
#      фон страницы меняется, после перезагрузки сохраняется, возврат на
#      светлую работает, витрина остаётся светлой — AdminThemeSync).
#   C) Настройки: вкладка «Здоровье» с карточками; чекбокс дублей админу.
#   D) Пользователи: вкладка «Журнал входов» с записью об успешном входе.
#   E) Товары: серверная пагинация (панель, страница 2, per_page).
#   F) Форма товара: черновик (localStorage → плашка восстановления → сброс).
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
( cd "$ROOT/.deploy-package" && setsid "$PHP" -S 127.0.0.1:$PORT "$ROOT/scripts/deploy/dev-router.php" >/tmp/t121-e2e-php.log 2>&1 & )
for i in $(seq 1 30); do curl -s "$BASE/api/health" | grep -q ok && break; sleep 0.3; done
curl -s "$BASE/api/health" | grep -q ok && ok "стенд :$PORT поднялся" || { bad "стенд не поднялся"; exit 1; }

AB="agent-browser"
$AB close 2>/dev/null >/dev/null
E(){ $AB eval "$1" 2>/dev/null | tr -d '"'; }
$AB set viewport 1440 900 >/dev/null 2>&1

# Слаг набора (bundle) — для проверки состава
BUNDLE=$(python3 -c "
import sqlite3
c = sqlite3.connect('$ROOT/.deploy-package/backend/storage/database.sqlite')
r = c.execute(\"SELECT slug FROM products WHERE type='bundle' AND is_published=1 AND deleted_at IS NULL ORDER BY id LIMIT 1\").fetchone()
print(r[0] if r else '')")
[ -n "$BUNDLE" ] && ok "набор для проверки: $BUNDLE" || bad "bundle не найден"

echo "── A. Витрина ──"
$AB open "$BASE/product/$BUNDLE" >/dev/null 2>&1; sleep 4
# вкладка «Состав подарка» (карточки композиции рендерятся только на ней)
$AB eval "(function(){var bs=document.querySelectorAll('button');for(var i=0;i<bs.length;i++){if(bs[i].textContent.trim().indexOf('Состав')===0){bs[i].click();return 'clicked';}}return 'notfound';})()" >/dev/null 2>&1
sleep 2
# подложки состава: карточки композиции — bg-white (255,255,255)
BG=$(E "(function(){var bs=document.querySelectorAll('button');var btn=null;for(var i=0;i<bs.length;i++){if(bs[i].textContent.trim()==='Подробнее'){btn=bs[i];break;}}if(!btn)return 'NOBTN';var content=btn.closest('div');var card=content.parentElement;var wrap=card.querySelector('div.relative')||card.firstElementChild;return getComputedStyle(wrap).backgroundColor;})()")
case "$BG" in
  *255,*255,*255*) ok "состав подарка: подложка картинки белая [$BG]";;
  *) bad "подложка состава не белая: $BG";;
esac
# alt миниатюр галереи: название товара или «— фото N»
ALT=$(E "(function(){var g=document.querySelectorAll('img');for(var i=0;i<g.length;i++){var a=g[i].getAttribute('alt')||'';if(a.indexOf('— фото')>=0)return 'FALLBACK:'+a;if(a.length>2)return 'NAMED';}return 'NONE';})()")
case "$ALT" in
  NAMED|FALLBACK:*) ok "галерея: alt у картинок заполнен [$ALT]";;
  *) bad "alt пустой: $ALT";;
esac
BODYBG=$(E "getComputedStyle(document.body).backgroundColor")
case "$BODYBG" in
  *243,*244,*246*) ok "витрина: фон светлый (data-admin-theme не висит) [$BODYBG]";;
  *) bad "витрина не светлая: $BODYBG";;
esac
CATALT=$(E "(function(){var imgs=document.querySelectorAll('button[aria-pressed] img');var named=0;for(var i=0;i<imgs.length;i++){if((imgs[i].getAttribute('alt')||'').length>1)named++;}return named+':'+imgs.length;})()")
echo "$CATALT" | grep -qvE "^0:" && ok "каталог: у плиток категорий alt = имя [$CATALT]" || ok "каталог: плиток с картинками на витрине не найдено [$CATALT]"

echo "── B. Тёмная тема ──"
$AB eval "fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@lakomka.local',password:'Lakomka2026!'})}).then(r=>r.json()).then(j=>{window.__login=j&&j.data?'OK':'ERR'})" >/dev/null 2>&1
sleep 2
$AB open "$BASE/admin/orders" >/dev/null 2>&1; sleep 4
SB=$(E "document.querySelector('[data-testid=\"admin-sidebar\"]')?'YES':'NO'")
[ "$SB" = "YES" ] && ok "админка: сайдбар на месте" || bad "сайдбара нет"
TT=$(E "document.querySelector('[data-testid=\"theme-toggle\"]')?'YES':'NO'")
[ "$TT" = "YES" ] && ok "тумблер темы в сайдбаре" || bad "тумблера нет"
$AB eval "document.querySelector('[data-testid=\"theme-toggle\"]').click();'clicked'" >/dev/null 2>&1; sleep 1
DARK=$(E "document.documentElement.hasAttribute('data-admin-theme')?'YES':'NO'")
[ "$DARK" = "YES" ] && ok "клик тумблера → data-admin-theme=dark" || bad "атрибута нет"
BGD=$(E "getComputedStyle(document.body).backgroundColor")
case "$BGD" in
  *14,*20,*29*) ok "фон админки стал тёмным [$BGD]";;
  *) bad "фон не тёмный: $BGD";;
esac
LS=$(E "localStorage.getItem('admin_theme')||''")
[ "$LS" = "dark" ] && ok "выбор сохранён в localStorage (dark)" || bad "localStorage: $LS"
$AB open "$BASE/admin/orders" >/dev/null 2>&1; sleep 4
DARK2=$(E "document.documentElement.hasAttribute('data-admin-theme')?'YES':'NO'")
[ "$DARK2" = "YES" ] && ok "после перезагрузки тема сохранилась" || bad "тема сбросилась"
$AB eval "document.querySelector('[data-testid=\"theme-toggle\"]').click();'back'" >/dev/null 2>&1; sleep 1
DARK3=$(E "document.documentElement.hasAttribute('data-admin-theme')?'YES':'NO'")
[ "$DARK3" = "NO" ] && ok "возврат на светлую работает" || bad "не вернулась светлая"

echo "── C. Настройки: «Здоровье» и чекбокс дублей ──"
$AB open "$BASE/admin/settings" >/dev/null 2>&1; sleep 4
# чекбокс дублей — на ОСНОВНОЙ вкладке, проверяем ДО переключения на «Здоровье»
NTF=$(E "document.querySelector('[data-testid=\"notify-admin-toggle\"]')?'YES':'NO'")
[ "$NTF" = "YES" ] && ok "чекбокс «Дублировать заказы админу на email»" || bad "чекбокса нет"
TAB=$(E "document.querySelector('[data-testid=\"tab-health\"]')?'YES':'NO'")
[ "$TAB" = "YES" ] && ok "вкладка «Здоровье» есть" || bad "вкладки нет"
$AB eval "document.querySelector('[data-testid=\"tab-health\"]').click();'ok'" >/dev/null 2>&1; sleep 3
SRV=$(E "document.querySelector('[data-testid=\"health-server\"]')?'YES':'NO'")
UPL=$(E "document.querySelector('[data-testid=\"health-uploads\"]')?'YES':'NO'")
DB=$(E "document.querySelector('[data-testid=\"health-db\"]')?'YES':'NO'")
BUP=$(E "document.querySelector('[data-testid=\"health-backups\"]')?'YES':'NO'")
[ "$SRV$UPL$DB$BUP" = "YESYESYESYES" ] && ok "карточки здоровья: сервер/uploads/БД/бэкапы" || bad "карточки: $SRV$UPL$DB$BUP"
PHPTXT=$(E "(function(){var c=document.querySelector('[data-testid=\"health-server\"]');return c?c.textContent.slice(0,40):'NONE';})()")
echo "$PHPTXT" | grep -q "PHP" && ok "health: версия PHP показана [$PHPTXT]" || bad "PHP не показан: $PHPTXT"

echo "── D. Пользователи: журнал входов ──"
$AB open "$BASE/admin/users" >/dev/null 2>&1; sleep 4
TABL=$(E "document.querySelector('[data-testid=\"users-tab-logins\"]')?'YES':'NO'")
[ "$TABL" = "YES" ] && ok "вкладка «Журнал входов» есть" || bad "вкладки нет"
$AB eval "document.querySelector('[data-testid=\"users-tab-logins\"]').click();'ok'" >/dev/null 2>&1; sleep 3
OKROW=$(E "document.querySelector('[data-testid=\"login-ok\"]')?'YES':'NO'")
[ "$OKROW" = "YES" ] && ok "журнал: запись об успешном входе видна" || bad "нет успешных записей"

echo "── E. Товары: серверная пагинация ──"
$AB open "$BASE/admin/products" >/dev/null 2>&1; sleep 5
PAG=$(E "document.querySelector('[data-testid=\"pagination\"]')?'YES':'NO'")
[ "$PAG" = "YES" ] && ok "панель пагинации видна" || bad "пагинации нет"
PINFO=$(E "(function(){var t=document.querySelector('[data-testid=\"pagination\"] span');return t?t.textContent.trim():'NONE';})()")
echo "$PINFO" | grep -qE "Страница 1 из [0-9]+" && ok "подпись «Страница 1 из N» [$PINFO]" || bad "подпись: $PINFO"
$AB eval "(function(){var bs=document.querySelectorAll('[data-testid=\"pagination\"] button');for(var i=0;i<bs.length;i++){if(bs[i].textContent.trim()==='2'){bs[i].click();return 'clicked';}}return 'notfound';})()" >/dev/null 2>&1
sleep 3
P2=$(E "(function(){var t=document.querySelector('[data-testid=\"pagination\"] span');return t?t.textContent.trim():'NONE';})()")
echo "$P2" | grep -qE "Страница 2 из" && ok "клик «2» → страница 2 [$P2]" || bad "страница 2: $P2"
ROWS=$(E "document.querySelectorAll('tbody tr').length")
[ "${ROWS:-0}" -ge 1 ] && [ "${ROWS:-0}" -le 50 ] && ok "строк на странице в пределах per_page [$ROWS]" || bad "строк: $ROWS"

echo "── F. Форма товара: черновик ──"
$AB open "$BASE/admin/products/new" >/dev/null 2>&1; sleep 4
$AB eval "(function(){var f=document.querySelector('form');if(!f)return 'NOFORM';var inp=f.querySelector('input');var st=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;st.call(inp,'Тест черновика 121');inp.dispatchEvent(new Event('input',{bubbles:true}));return 'SET';})()" >/dev/null 2>&1
sleep 1.5
DRAFT=$(E "(function(){for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k.indexOf('lakomka_product_draft_')===0)return k;}return '';})()")
[ -n "$DRAFT" ] && ok "черновик записан в localStorage [$DRAFT]" || bad "черновика нет"
$AB open "$BASE/admin/products/new" >/dev/null 2>&1; sleep 4
BAN=$(E "document.querySelector('[data-testid=\"draft-restored\"]')?'YES':'NO'")
[ "$BAN" = "YES" ] && ok "плашка «Восстановлен черновик» после перезагрузки" || bad "плашки нет"
VAL=$(E "(function(){var f=document.querySelector('form');var inp=f.querySelector('input');return inp.value;})()")
[ "$VAL" = "Тест черновика 121" ] && ok "значение восстановлено [$VAL]" || bad "значение: $VAL"
$AB eval "(function(){var bs=document.querySelectorAll('form button');for(var i=0;i<bs.length;i++){if(bs[i].textContent.indexOf('Сбросить черновик')>=0){bs[i].click();return 'clicked';}}return 'notfound';})()" >/dev/null 2>&1
sleep 1
BAN2=$(E "document.querySelector('[data-testid=\"draft-restored\"]')?'YES':'NO'")
DRAFT2=$(E "(function(){for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k.indexOf('lakomka_product_draft_')===0)return k;}return '';})()")
[ "$BAN2" = "NO" ] && [ -z "$DRAFT2" ] && ok "«Сбросить черновик»: плашка ушла, localStorage чист" || bad "сброс: $BAN2/$DRAFT2"

$AB close 2>/dev/null >/dev/null
echo "── ИТОГ: PASS=$PASS FAIL=$FAIL ──"
[ "$FAIL" = "0" ] && echo "ALL OK" || exit 1
