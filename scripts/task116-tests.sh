#!/bin/bash
# Task 116: починка битых ссылок на картинки + безопасный «Неиспользуемые» +
#            самовосстановление SmartImg + защита от одинаковых имён.
#   1) php -l, tsc, eslint, маркеры фич
#   2) API (:8024): compress-image (конвертация, честный 404 без
#      cross-конвертации чужих 0.jpg), fix-image-refs (fixed/lost),
#      unused (pdfs и настройки витрины защищены), unused-purge → корзина,
#      аноним 401
#   Регрессии запускаются отдельно: task114-tests, task115-tests, task112-tests.
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
for f in backend/src/Controllers/AdminFilesController.php backend/public/index.php; do
  $PHP -l "$ROOT/$f" > /dev/null 2>&1 && ok "php -l $f" || bad "php -l $f"
done
if npx tsc --noEmit > /tmp/t116-tsc.log 2>&1; then ok "tsc --noEmit чист"; else bad "tsc: $(head -3 /tmp/t116-tsc.log)"; fi
ESL_FILES="src/components/ui/SmartImg.tsx src/components/admin/MassMediaOptimizer.tsx src/components/admin/FilesManager.tsx"
if npx eslint $ESL_FILES > /tmp/t116-eslint.log 2>&1; then ok "eslint 0 ошибок"; else bad "eslint: $(grep -E 'error' /tmp/t116-eslint.log | head -2)"; fi

rg -q "fix-image-refs" "$ROOT/backend/public/index.php" && ok "маршрут fix-image-refs" || bad "нет маршрута"
rg -q "fixImageRefs" "$ROOT/backend/src/Controllers/AdminFilesController.php" && ok "контроллер fixImageRefs" || bad "нет fixImageRefs"
rg -q "multiDir" "$ROOT/backend/src/Controllers/AdminFilesController.php" && ok "locateUploaded: защита от одинаковых имён" || bad "нет multiDir"
rg -q "IMG_FALLBACK_EXTS" "$ROOT/src/components/ui/SmartImg.tsx" && ok "SmartImg: фолбэк расширений" || bad "SmartImg без фолбэка"
rg -q "Починить ссылки на картинки" "$ROOT/src/components/admin/MassMediaOptimizer.tsx" && ok "кнопка «Починить ссылки»" || bad "нет кнопки починки"
rg -q "Убрать в корзину" "$ROOT/src/components/admin/FilesManager.tsx" && ok "unused-purge → корзина (UI)" || bad "UI не обновлён"
rg -q "pdfs/" "$ROOT/backend/src/Controllers/AdminFilesController.php" && rg -q "hero_slides" "$ROOT/backend/src/Controllers/AdminFilesController.php" && ok "unused: pdfs/ и настройки витрины защищены" || bad "защиты unused нет"

echo "── 2. API-тесты (:8024) ──"
PORT=8024; BASE="http://127.0.0.1:$PORT/api"; LOG=/tmp/t116-php.log
CJ=/tmp/t116-cookies.txt
export PHP_CLI_SERVER_WORKERS=8
pkill -f "127.0.0.1:$PORT" 2>/dev/null; sleep 1
( setsid "$PHP" -S 127.0.0.1:$PORT backend/public/index.php >"$LOG" 2>&1 & )
for i in $(seq 1 30); do curl -s "$BASE/health" | grep -q ok && break; sleep 0.3; done
curl -s "$BASE/health" | grep -q ok && ok "сервер :$PORT поднялся" || bad "сервер не поднялся"

LOGIN=$(curl -s -c "$CJ" -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d '{"email":"admin@lakomka.local","password":"Lakomka2026!"}')
[ -n "$(jget "$LOGIN" "data.token")" ] && ok "админ залогинен" || bad "логин: $LOGIN"

UP="$ROOT/public/uploads"
# Task 130: фикстура самодостаточна — генерируем настоящий JPEG через GD.
# Раньше брали «первую попавшуюся» картинку из products/, но после массовой
# конвертации в webp там не осталось jpg вовсе, а тестовый прогон мог
# подложить и мусор (ASCII-заглушки от разведочных скриптов).
SRC_JPG=/tmp/t116-src.jpg
$PHP -r '$im = imagecreatetruecolor(240, 180); imagefill($im, 0, 0, imagecolorallocate($im, 200, 60, 60)); imagejpeg($im, $argv[1], 92);' "$SRC_JPG" 2>/dev/null
if [ ! -s "$SRC_JPG" ]; then SRC_JPG=$(ls "$UP"/products/*/*.jpg 2>/dev/null | head -1); fi
[ -n "$SRC_JPG" ] || { bad "нет исходной картинки (GD не сгенерировал)"; echo "── ИТОГ: PASS=$PASS FAIL=$FAIL ──"; exit 1; }
mkdir -p "$UP/products/test-a-116" "$UP/products/test-b-116" "$UP/products/test-unused-116"
cp "$SRC_JPG" "$UP/products/test-a-116/0.jpg"
cp "$SRC_JPG" "$UP/products/test-b-116/0.jpg"
cp "$SRC_JPG" "$UP/products/test-unused-116/hero.jpg"
cp "$SRC_JPG" "$UP/products/test-unused-116/junk.jpg"
cp "$SRC_JPG" "$UP/pdfs/test-cover-116.jpg" 2>/dev/null || { mkdir -p "$UP/pdfs"; cp "$SRC_JPG" "$UP/pdfs/test-cover-116.jpg"; }
ok "фикстуры: test-a-116/0.jpg + test-b-116/0.jpg + unused-файлы"

# тестовый товар (если slug остался от прежнего прогона — используем его)
CREATED=$(curl -s -b "$CJ" -X POST "$BASE/admin/products" -H "Content-Type: application/json" \
  -d '{"name":"Тест-конфета 116","slug":"test-candy-116","type":"simple","price_kopecks":10000,"is_published":0}')
PID=$(printf '%s' "$CREATED" | python3 -c "
import json,sys
try:
    d=json.load(sys.stdin)
    print(d['data']['id'])
except Exception: print('')")
if [ -z "$PID" ]; then
  PLIST=$(curl -s -b "$CJ" "$BASE/admin/products?filter=all")
  PID=$(printf '%s' "$PLIST" | python3 -c "
import json,sys
try:
    d=json.load(sys.stdin)
    m=[p['id'] for p in d['data'] if p.get('slug')=='test-candy-116']
    print(m[0] if m else '')
except Exception: print('')")
fi
[ -n "$PID" ] && ok "тестовый товар готов (id=$PID)" || bad "товар не создался: $CREATED"
python3 - "$ROOT/backend/storage/database.sqlite" "$PID" <<'PY'
import sqlite3, sys
c = sqlite3.connect(sys.argv[1])
c.execute("DELETE FROM product_images WHERE product_id=? AND url='/uploads/products/test-a-116/0.jpg'", (int(sys.argv[2]),))
c.execute("INSERT INTO product_images (product_id,url,media_type,sort_order) VALUES (?,?,'image',0)", (int(sys.argv[2]), "/uploads/products/test-a-116/0.jpg"))
c.commit()
PY
IID=$(python3 -c "
import sqlite3
c = sqlite3.connect('$ROOT/backend/storage/database.sqlite')
r = c.execute('SELECT id FROM product_images WHERE product_id=? AND url=?', (int('$PID'),'/uploads/products/test-a-116/0.jpg')).fetchone()
print(r[0] if r else '')")
[ -n "$IID" ] && ok "картинка привязана (row id=$IID)" || bad "привязка не создалась"

# ── TEST 1: конвертация A/0.jpg → webp, ссылки переписаны
R1=$(curl -s -b "$CJ" -X POST "$BASE/admin/files/compress-image" -H "Content-Type: application/json" -d '{"url":"/uploads/products/test-a-116/0.jpg"}')
[ "$(jget "$R1" "data.ok")" = "True" ] || [ "$(jget "$R1" "data.ok")" = "true" ] && ok "compress-image A/0.jpg → ok" || bad "compress-image: $R1"
[ -f "$UP/products/test-a-116/0.webp" ] && [ ! -f "$UP/products/test-a-116/0.jpg" ] && ok "на диске: 0.webp есть, 0.jpg удалён" || bad "диск после конвертации неверный"
DBURL=$(python3 -c "
import sqlite3
c = sqlite3.connect('$ROOT/backend/storage/database.sqlite')
print(c.execute('SELECT url FROM product_images WHERE id=?', (int('$IID'),)).fetchone()[0])")
[ "$DBURL" = "/uploads/products/test-a-116/0.webp" ] && ok "БД переписана на .webp" || bad "БД: $DBURL"

# ── TEST 2 (ГЛАВНЫЙ): повтор по несуществующему A/0.jpg → 404, БЕЗ чужой конвертации
R2=$(curl -s -o /tmp/t116-r2.json -w '%{http_code}' -b "$CJ" -X POST "$BASE/admin/files/compress-image" -H "Content-Type: application/json" -d '{"url":"/uploads/products/test-a-116/0.jpg"}')
[ "$R2" = "404" ] && ok "повтор по отсутствующему файлу → честный 404" || bad "ожидали 404, получили $R2: $(cat /tmp/t116-r2.json)"
[ -f "$UP/products/test-b-116/0.jpg" ] && ok "чужой test-b-116/0.jpg НЕ тронут (одинаковое имя)" || bad "cross-конвертация чужого файла!"
[ ! -f "$UP/products/test-b-116/0.webp" ] && ok "у test-b-116 не появилось webp" || bad "webp у чужого файла"

# ── TEST 3: доконвертация — база смотрит на .webp, на диске только .jpg
rm -f "$UP/products/test-a-116/0.webp"
cp "$UP/products/test-b-116/0.jpg" "$UP/products/test-a-116/0.jpg"
python3 -c "
import sqlite3
c = sqlite3.connect('$ROOT/backend/storage/database.sqlite')
c.execute('UPDATE product_images SET url=? WHERE id=?', ('/uploads/products/test-a-116/0.webp', int('$IID')))
c.commit()"
R3=$(curl -s -b "$CJ" -X POST "$BASE/admin/files/fix-image-refs" -H "Content-Type: application/json" -d '{}')
[ "$(jget "$R3" "data.ok")" = "True" ] || [ "$(jget "$R3" "data.ok")" = "true" ] && ok "fix-image-refs отвечает" || bad "fix: $R3"
DBURL2=$(python3 -c "
import sqlite3
c = sqlite3.connect('$ROOT/backend/storage/database.sqlite')
print(c.execute('SELECT url FROM product_images WHERE id=?', (int('$IID'),)).fetchone()[0])")
[ "$DBURL2" = "/uploads/products/test-a-116/0.webp" ] && ok "ссылка осталась на .webp (доконвертировано)" || bad "после fix: $DBURL2"
[ -f "$UP/products/test-a-116/0.webp" ] && [ ! -f "$UP/products/test-a-116/0.jpg" ] && ok "webp создан из jpg, jpg удалён" || bad "диск после доконвертации"
echo "$R3" | grep -q "test-a-116/0.webp" && ok "в отчёте: создан 0.webp" || bad "отчёт без 0.webp"

# ── TEST 3b: retarget — база смотрит на .jpg, на диске только .png
"$PHP" -r '$im = imagecreatetruecolor(8, 8); imagepng($im, $argv[1]);' "$UP/products/test-a-116/2.png"
rm -f "$UP/products/test-a-116/0.webp" 2>/dev/null
python3 -c "
import sqlite3
c = sqlite3.connect('$ROOT/backend/storage/database.sqlite')
c.execute('UPDATE product_images SET url=? WHERE id=?', ('/uploads/products/test-a-116/2.jpg', int('$IID')))
c.commit()"
R3B=$(curl -s -b "$CJ" -X POST "$BASE/admin/files/fix-image-refs" -H "Content-Type: application/json" -d '{}')
DBURL3B=$(python3 -c "
import sqlite3
c = sqlite3.connect('$ROOT/backend/storage/database.sqlite')
print(c.execute('SELECT url FROM product_images WHERE id=?', (int('$IID'),)).fetchone()[0])")
[ "$DBURL3B" = "/uploads/products/test-a-116/2.png" ] && ok "нет jpg-исходника → ссылка переписана на .png" || bad "после retarget: $DBURL3B"
echo "$R3B" | grep -q "test-a-116/2.png" && ok "в отчёте fixed: → 2.png" || bad "fixed без 2.png"
rm -f "$UP/products/test-a-116/2.png"
# возвращаем ссылку и файл 0.webp (после TEST 3)
cp "$UP/products/test-b-116/0.jpg" "$UP/products/test-a-116/tmp.jpg" 2>/dev/null
"$PHP" -r '$im = imagecreatetruecolor(8, 8); imagewebp($im, $argv[1]);' "$UP/products/test-a-116/0.webp"
rm -f "$UP/products/test-a-116/tmp.jpg"
python3 -c "
import sqlite3
c = sqlite3.connect('$ROOT/backend/storage/database.sqlite')
c.execute('UPDATE product_images SET url=? WHERE id=?', ('/uploads/products/test-a-116/0.webp', int('$IID')))
c.commit()"

# ── TEST 4: потерянный файл → в lost, ссылка не трогается
python3 -c "
import sqlite3
c = sqlite3.connect('$ROOT/backend/storage/database.sqlite')
c.execute('UPDATE product_images SET url=? WHERE id=?', ('/uploads/products/test-a-116/9.webp', int('$IID')))
c.commit()"
R4=$(curl -s -b "$CJ" -X POST "$BASE/admin/files/fix-image-refs" -H "Content-Type: application/json" -d '{}')
echo "$R4" | grep -q "9.webp" && ok "потерянная ссылка в lost-списке" || bad "lost пуст: $R4"
DBURL3=$(python3 -c "
import sqlite3
c = sqlite3.connect('$ROOT/backend/storage/database.sqlite')
print(c.execute('SELECT url FROM product_images WHERE id=?', (int('$IID'),)).fetchone()[0])")
[ "$DBURL3" = "/uploads/products/test-a-116/9.webp" ] && ok "потерянную ссылку сервер не угадывает (осталась как была)" || bad "потерянная ссылка изменена: $DBURL3"

# ── TEST 5: unused — junk виден, pdfs/обложка и hero (настройка) спрятаны
python3 -c "
import sqlite3
c = sqlite3.connect('$ROOT/backend/storage/database.sqlite')
row = c.execute(\"SELECT value FROM settings WHERE key='hero_image'\").fetchone()
open('/tmp/t116-hero.bak','w').write(row[0] if row else '')
c.execute(\"INSERT INTO settings (key,value) VALUES ('hero_image','/uploads/products/test-unused-116/hero.jpg') ON CONFLICT(key) DO UPDATE SET value=excluded.value\")
c.commit()"
U=$(curl -s -b "$CJ" "$BASE/admin/files/unused")
echo "$U" | grep -q "test-unused-116/junk.jpg" && ok "unused видит непривязанный junk.jpg" || bad "junk не в списке"
echo "$U" | grep -q "pdfs/test-cover-116.jpg" && bad "обложка pdfs попала в unused (опасно!)" || ok "обложки pdfs/ не считаются мусором"
echo "$U" | grep -q "test-unused-116/hero.jpg" && bad "hero-файл из настроек попал в unused!" || ok "файл из settings.hero_image защищён"
python3 -c "
import sqlite3
c = sqlite3.connect('$ROOT/backend/storage/database.sqlite')
v = open('/tmp/t116-hero.bak').read()
c.execute(\"UPDATE settings SET value=? WHERE key='hero_image'\", (v,))
c.commit()"

# ── TEST 6: unused-purge → в КОРЗИНУ (не unlink)
TRDIR="$ROOT/backend/storage/trash"  # аудит 131: корзина в приватном хранилище
TRBEFORE=$(ls "$TRDIR" 2>/dev/null | sort | md5sum)
P6=$(curl -s -b "$CJ" -X POST "$BASE/admin/files/unused-purge" -H "Content-Type: application/json" -d '{"paths":["products/test-unused-116/junk.jpg","pdfs/test-cover-116.jpg"]}')
[ "$(jget "$P6" "data.deleted")" = "1" ] && ok "unused-purge: 1 файл убран (pdfs — пропущен)" || bad "purge: $P6"
[ ! -f "$UP/products/test-unused-116/junk.jpg" ] && [ -f "$UP/pdfs/test-cover-116.jpg" ] && ok "junk исчез, pdfs на месте" || bad "диск после purge"
TR=$(ls "$TRDIR" 2>/dev/null | sort | md5sum)
[ "$TRBEFORE" != "$TR" ] && TRITEM=$(comm -13 <(ls "$TRDIR" 2>/dev/null | sort) <(ls "$TRDIR" 2>/dev/null | sort)) || TRITEM=""
NEWTR=$(diff <(echo "$TRBEFORE") <(echo "$TR") >/dev/null && echo "" || ls -t "$TRDIR" | head -1)
[ -n "$NEWTR" ] && grep -q "test-unused-116" "$TRDIR/$NEWTR/meta.json" && ok "файл в корзине (storage/trash) с meta.json (восстановимо)" || bad "корзина не содержит файл"

# ── TEST 7: аноним → 401
A7=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/admin/files/fix-image-refs" -H "Content-Type: application/json" -d '{}')
[ "$A7" = "401" ] && ok "анонимный fix-image-refs → 401" || bad "аноним: $A7"

# ── уборка
curl -s -b "$CJ" -X DELETE "$BASE/admin/products/$PID" > /dev/null 2>&1
python3 -c "
import sqlite3
c = sqlite3.connect('$ROOT/backend/storage/database.sqlite')
c.execute('DELETE FROM product_images WHERE product_id=?', (int('$PID'),))
c.execute('DELETE FROM products WHERE id=?', (int('$PID'),))
c.commit()"
rm -rf "$UP/products/test-a-116" "$UP/products/test-b-116" "$UP/products/test-unused-116" "$UP/pdfs/test-cover-116.jpg"

pkill -f "127.0.0.1:$PORT" 2>/dev/null
ok "уборка: тестовые файлы и товар удалены"

echo "── ИТОГ: PASS=$PASS FAIL=$FAIL ──"
[ "$FAIL" = "0" ]
