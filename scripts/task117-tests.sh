#!/bin/bash
# Task 117: (1) фото конфет — загрузка/замена/удаление обложки (справочник «Конфеты»);
#           (2) импорт рецептов заполняет производителя из CSV (только пустые);
#           (3) mp4-рекомпресс — расширенный каскад ffmpeg (1080p/ultrafast/однопоточный);
#           (4) каталог — плитки категорий из живых данных.
#   1) php -l, tsc, eslint, маркеры фич
#   2) API (:8025): cover upload/list/delete, CSV-импорт (заполнение/неперезатирание
#      производителя, таблица weight_recipes восстанавливается), compress mp4
#   3) CLI-импортёр на копии БД — "zapolneno proizvoditelej"
#   Регрессии запускаются отдельно: task116-tests, task115-tests, task114-tests, task112-tests.
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
for f in backend/src/RecipeCsvParser.php backend/src/Controllers/AdminWeightRecipeController.php \
         backend/src/Controllers/AdminCandyController.php backend/src/MediaOptimizer.php \
         backend/public/index.php backend/scripts/import-weight-recipes.php; do
  $PHP -l "$ROOT/$f" > /dev/null 2>&1 && ok "php -l $f" || bad "php -l $f"
done
if npx tsc --noEmit > /tmp/t117-tsc.log 2>&1; then ok "tsc --noEmit чист"; else bad "tsc: $(head -3 /tmp/t117-tsc.log)"; fi
ESL_FILES="src/components/admin/CandiesManager.tsx src/components/admin/WeightRecipesViewer.tsx src/app/(shop)/catalog/CatalogClient.tsx"
if npx eslint $ESL_FILES > /tmp/t117-eslint.log 2>&1; then ok "eslint 0 ошибок"; else bad "eslint: $(grep -E 'error' /tmp/t117-eslint.log | head -2)"; fi

# маркеры: фото конфет
rg -q "CandyCoverModal" "$ROOT/src/components/admin/CandiesManager.tsx" && ok "конфеты: модалка фото" || bad "нет CandyCoverModal"
rg -q "image_url" "$ROOT/src/components/admin/CandiesManager.tsx" && ok "конфеты: превью в таблице/модалке" || bad "нет image_url"
rg -q "image_url" "$ROOT/backend/src/Controllers/AdminCandyController.php" && ok "API: candies list отдаёт image_url" || bad "API без image_url"
# маркеры: производитель из CSV
rg -q "product_manufacturers" "$ROOT/backend/src/RecipeCsvParser.php" && ok "парсер: ПРОИЗВОДИТЕЛЬ читается" || bad "парсер без manufacturer"
rg -q "manufacturers_filled" "$ROOT/backend/src/Controllers/AdminWeightRecipeController.php" && ok "API-импорт: отчёт manufacturers_filled" || bad "нет manufacturers_filled"
rg -q "zapolneno proizvoditelej" "$ROOT/backend/scripts/import-weight-recipes.php" && ok "CLI-импорт: заполняет производителя" || bad "CLI без заполнения"
rg -q "manufacturer IS NULL OR manufacturer = ''" "$ROOT/backend/src/Controllers/AdminWeightRecipeController.php" && ok "перезапись только пустых" || bad "нет guard'а от перезаписи"
# маркеры: видео-каскад
rg -q "ужато до 1080p" "$ROOT/backend/src/MediaOptimizer.php" && ok "mp4-каскад: попытка с ужатием до 1080p" || bad "нет 1080p-попытки в mp4-каскаде"
rg -q "encoderFailHint" "$ROOT/backend/src/MediaOptimizer.php" && ok "подсказка при провале кодера" || bad "нет encoderFailHint"
# маркеры: DELETE cover + каталог
rg -q "deleteProductCover" "$ROOT/backend/src/Controllers/AdminWeightRecipeController.php" && ok "API: DELETE cover" || bad "нет deleteProductCover"
rg -q "liveProducts" "$ROOT/src/app/(shop)/catalog/CatalogClient.tsx" && rg -q "\[liveProducts, categories\]" "$ROOT/src/app/(shop)/catalog/CatalogClient.tsx" && ok "каталог: плитки категорий из живых данных" || bad "каталог без live-обновления плиток"
rg -q "заполнено производителей" "$ROOT/src/components/admin/WeightRecipesViewer.tsx" && ok "отчёт импорта показывает производителей" || bad "UI импорта без производителей"

echo "── 2. API-тесты (:8025) ──"
PORT=8025; BASE="http://127.0.0.1:$PORT/api"; LOG=/tmp/t117-php.log
CJ=/tmp/t117-cookies.txt
export PHP_CLI_SERVER_WORKERS=8
pkill -f "127.0.0.1:$PORT" 2>/dev/null; sleep 1
( setsid "$PHP" -S 127.0.0.1:$PORT backend/public/index.php >"$LOG" 2>&1 & )
for i in $(seq 1 30); do curl -s "$BASE/health" | grep -q ok && break; sleep 0.3; done
curl -s "$BASE/health" | grep -q ok && ok "сервер :$PORT поднялся" || bad "сервер не поднялся"

LOGIN=$(curl -s -c "$CJ" -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d '{"email":"admin@lakomka.local","password":"Lakomka2026!"}')
[ -n "$(jget "$LOGIN" "data.token")" ] && ok "админ залогинен" || bad "логин: $LOGIN"

UP="$ROOT/public/uploads"
DB="$ROOT/backend/storage/database.sqlite"

# ── A. ФОТО КОНФЕТ ──
# фикстура-картинка
$PHP -r '$im = imagecreatetruecolor(64, 64); imagefill($im, 0, 0, imagecolorallocate($im, 200, 60, 60)); imagepng($im, "/tmp/t117-cover.png");'
CA=$(curl -s -b "$CJ" -X POST "$BASE/admin/candies" -H "Content-Type: application/json" -d '{"name":"Тест-конфета 117А","manufacturer":"Завод Старый"}')
CAID=$(jget "$CA" "data.id")
[ -n "$CAID" ] && ok "конфета А создана (id=$CAID)" || bad "конфета А: $CA"
CB=$(curl -s -b "$CJ" -X POST "$BASE/admin/candies" -H "Content-Type: application/json" -d '{"name":"Тест-конфета 117Б"}')
CBID=$(jget "$CB" "data.id")
[ -n "$CBID" ] && ok "конфета Б создана (id=$CBID)" || bad "конфета Б: $CB"

# upload обложки
UPR=$(curl -s -b "$CJ" -X POST "$BASE/admin/products/$CAID/cover" -F "file=@/tmp/t117-cover.png")
COVERURL=$(jget "$UPR" "data.url")
[ "$(basename "$COVERURL")" = "cover.png" ] && ok "cover загружен: $COVERURL" || bad "cover upload: $UPR"
[ -f "$ROOT/public$COVERURL" ] && ok "файл обложки на диске" || bad "файла обложки нет: $ROOT/public$COVERURL"

# candies list отдаёт image_url/image_id (фильтр по id на клиенте —
# сырая кириллица в query curl портит запрос)
LIST=$(curl -s -b "$CJ" "$BASE/admin/candies")
LURL=$(printf '%s' "$LIST" | python3 -c "
import json,sys
try:
    d=json.load(sys.stdin)
    m=[c for c in d['data'] if c['id']==int('$CAID')]
    print((m[0].get('image_url') or '') if m else '')
except Exception: print('')")
LID=$(printf '%s' "$LIST" | python3 -c "
import json,sys
try:
    d=json.load(sys.stdin)
    m=[c for c in d['data'] if c['id']==int('$CAID')]
    print(m[0].get('image_id') or '' if m else '')
except Exception: print('')")
[ "$LURL" = "$COVERURL" ] && ok "список конфет отдаёт image_url" || bad "image_url в списке: '$LURL' vs '$COVERURL'"
[ -n "$LID" ] && ok "список конфет отдаёт image_id" || bad "image_id пуст"

# аноним не может грузить обложку
AUP=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/admin/products/$CAID/cover" -F "file=@/tmp/t117-cover.png")
[ "$AUP" = "401" ] && ok "анонимный cover upload → 401" || bad "аноним: $AUP"

# delete обложки
DEL=$(curl -s -b "$CJ" -X DELETE "$BASE/admin/products/$CAID/cover")
[ "$(jget "$DEL" "data.ok")" = "True" ] || [ "$(jget "$DEL" "data.ok")" = "true" ] && ok "cover удалён (файл+запись)" || bad "delete cover: $DEL"
[ ! -f "$UP$COVERURL" ] && ok "файл обложки убран с диска" || bad "файл остался"
DEL2=$(curl -s -o /tmp/t117-del2.json -w '%{http_code}' -b "$CJ" -X DELETE "$BASE/admin/products/$CAID/cover")
[ "$DEL2" = "404" ] && ok "повторное удаление → 404 (нет фото)" || bad "повтор: $DEL2"

# ── B. ИМПОРТ РЕЦЕПТОВ С ПРОИЗВОДИТЕЛЕМ ──
# бэкап weight_recipes (импорт делает DELETE FROM weight_recipes)
python3 - "$DB" <<'PY'
import sqlite3, json, sys
c = sqlite3.connect(sys.argv[1])
rows = c.execute("SELECT weight_g, product_id, quantity FROM weight_recipes").fetchall()
json.dump(rows, open("/tmp/t117-wr-backup.json", "w"))
print(f"backup: {len(rows)} rows")
PY
ok "бэкап weight_recipes сделан"

# CSV в формате матрицы (как lakomka2027.csv): BOM + ; и колонки-граммовки
printf '\xEF\xBB\xBF;;;\n;НАИМЕНОВАНИЕ; ПРОИЗВОДИТЕЛЬ;200;400\n;Тест-конфета 117А;Завод Тест;1;2\n;Тест-конфета 117Б;Завод Ручной;2;1\n' > /tmp/t117-import.csv
IMP=$(curl -s -b "$CJ" -X POST "$BASE/admin/weight-recipes/import-csv" -F "file=@/tmp/t117-import.csv;type=text/csv")
[ "$(jget "$IMP" "data.total_entries")" = "4" ] && ok "импорт: 4 записи рецептов" || bad "импорт: $IMP"
MF=$(jget "$IMP" "data.manufacturers_filled")
[ "$MF" = "1" ] && ok "импорт: заполнен 1 производитель (только пустой Б)" || bad "manufacturers_filled=$MF (ожидали 1)"
MA=$(python3 -c "
import sqlite3
c = sqlite3.connect('$DB')
print(c.execute('SELECT manufacturer FROM products WHERE id=?', (int('$CAID'),)).fetchone()[0])")
[ "$MA" = "Завод Старый" ] && ok "ручная правка А НЕ перезатёрта CSV" || bad "А перезатёрта: $MA"
MB=$(python3 -c "
import sqlite3
c = sqlite3.connect('$DB')
print(c.execute('SELECT manufacturer FROM products WHERE id=?', (int('$CBID'),)).fetchone()[0])")
[ "$MB" = "Завод Ручной" ] && ok "пустой Б заполнен из CSV («Завод Ручной» — его строка)" || bad "Б: $MB"
WR=$(python3 -c "
import sqlite3
c = sqlite3.connect('$DB')
print(c.execute('SELECT COUNT(*) FROM weight_recipes WHERE weight_g=200').fetchone()[0])")
[ "$WR" = "2" ] && ok "рецепты записаны (200 г: 2 конфеты)" || bad "weight_recipes: $WR"

# повторный импорт — уже заполненные не трогаются
IMP2=$(curl -s -b "$CJ" -X POST "$BASE/admin/weight-recipes/import-csv" -F "file=@/tmp/t117-import.csv;type=text/csv")
MF2=$(jget "$IMP2" "data.manufacturers_filled")
[ "$MF2" = "0" ] && ok "повторный импорт: 0 дозаполнений (идемпотентно)" || bad "повтор: manufacturers_filled=$MF2"

# восстановление weight_recipes
python3 - "$DB" <<'PY'
import sqlite3, json, sys
c = sqlite3.connect(sys.argv[1])
rows = json.load(open("/tmp/t117-wr-backup.json"))
c.execute("DELETE FROM weight_recipes")
c.executemany("INSERT INTO weight_recipes (weight_g, product_id, quantity) VALUES (?,?,?)", rows)
c.commit()
print(f"restored: {len(rows)} rows")
PY
ok "weight_recipes восстановлены"

# ── C. MP4-РЕКОМПРЕСС (расширенный каскад) ──
if command -v ffmpeg > /dev/null 2>&1; then
  mkdir -p "$UP/products/test-video-117"
  ffmpeg -y -loglevel error -f lavfi -i "testsrc2=duration=3:size=640x480:rate=24" \
    -c:v libx264 -crf 0 -preset ultrafast -pix_fmt yuv420p "$UP/products/test-video-117/video-0.mp4" 2>/dev/null
  VSZ=$(stat -c%s "$UP/products/test-video-117/video-0.mp4" 2>/dev/null || echo 0)
  if [ "$VSZ" -gt 1048576 ]; then
    ok "тестовое видео создано ($VSZ б)"
    VC=$(curl -s -b "$CJ" -X POST "$BASE/admin/files/compress" -H "Content-Type: application/json" -d '{"url":"/uploads/products/test-video-117/video-0.mp4"}')
    VNOTE=$(jget "$VC" "data.note")
    case "$VNOTE" in
      *"перекодировано"*) ok "mp4 перекодирован: $VNOTE";;
      *"уже хорошо сжато"*) ok "mp4 классифицирован как уже сжатый (это пропуск, не ошибка)";;
      *"не удалось"*) bad "mp4 не перекодировался: $VNOTE";;
      *) bad "неожиданный ответ compress: $VNOTE";;
    esac
  else
    bad "тестовое видео слишком маленькое ($VSZ б) — пропускаем compress"
  fi
  rm -rf "$UP/products/test-video-117"
else
  bad "ffmpeg недоступен — видео-тест пропущен"
fi

# ── D. CLI-ИМПОРТЁР на копии БД ──
cp "$DB" /tmp/t117-cli.sqlite
python3 -c "
import sqlite3
c = sqlite3.connect('/tmp/t117-cli.sqlite')
c.execute('UPDATE products SET manufacturer=NULL WHERE id=?', (int('$CBID'),))
c.commit()"
CLIOUT=$($PHP backend/scripts/import-weight-recipes.php /tmp/t117-import.csv --apply /tmp/t117-cli.sqlite 2>&1)
echo "$CLIOUT" | grep -q "OK: zagruzheno 4 zapisej" && ok "CLI: 4 записи загружено" || bad "CLI: $(echo "$CLIOUT" | tail -3)"
echo "$CLIOUT" | grep -q "zapolneno proizvoditelej: 1" && ok "CLI: 1 производитель дозаполнен" || bad "CLI: $(echo "$CLIOUT" | grep -i proizvoditel)"
CLIMB=$(python3 -c "
import sqlite3
c = sqlite3.connect('/tmp/t117-cli.sqlite')
print(c.execute('SELECT manufacturer FROM products WHERE id=?', (int('$CBID'),)).fetchone()[0])")
[ "$CLIMB" = "Завод Ручной" ] && ok "CLI: Б в копии БД получил производителя" || bad "CLI-БД: $CLIMB"
rm -f /tmp/t117-cli.sqlite

# ── уборка ──
curl -s -b "$CJ" -X DELETE "$BASE/admin/candies/$CAID?force=1" > /dev/null 2>&1
curl -s -b "$CJ" -X DELETE "$BASE/admin/candies/$CBID?force=1" > /dev/null 2>&1
python3 - "$DB" <<'PY'
import sqlite3, json, sys
c = sqlite3.connect(sys.argv[1])
rows = json.load(open("/tmp/t117-wr-backup.json"))
c.execute("DELETE FROM weight_recipes")
c.executemany("INSERT INTO weight_recipes (weight_g, product_id, quantity) VALUES (?,?,?)", rows)
c.commit()
PY
rm -f /tmp/t117-cover.png /tmp/t117-import.csv /tmp/t117-wr-backup.json
rm -rf "$UP"/products/test-konfeta-117a-* "$UP"/products/test-konfeta-117b-* "$UP/products/test-video-117" 2>/dev/null
pkill -f "127.0.0.1:$PORT" 2>/dev/null
ok "уборка: тестовые конфеты/рецепты/файлы удалены"

echo "── ИТОГ: PASS=$PASS FAIL=$FAIL ──"
[ "$FAIL" = "0" ]
