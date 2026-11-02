#!/bin/bash
# Task 131 E2E (стенд .deploy-package :8090):
#   A) Товары: выделение → bulk-bar → кнопка «Сформировать PDF» → PDF скачивается
#      (проверка тела через fetch+arrayBuffer: %PDF, размер);
#   B) Аудит 131: корзина физически в backend/storage/trash (uploads/.trash нет),
#      скачивание по историческому media/.trash/…, /backend/storage → 403;
#   C) Экспорты: миграция <pkg>/exports → backend/storage/exports, публичного /exports нет.
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
( cd "$ROOT/.deploy-package" && setsid "$PHP" -S 127.0.0.1:$PORT "$ROOT/scripts/deploy/dev-router.php" >/tmp/t131-e2e-php.log 2>&1 & )
for i in $(seq 1 30); do curl -s "$BASE/api/health" | grep -q ok && break; sleep 0.3; done
curl -s "$BASE/api/health" | grep -q ok && ok "стенд :$PORT поднялся" || { bad "стенд не поднялся"; exit 1; }

PKG="$ROOT/.deploy-package"

# ── сид C: legacy-экспорт в публичной зоне ДО вызовов ──
mkdir -p "$PKG/exports"
echo "legacy" > "$PKG/exports/e2e131-old.zip"
# ── сид B: файл товара для корзины ──
mkdir -p "$PKG/uploads/products/e2e131-dir"
echo "e2e131" > "$PKG/uploads/products/e2e131-dir/keep-me.txt"

AB="agent-browser"
# страховка: зависший вызов браузера не должен уронить весь прогон по таймауту сессии
$AB timeout 60000 close 2>/dev/null >/dev/null || true
E(){ timeout 60 $AB eval "$1" 2>/dev/null | tr -d '"'; }
$AB timeout 60000 set viewport 1440 900 >/dev/null 2>&1 || true

echo "── A. PDF по выделенным подаркам ──"
timeout 60 $AB open "$BASE/admin/orders" >/dev/null 2>&1; sleep 3
timeout 60 $AB eval "fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@lakomka.local',password:'Lakomka2026!'})}).then(r=>r.json()).then(j=>{window.__login=j&&j.data?'OK':'ERR'})" >/dev/null 2>&1
sleep 2
timeout 60 $AB open "$BASE/admin/products" >/dev/null 2>&1; sleep 5

# клик по чекбоксу первой строки
timeout 60 $AB eval "(function(){var c=document.querySelectorAll('tbody input[type=checkbox]')[0]; if(!c) return 'no-checkbox'; c.click(); return 'clicked';})()" >/dev/null 2>&1
sleep 1
BAR=$(E "(function(){return document.querySelector('[data-testid=bulk-bar]')?'visible':'none';})()")
[ "$BAR" = "visible" ] && ok "выделение строки → появилась панель bulk-bar" || bad "bulk-bar: $BAR"
BTN=$(E "(function(){var b=document.querySelector('[data-testid=pdf-btn]');return b?b.textContent.trim():'none';})()")
echo "$BTN" | grep -q "Сформировать PDF" && ok "в панели — кнопка «Сформировать PDF» [$BTN]" || bad "pdf-btn: $BTN"

# PDF через fetch от имени страницы (cookie auth): тело и размер
PDFCHK=$(E "(function(){return fetch('/api/admin/products/pdf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:[1,2]})}).then(function(r){return r.arrayBuffer().then(function(b){var u8=new Uint8Array(b);var sig=String.fromCharCode(u8[0],u8[1],u8[2],u8[3]);return sig+':'+b.byteLength;});});})()")
echo "$PDFCHK" | grep -q "^%PDF:" && SZ=$(echo "$PDFCHK" | cut -d: -f2) && [ "${SZ:-0}" -gt 20000 ] \
  && ok "PDF по 2 товарам: %PDF-сигнатура, $SZ байт" || bad "pdf fetch: $PDFCHK"

# клик по кнопке: ошибки сети/сервера быть не должно
timeout 60 $AB eval "(function(){var b=document.querySelector('[data-testid=pdf-btn]'); if(!b) return 'no-btn'; b.click(); return 'pressed';})()" >/dev/null 2>&1
sleep 6
ERR=$(E "(function(){return document.body.textContent.indexOf('Не удалось сформировать PDF')>=0?'err':'clean';})()")
[ "$ERR" = "clean" ] && ok "клик по кнопке — без ошибки скачивания" || bad "ошибка после клика: $ERR"

# снять выделение → панель исчезла
timeout 60 $AB eval "(function(){var c=document.querySelectorAll('tbody input[type=checkbox]')[0]; if(c&&c.checked) c.click(); return 'unsel';})()" >/dev/null 2>&1
sleep 1
BAR2=$(E "(function(){return document.querySelector('[data-testid=bulk-bar]')?'visible':'none';})()")
[ "$BAR2" = "none" ] && ok "снятие выделения → панель скрылась" || bad "bulk-bar после снятия: $BAR2"

echo "── B. Корзина в приватном хранилище ──"
CJ=/tmp/t131e-cookies.txt
curl -s -c "$CJ" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d '{"email":"admin@lakomka.local","password":"Lakomka2026!"}' >/dev/null
# удаление файла через API → в корзину
DEL=$(curl -s -b "$CJ" -X POST "$BASE/api/admin/files/delete" -H "Content-Type: application/json" -d '{"path":"media/products/e2e131-dir/keep-me.txt"}')
echo "$DEL" | grep -q '"trashed":true\|"ok":true' && ok "API: файл удалён в корзину" || bad "delete: $DEL"
[ -d "$PKG/backend/storage/trash" ] && ok "корзина физически в backend/storage/trash" || bad "storage/trash нет"
[ ! -d "$PKG/uploads/.trash" ] && ok "публичной uploads/.trash нет" || bad "uploads/.trash существует"
TRID=$(ls -t "$PKG/backend/storage/trash" 2>/dev/null | head -1)
[ -n "$TRID" ] && [ -f "$PKG/backend/storage/trash/$TRID/keep-me.txt" ] && ok "файл лежит в storage/trash/$TRID" || bad "файла в storage/trash нет"
DL=$(curl -s -b "$CJ" -o /dev/null -w '%{http_code}' "$BASE/api/admin/files/download?path=media%2F.trash%2F$TRID%2Fkeep-me.txt")
[ "$DL" = "200" ] && ok "download по media/.trash/… → 200" || bad "download: $DL"
BE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/backend/storage/trash/$TRID/keep-me.txt")
[ "$BE" = "403" ] && ok "прямой GET /backend/storage/… → 403 (эмуляция .htaccess)" || bad "backend direct: $BE"
UP=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/uploads/.trash/$TRID/keep-me.txt")
[ "$UP" = "404" ] && ok "прямой GET /uploads/.trash/… → 404 (файла нет в публичной зоне)" || bad "uploads direct: $UP"
# restore и уборка
curl -s -b "$CJ" -X POST "$BASE/api/admin/files/restore" -H "Content-Type: application/json" -d "{\"id\":\"$TRID\"}" >/dev/null
[ -f "$PKG/uploads/products/e2e131-dir/keep-me.txt" ] && ok "restore вернул файл на место" || bad "restore не сработал"

echo "── C. Экспорты в приватном хранилище ──"
curl -s -b "$CJ" "$BASE/api/admin/files?path=exports" > /dev/null
[ -f "$PKG/backend/storage/exports/e2e131-old.zip" ] && ok "legacy-экспорт перенесён в backend/storage/exports" || bad "миграция exports"
[ ! -d "$PKG/exports" ] && ok "публичной папки /exports больше нет" || bad "pkg/exports осталась"
ED=$(curl -s -b "$CJ" -o /dev/null -w '%{http_code}' "$BASE/api/admin/files/download?path=exports%2Fe2e131-old.zip")
[ "$ED" = "200" ] && ok "download exports по path= → 200" || bad "download exports: $ED"
BE2=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/backend/storage/exports/e2e131-old.zip")
[ "$BE2" = "403" ] && ok "прямой GET /backend/storage/exports/… → 403" || bad "exports direct: $BE2"

# ── уборка ──
rm -rf "$PKG/uploads/products/e2e131-dir" "$PKG/backend/storage/exports/e2e131-old.zip"
timeout 60 $AB close >/dev/null 2>&1 || true

echo
echo "═══ Итог: PASS=$PASS FAIL=$FAIL ═══"
[ "$FAIL" = "0" ]
