#!/bin/bash
# Task 118: снежинки в херо-блоке (и другие системные файлы витрины) пропали
# после очистки «неиспользуемых» — на них ссылался КОД, а не база.
#   1) php -l, tsc, eslint, маркеры
#   2) SystemFiles::heal() — юнит на фейковом корне сайта (восстановление + идемпотентность)
#   3) API (:8026): unused НЕ показывает системные файлы; unused-purge и точечное
#      delete их отклоняют (файлы целы); аноним 401
# Регрессии запускаются отдельно: task117/116/115/114/112-tests.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PHP="$(command -v php 2>/dev/null || true)"
[ -z "$PHP" ] && [ -x "$ROOT/.ztools/php" ] && PHP="$ROOT/.ztools/php"
[ -z "$PHP" ] && [ -x "$ROOT/../.ztools/php" ] && PHP="$(readlink -f "$ROOT/../.ztools/php")"
[ -n "$PHP" ] || { echo "php не найден"; exit 1; }
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

echo "── 1. Синтаксис, типы, маркеры ──"
for f in backend/src/SystemFiles.php backend/src/Controllers/AdminFilesController.php \
         backend/src/Controllers/AdminSiteUpdateController.php backend/public/index.php; do
  $PHP -l "$ROOT/$f" > /dev/null 2>&1 && ok "php -l $f" || bad "php -l $f"
done
if npx tsc --noEmit > /tmp/t118-tsc.log 2>&1; then ok "tsc --noEmit чист"; else bad "tsc: $(head -3 /tmp/t118-tsc.log)"; fi
if npx eslint src/components/home/Snowfall.tsx src/components/admin/SettingsForm.tsx src/lib/snow.ts > /tmp/t118-eslint.log 2>&1; then ok "eslint 0 ошибок"; else bad "eslint: $(grep -E 'error' /tmp/t118-eslint.log | head -2)"; fi

# маркеры: системные файлы
rg -q "snowflake/snowflake.svg" "$ROOT/backend/src/SystemFiles.php" && rg -q "brand/logo-lakomka.webp" "$ROOT/backend/src/SystemFiles.php" && rg -q "process-bg.png" "$ROOT/backend/src/SystemFiles.php" && ok "SystemFiles::REFERRED — снежинка/логотип/шаги/фон" || bad "список REFERRED неполон"
rg -q "SystemFiles::isReferred" "$ROOT/backend/src/Controllers/AdminFilesController.php" && ok "сканер unused: системные файлы исключены" || bad "unused без isReferred"
[ "$(rg -c 'SystemFiles::isReferred' "$ROOT/backend/src/Controllers/AdminFilesController.php")" -ge 2 ] && ok "unused-purge + delete: guard от удаления" || bad "guard'ов удаления меньше двух"
rg -q "SystemFiles::referredInside" "$ROOT/backend/src/Controllers/AdminFilesController.php" && ok "папки с системными файлами не удаляются" || bad "нет referredInside"
rg -q "SystemFiles::heal" "$ROOT/backend/src/Controllers/AdminSiteUpdateController.php" && rg -q "system_restored" "$ROOT/backend/src/Controllers/AdminSiteUpdateController.php" && ok "apply(): самовосстановление + отчёт system_restored" || bad "apply() без heal"
rg -q "SystemFiles" "$ROOT/backend/public/index.php" && ok "index.php подключает SystemFiles" || bad "нет require SystemFiles"

# маркеры: вшитая снежинка
rg -q "DEFAULT_FLAKE_SVG" "$ROOT/src/lib/snow.ts" && ok "snow.ts: SVG снежинки вшит в код" || bad "нет DEFAULT_FLAKE_SVG"
rg -q "DEFAULT_FLAKE_SVG" "$ROOT/src/components/home/Snowfall.tsx" && ok "Snowfall: использует вшитую снежинку" || bad "Snowfall без DEFAULT_FLAKE_SVG"
grep -q "/uploads/snowflake/snowflake.svg" "$ROOT/src/components/home/Snowfall.tsx" && bad "Snowfall всё ещё зависит от /uploads/snowflake" || ok "Snowfall не зависит от /uploads (нет сетевого дефолта)"
rg -q "DEFAULT_FLAKE_DATA" "$ROOT/src/components/admin/SettingsForm.tsx" && ok "SettingsForm: превью снежинки на data-URI" || bad "SettingsForm без DEFAULT_FLAKE_DATA"

# маркеры: копии в пакете обновления
N=$(find "$ROOT/backend/assets/system-uploads" -type f 2>/dev/null | wc -l)
[ "$N" = "6" ] && ok "backend/assets/system-uploads: 6 файлов" || bad "в assets $N файлов (ожидалось 6)"
cmp -s "$ROOT/backend/assets/system-uploads/snowflake/snowflake.svg" "$ROOT/public/uploads/snowflake/snowflake.svg" && ok "копия снежинки = оригиналу" || bad "копия снежинки разошлась с public/"

echo "── 2. SystemFiles::heal() на фейковом корне ──"
FAKE=/tmp/t118-fakeroot
rm -rf "$FAKE"; mkdir -p "$FAKE/uploads" "$FAKE/backend/assets/system-uploads/snowflake" "$FAKE/backend/assets/system-uploads/brand"
cp "$ROOT/backend/assets/system-uploads/snowflake/snowflake.svg" "$FAKE/backend/assets/system-uploads/snowflake/"
cp "$ROOT/backend/assets/system-uploads/brand/logo-lakomka.webp" "$FAKE/backend/assets/system-uploads/brand/"
R1=$($PHP -r "require '$ROOT/backend/src/SystemFiles.php'; echo count(SystemFiles::heal('$FAKE'));")
[ "$R1" = "2" ] && [ -f "$FAKE/uploads/snowflake/snowflake.svg" ] && [ -f "$FAKE/uploads/brand/logo-lakomka.webp" ] && ok "heal: 2 отсутствующих восстановлены" || bad "heal первый прогон: $R1"
R2=$($PHP -r "require '$ROOT/backend/src/SystemFiles.php'; echo count(SystemFiles::heal('$FAKE'));")
[ "$R2" = "0" ] && ok "heal: идемпотентен (повтор — 0)" || bad "heal повтор: $R2"
rm "$FAKE/uploads/snowflake/snowflake.svg"
R3=$($PHP -r "require '$ROOT/backend/src/SystemFiles.php'; print_r(SystemFiles::heal('$FAKE'));")
echo "$R3" | grep -q "snowflake/snowflake.svg" && ok "heal: точечно дописывает утраченный файл" || bad "heal повторный: $R3"

echo "── 3. API-тесты (:8026) ──"
PORT=8026; BASE="http://127.0.0.1:$PORT/api"; LOG=/tmp/t118-php.log
CJ=/tmp/t118-cookies.txt
export PHP_CLI_SERVER_WORKERS=8
pkill -f "127.0.0.1:$PORT" 2>/dev/null; sleep 1
( setsid "$PHP" -S 127.0.0.1:$PORT backend/public/index.php >"$LOG" 2>&1 & )
for i in $(seq 1 30); do curl -s "$BASE/health" | grep -q ok && break; sleep 0.3; done
curl -s "$BASE/health" | grep -q ok && ok "сервер :$PORT поднялся" || bad "сервер не поднялся"

LOGIN=$(curl -s -c "$CJ" -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d '{"email":"admin@lakomka.local","password":"Lakomka2026!"}')
[ -n "$(jget "$LOGIN" "data.token")" ] && ok "админ залогинен" || bad "логин: $LOGIN"

UP="$ROOT/public/uploads"
SRC_JPG=$(ls "$UP"/products/*/*.jpg 2>/dev/null | head -1)
[ -z "$SRC_JPG" ] && SRC_JPG=$(ls "$UP"/products/*/*.webp 2>/dev/null | head -1)
[ -n "$SRC_JPG" ] || { bad "нет исходной картинки в uploads"; echo "── ИТОГ: PASS=$PASS FAIL=$FAIL ──"; exit 1; }
mkdir -p "$UP/products/test-unused-118"
cp "$SRC_JPG" "$UP/products/test-unused-118/junk118.jpg"

# unused: junk виден, системные файлы — нет
U=$(curl -s -b "$CJ" "$BASE/admin/files/unused")
echo "$U" | grep -q "test-unused-118/junk118.jpg" && ok "unused видит непривязанный junk" || bad "junk не в списке"
for f in "snowflake/snowflake.svg" "brand/logo-lakomka.webp" "ico-step1.svg" "ico-step2.svg" "ico-step3.svg" "process-bg.png"; do
  echo "$U" | grep -q "\"$f\"" && bad "системный $f попал в unused!" || ok "unused скрывает $f"
done

# unused-purge: системные файлы отклоняются, на диске целы
P=$(curl -s -b "$CJ" -X POST "$BASE/admin/files/unused-purge" -H "Content-Type: application/json" -d '{"paths":["snowflake/snowflake.svg","brand/logo-lakomka.webp","ico-step1.svg","ico-step2.svg","ico-step3.svg","process-bg.png","products/test-unused-118/junk118.jpg"]}')
[ "$(jget "$P" "data.deleted")" = "1" ] && [ "$(jget "$P" "data.skipped")" = "6" ] && ok "purge: 1 junk убран, 6 системных пропущено" || bad "purge: $P"
[ -f "$UP/snowflake/snowflake.svg" ] && [ -f "$UP/brand/logo-lakomka.webp" ] && [ -f "$UP/ico-step1.svg" ] && [ -f "$UP/process-bg.png" ] && ok "системные файлы целы на диске" || bad "системные файлы пострадали"

# точечное delete: файл и вся папка — отказ
D1=$(curl -s -o /tmp/t118-d1.json -w '%{http_code}' -b "$CJ" -X POST "$BASE/admin/files/delete" -H "Content-Type: application/json" -d '{"path":"media/snowflake/snowflake.svg"}')
[ "$D1" = "403" ] && [ -f "$UP/snowflake/snowflake.svg" ] && ok "delete снежинки → 403, файл цел" || bad "delete файла: $D1 $(cat /tmp/t118-d1.json)"
D2=$(curl -s -o /tmp/t118-d2.json -w '%{http_code}' -b "$CJ" -X POST "$BASE/admin/files/delete" -H "Content-Type: application/json" -d '{"path":"media/snowflake"}')
[ "$D2" = "403" ] && [ -d "$UP/snowflake" ] && ok "delete папки snowflake → 403 (referredInside)" || bad "delete папки: $D2 $(cat /tmp/t118-d2.json)"

# junk из корзины добить, аноним 401
curl -s -b "$CJ" -X POST "$BASE/admin/files/delete" -H "Content-Type: application/json" -d '{"path":"media/.trash/PLACEHOLDER"}' > /dev/null 2>&1
TR=$(ls -t "$UP/.trash" 2>/dev/null | head -1); [ -n "$TR" ] && grep -q "test-unused-118" "$UP/.trash/$TR/meta.json" 2>/dev/null && curl -s -b "$CJ" -X POST "$BASE/admin/files/delete" -H "Content-Type: application/json" -d "{\"path\":\"media/.trash/$TR\"}" > /dev/null
rm -rf "$UP/products/test-unused-118"
A=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/files/unused")
[ "$A" = "401" ] && ok "анонимный unused → 401" || bad "аноним: $A"

pkill -f "127.0.0.1:$PORT" 2>/dev/null
echo "── ИТОГ: PASS=$PASS FAIL=$FAIL ──"
[ "$FAIL" = "0" ]
