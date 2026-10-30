#!/usr/bin/env bash
# Тесты Task 87: «Сжать» при отсутствующем файле по точному пути.
# Кейсы: файл уже перекодирован ранее (mov → найден mp4, ссылки обновлены),
# файл в другой папке (поиск по дереву), файла нет нигде (понятный 404),
# обычное сжатие по точному пути (регресс), URL с двойным слэшем из базы.
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
PHP="$(command -v php || true)"
[ -z "$PHP" ] && [ -x "$ROOT/.ztools/php" ] && PHP="$ROOT/.ztools/php"
[ -z "$PHP" ] && [ -x "$ROOT/../.ztools/php" ] && PHP="$ROOT/../.ztools/php"
[ -n "$PHP" ] || { echo "php не найден"; exit 1; }
PORT=8012
BASE="http://127.0.0.1:$PORT/api"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  OK  $1"; }
bad()  { FAIL=$((FAIL+1)); echo "FAIL  $1"; }
check(){ if [ "$1" = "$2" ]; then ok "$3"; else bad "$3 (ожидалось '$2', получено '$1')"; fi; }
has(){ echo "$1" | grep -q "$2" && ok "$3" || bad "$3 (нет '$2' в: $1)"; }

echo "── 1. Подготовка ──"
pkill -f "php.*127.0.0.1:$PORT" 2>/dev/null; sleep 1
( setsid "$PHP" -S 127.0.0.1:$PORT backend/public/index.php >/tmp/t87-php.log 2>&1 & )
UP=0
for i in $(seq 1 30); do
  curl -s -m 2 "$BASE/health" | grep -q '"ok"' && UP=1 && break
  sleep 0.5
done
check "$UP" "1" "PHP-бэкенд поднялся на :$PORT"

TOKEN=$("$PHP" -r 'require_once "backend/src/Auth.php"; echo Auth::issueToken(2, "admin@lakomka.local", "super_admin");')
[ -n "$TOKEN" ] && ok "токен выдан" || { bad "токен пустой"; exit 1; }
AUTH="Authorization: Bearer $TOKEN"

rm -rf public/uploads/loc87; mkdir -p public/uploads/loc87
# настоящий mp4 (для кейса «уже перекодировано») и настоящий mov (для поиска/регресса)
ffmpeg -y -loglevel error -f lavfi -i testsrc=duration=1:size=320x240:rate=12 \
       -f lavfi -i sine=frequency=440:duration=1 \
       -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest -f mp4 public/uploads/loc87/KAM_v012.mp4
ffmpeg -y -loglevel error -f lavfi -i testsrc=duration=1:size=320x240:rate=12 \
       -f lavfi -i sine=frequency=440:duration=1 \
       -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest -f mov public/uploads/loc87/moved.mov
ffmpeg -y -loglevel error -f lavfi -i testsrc=duration=1:size=320x240:rate=12 \
       -f lavfi -i sine=frequency=440:duration=1 \
       -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest -f mov public/uploads/loc87/normal.mov
[ -s public/uploads/loc87/KAM_v012.mp4 ] && [ -s public/uploads/loc87/moved.mov ] && ok "видео созданы" || { bad "ffmpeg не создал видео"; exit 1; }

PROD=$(curl -s -X POST "$BASE/admin/products" -H "$AUTH" -H "Content-Type: application/json" -d '{"name":"Тест 87 резолвинг","type":"simple"}')
PID=$("$PHP" -r '$d=json_decode($argv[1],true); echo $d["data"]["id"]??"";' "$PROD")
[ -n "$PID" ] && ok "тестовый товар id=$PID" || { bad "товар не создан"; exit 1; }

bind() { # $1=product_id $2=url — как в реальной базе (product_images + products.video_url)
  "$PHP" -r '$pdo=new PDO("sqlite:backend/storage/database.sqlite");
    $pdo->prepare("INSERT INTO product_images (product_id, url, alt, media_type, sort_order) VALUES (?, ?, NULL, \"video\", 0)")->execute([$argv[1], $argv[2]]);
    $pdo->prepare("UPDATE products SET video_url = ? WHERE id = ?")->execute([$argv[2], $argv[1]]);' "$1" "$2"
}
urls() { # $1=product_id → urls из базы
  "$PHP" -r '$pdo=new PDO("sqlite:backend/storage/database.sqlite");
    $a=$pdo->query("SELECT url FROM product_images WHERE product_id=".$argv[1])->fetchAll(PDO::FETCH_COLUMN);
    $v=$pdo->query("SELECT video_url FROM products WHERE id=".$argv[1])->fetchColumn();
    echo implode("|", $a)." ".$v;' "$1"
}
compress() { # $1=url → JSON
  curl -s -m 300 -X POST "$BASE/admin/files/compress" -H "$AUTH" -H "Content-Type: application/json" -d "{\"url\":\"$1\"}"
}

echo "── 2. Кейс A: просили mov, на диске уже mp4 (двойной слэш из базы) ──"
bind "$PID" "/uploads//KAM_v012.mov"   # битая ссылка — как у пользователя
R=$(compress "/uploads//KAM_v012.mov")
has "$R" '"ok":true' "A1: успех"
has "$R" '/uploads/loc87/KAM_v012.mp4' "A2: найден готовый mp4"
has "$R" 'уже' "A3: note «уже перекодировано»"
has "$R" '"refs_updated":2' "A4: обе ссылки обновлены"
U=$(urls "$PID")
has "$U" '/uploads/loc87/KAM_v012.mp4' "A5: в базе теперь mp4-ссылка"
echo "$U" | grep -q '//' && bad "A6: в базе остался двойной слэш" || ok "A6: двойной слэш вычищен"

echo "── 3. Кейс B: файл в другой папке (поиск по дереву) ──"
bind "$PID" "/uploads/moved.mov"       # ссылка «забыла» про подпапку
R=$(compress "/uploads/moved.mov")
has "$R" '"ok":true' "B1: успех"
has "$R" '/uploads/loc87/moved.mp4' "B2: файл найден в loc87 и перекодирован"
[ -s public/uploads/loc87/moved.mp4 ] && ok "B3: mp4 на диске" || bad "B3: mp4 нет на диске"
[ -f public/uploads/loc87/moved.mov ] && bad "B4: исходный mov должен быть удалён" || ok "B4: исходный mov удалён"
CODEC=$(ffmpeg -hide_banner -i public/uploads/loc87/moved.mp4 2>&1 | grep -o 'Video: [a-z0-9]*' | head -1)
check "$CODEC" "Video: h264" "B5: кодек web-safe"
U=$(urls "$PID")
has "$U" '/uploads/loc87/moved.mp4' "B6: ссылки в базе переписаны на новую папку"

echo "── 4. Кейс C: файла нет нигде ──"
bind "$PID" "/uploads/ghost.mov"
R=$(compress "/uploads/ghost.mov")
has "$R" 'не найден в /uploads' "C1: понятная ошибка"
echo "$R" | grep -q 'ffmpeg' && bad "C2: техношум ffmpeg не должен попадать в ответ" || ok "C2: без техношума ffmpeg"
U=$(urls "$PID")
has "$U" '/uploads/ghost.mov' "C3: ссылки не тронуты"

echo "── 5. Кейс D: обычное сжатие по точному пути (регресс) ──"
bind "$PID" "/uploads/loc87/normal.mov"
R=$(compress "/uploads/loc87/normal.mov")
has "$R" '"ok":true' "D1: успех"
has "$R" 'без потери качества' "D2: ремукс"
U=$(urls "$PID")
has "$U" '/uploads/loc87/normal.mp4' "D3: ссылка обновлена"

echo "── 6. Уборка ──"
DEL=$(curl -s -X DELETE "$BASE/admin/products/$PID" -H "$AUTH")
has "$DEL" '"ok":true' "товар удалён"
LEFT=$("$PHP" -r '$pdo=new PDO("sqlite:backend/storage/database.sqlite");
  echo $pdo->query("SELECT COUNT(*) FROM product_images WHERE product_id IN (SELECT id FROM products WHERE name LIKE \"Тест 87%\")")->fetchColumn();')
check "$LEFT" "0" "хвостов в базе нет"
rm -rf public/uploads/loc87

echo ""
echo "════════ ИТОГ: PASS=$PASS FAIL=$FAIL ════════"
[ "$FAIL" = "0" ]
