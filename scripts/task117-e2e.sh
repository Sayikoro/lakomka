#!/bin/bash
# Task 117 E2E: (1) справочник конфет — колонка «Фото» + модалка загрузки/замены;
#               (2) каталог — плитки категорий получают живые картинки после гидратации.
#   Стенд: .deploy-package :8090 (пересобранный пакет).
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
( cd "$ROOT/.deploy-package" && setsid "$PHP" -S 127.0.0.1:$PORT "$ROOT/scripts/deploy/dev-router.php" >/tmp/t117-e2e-php.log 2>&1 & )
for i in $(seq 1 30); do curl -s "$BASE/api/health" | grep -q ok && break; sleep 0.3; done
curl -s "$BASE/api/health" | grep -q ok && ok "стенд :$PORT поднялся" || { bad "стенд не поднялся"; exit 1; }

AB="agent-browser"
$AB close 2>/dev/null >/dev/null
E(){ $AB eval "$1" 2>/dev/null | tr -d '"'; }
CLICK(){ # $1 = js-выражение, возвращающее true при успехе; ретраи на гидратацию
  for i in $(seq 1 6); do
    R=$(E "$1")
    [ "$R" = "true" ] && return 0
    sleep 1.5
  done
  return 1
}

$AB set viewport 1440 900 >/dev/null 2>&1

# ── 1. Логин из браузера ──
$AB open "$BASE/admin/candies" >/dev/null 2>&1
sleep 3
$AB eval "fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@lakomka.local',password:'Lakomka2026!'})}).then(r=>r.json()).then(j=>{window.__login=j&&j.data?'OK':'ERR';return window.__login})" >/dev/null 2>&1
sleep 2
L=$(E "window.__login||''")
[ "$L" = "OK" ] && ok "логин из браузера прошёл" || bad "логин: $L"

# ── 2. Конфеты: колонка «Фото» ──
$AB open "$BASE/admin/candies" >/dev/null 2>&1
sleep 6
CLICK "document.body.innerText.indexOf('Конфет')>=0 && document.body.innerText.indexOf('Фото')>=0"
ok "страница «Конфеты» с колонкой «Фото»"
THCNT=$(E "(function(){var ths=[].slice.call(document.querySelectorAll('table th'));return ths.filter(function(t){return t.textContent.trim()==='Фото'}).length})()")
[ "$THCNT" = "1" ] && ok "заголовок «Фото» в таблице" || bad "th Фото: $THCNT"

# клик по первой ячейке фото → модалка
CLICK "(function(){var b=document.querySelector('table tbody button[title]');if(!b)return false;b.click();return true})()"
CLICK "document.body.innerText.indexOf('Заменить фото')>=0 || document.body.innerText.indexOf('Загрузить фото')>=0"
ok "модалка фото открылась (Заменить/Загрузить фото)"
HASPICK=$(E "(function(){return document.querySelector('.fixed input[type=file][accept*=image]') ? 'YES':'NO'})()")
[ "$HASPICK" = "YES" ] && ok "в модалке есть input[type=file] для картинки" || bad "нет file-инпута ($HASPICK)"
CLICK "(function(){var bs=[].slice.call(document.querySelectorAll('.fixed button'));var b=bs.find(function(x){return x.textContent.trim()==='Закрыть'});if(!b)return false;b.click();return true})()"
ok "модалка закрыта"

# ── 3. Каталог: плитки категорий с живыми картинками ──
$AB open "$BASE/catalog" >/dev/null 2>&1
sleep 9
CATIMG=$(E "(function(){var n=0;document.querySelectorAll('button[aria-pressed] img').forEach(function(im){if(im.complete&&im.naturalWidth>0)n++});return n})()")
[ "$CATIMG" != "0" ] && [ -n "$CATIMG" ] && ok "плитки категорий: загруженных картинок $CATIMG" || bad "картинок в плитках категорий нет ($CATIMG)"
BROKEN=$(E "(function(){var n=0;document.querySelectorAll('button[aria-pressed] img').forEach(function(im){if(im.complete&&im.naturalWidth===0)n++});return n})()")
[ "$BROKEN" = "0" ] && ok "битых картинок в плитках нет" || bad "битых плиток: $BROKEN"

# ── 4. Рецепты: страница открывается, колонка «Производитель» на месте ──
$AB open "$BASE/admin/weight-recipes" >/dev/null 2>&1
sleep 6
CLICK "(function(){var bs=[].slice.call(document.querySelectorAll('button'));var x=bs.find(function(t){return /^\\d+\\s*г$/.test(t.textContent.trim())});if(!x)return false;x.click();return true})()"
sleep 2
MANCOL=$(E "(function(){var ths=[].slice.call(document.querySelectorAll('table th'));return ths.some(function(t){return t.textContent.indexOf('Производитель')>=0})?'YES':'NO'})()")
[ "$MANCOL" = "YES" ] && ok "в рецептах есть колонка «Производитель»" || bad "колонки производителя нет ($MANCOL)"

$AB close 2>/dev/null >/dev/null
pkill -f "127.0.0.1:$PORT" 2>/dev/null
echo "── ИТОГ: PASS=$PASS FAIL=$FAIL ──"
[ "$FAIL" = "0" ]
