#!/bin/bash
# Task 116 E2E: самовосстановление картинок (SmartImg) на статическом стенде.
#   Стенд: .deploy-package :8090. Готовим товар-двойник: у
#   advent-kalendar-5300 лежит 0.webp — добавляем рядом 0.jpg (та же
#   картинка) и БЛОКИРУЕМ отдачу 0.webp (network route --abort). Витрина
#   должна сама переключить <img> на 0.jpg и показать картинку.
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
( cd "$ROOT/.deploy-package" && setsid "$PHP" -S 127.0.0.1:$PORT "$ROOT/scripts/deploy/dev-router.php" >/tmp/t116-e2e-php.log 2>&1 & )
for i in $(seq 1 30); do curl -s "$BASE/api/health" | grep -q ok && break; sleep 0.3; done
curl -s "$BASE/api/health" | grep -q ok && ok "стенд :$PORT поднялся" || { bad "стенд не поднялся"; exit 1; }

PROD="advent-kalendar-5300"
PKGUP="$ROOT/.deploy-package/uploads/products/$PROD"
[ -f "$PKGUP/0.webp" ] && ok "у товара $PROD есть 0.webp" || { bad "нет 0.webp у $PROD"; exit 1; }
cp "$PKGUP/0.webp" "$PKGUP/0.jpg"
ok "положили двойник 0.jpg (для фолбэка)"

AB="agent-browser"
$AB close 2>/dev/null >/dev/null
E(){ $AB eval "$1" 2>/dev/null | tr -d '"'; }

$AB set viewport 1440 900 >/dev/null 2>&1
$AB network route "**$PROD/0.webp*" --abort --resource-type image >/dev/null 2>&1
ok "блокируем отдачу $PROD/0.webp"

$AB open "$BASE/catalog" >/dev/null 2>&1
sleep 8
# картинка товара должна переехать на 0.jpg и загрузиться
JPG=$(E "(function(){var n=0;document.querySelectorAll('img').forEach(function(im){if(im.src.indexOf('$PROD/0.jpg')>=0&&im.complete&&im.naturalWidth>0)n++});return n})()")
[ "$JPG" != "0" ] && [ -n "$JPG" ] && ok "фолбэк сработал: карточка показывает 0.jpg (загружено: $JPG)" || bad "фолбэк не сработал (0.jpg загружено: $JPG)"
BROKEN=$(E "(function(){var n=0;document.querySelectorAll('img').forEach(function(im){if(im.src.indexOf('$PROD/0.webp')>=0&&im.complete&&im.naturalWidth===0)n++});return n})()")
[ "$BROKEN" = "0" ] && ok "битых <img> c 0.webp не осталось" || bad "сломанных картинок с 0.webp: $BROKEN"

$AB network unroute "**$PROD/0.webp*" >/dev/null 2>&1
rm -f "$PKGUP/0.jpg"
ok "двойник убран, маршрут снят"

$AB close 2>/dev/null >/dev/null
echo "── ИТОГ: PASS=$PASS FAIL=$FAIL ──"
[ "$FAIL" = "0" ]
