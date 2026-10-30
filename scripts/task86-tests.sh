#!/usr/bin/env bash
# Тесты Task 86: каскад перекодирования через API POST /api/admin/files/compress.
# Кейсы: iPhone-подобный MOV с timecode-дорожкой (бывший источник ошибки
# «не удалось перекодировать»), HEVC (транскод), битый файл (реальная
# причина ffmpeg в ответе).
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
PHP="$(command -v php || true)"
[ -z "$PHP" ] && [ -x "$ROOT/.ztools/php" ] && PHP="$ROOT/.ztools/php"
[ -z "$PHP" ] && [ -x "$ROOT/../.ztools/php" ] && PHP="$ROOT/../.ztools/php"
[ -n "$PHP" ] || { echo "php не найден"; exit 1; }
PORT=8011
BASE="http://127.0.0.1:$PORT/api"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  OK  $1"; }
bad()  { FAIL=$((FAIL+1)); echo "FAIL  $1"; }
check(){ if [ "$1" = "$2" ]; then ok "$3"; else bad "$3 (ожидалось '$2', получено '$1')"; fi; }

echo "── 1. Подготовка ──"
pkill -f "php.*127.0.0.1:$PORT" 2>/dev/null; sleep 1
( setsid "$PHP" -S 127.0.0.1:$PORT backend/public/index.php >/tmp/t86-php.log 2>&1 & )
UP=0
for i in $(seq 1 30); do
  curl -s -m 2 "$BASE/health" | grep -q '"ok"' && UP=1 && break
  sleep 0.5
done
check "$UP" "1" "PHP-бэкенд поднялся на :$PORT"

TOKEN=$("$PHP" -r 'require_once "backend/src/Auth.php"; echo Auth::issueToken(2, "admin@lakomka.local", "super_admin");')
[ -n "$TOKEN" ] && ok "токен выдан" || { bad "токен пустой"; exit 1; }
AUTH="Authorization: Bearer $TOKEN"

mkdir -p public/uploads/media-test-86
# iPhone-подобный mov: h264+aac+timecode (ремукс №1 падает на tmcd, №2 должен взять)
ffmpeg -y -loglevel error -f lavfi -i testsrc=duration=2:size=640x360:rate=24 \
       -f lavfi -i sine=frequency=440:duration=2 \
       -c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 128k -timecode 00:00:00:00 \
       -f mov public/uploads/media-test-86/iphone-clip.mov
# HEVC (ремукс в mp4 технически возможен, но браузеры не играют → транскод)
ffmpeg -y -loglevel error -f lavfi -i testsrc=duration=2:size=640x360:rate=24 \
       -f lavfi -i sine=frequency=440:duration=2 \
       -c:v libx265 -preset ultrafast -pix_fmt yuv420p -tag:v hvc1 -c:a aac \
       -f mov public/uploads/media-test-86/hevc-clip.mov
# битый файл
printf 'not-a-video-at-all' > public/uploads/media-test-86/broken.mov
[ -s public/uploads/media-test-86/iphone-clip.mov ] && ok "MOV созданы (iphone-clip, hevc-clip, broken)" || bad "ffmpeg не создал MOV"

PROD=$(curl -s -X POST "$BASE/admin/products" -H "$AUTH" -H "Content-Type: application/json" -d '{"name":"Тест 86 каскад","type":"simple"}')
PID=$("$PHP" -r '$d=json_decode($argv[1],true); echo $d["data"]["id"]??"";' "$PROD")
[ -n "$PID" ] && ok "тестовый товар id=$PID" || { bad "товар не создан"; exit 1; }

attach() { # $1=файл
  "$PHP" -r '$pdo=new PDO("sqlite:backend/storage/database.sqlite");
    $pdo->prepare("INSERT INTO product_images (product_id, url, alt, media_type, sort_order) VALUES (?, ?, NULL, \"video\", 0)")->execute([$argv[1], "/uploads/media-test-86/".$argv[2]]);
    $pdo->prepare("UPDATE products SET video_url = ? WHERE id = ?")->execute(["/uploads/media-test-86/".$argv[2], $argv[1]]);' "$PID" "$1"
}

compress() { # $1=файл → JSON
  curl -s -m 300 -X POST "$BASE/admin/files/compress" -H "$AUTH" -H "Content-Type: application/json" -d "{\"url\":\"/uploads/media-test-86/$1\"}"
}

echo "── 2. iPhone-MOV с timecode → должен взяться ремуксом ──"
attach iphone-clip.mov
RES=$(compress iphone-clip.mov)
echo "$RES" | head -c 350; echo
NOTE=$("$PHP" -r '$d=json_decode($argv[1],true); echo $d["data"]["note"]??($d["error"]??"");' "$RES")
OKF=$("$PHP" -r '$d=json_decode($argv[1],true); echo isset($d["data"]["ok"])?"1":"0";' "$RES")
check "$OKF" "1" "сжатие прошло (раньше падало с «не удалось перекодировать»)"
case "$NOTE" in *"без потери качества"*) ok "метод: ремукс ($NOTE)";; *) bad "не ремукс: $NOTE";; esac
REFS=$("$PHP" -r '$d=json_decode($argv[1],true); echo $d["data"]["refs_updated"]??0;' "$RES")
check "$REFS" "2" "привязки переписаны"
[ -f public/uploads/media-test-86/iphone-clip.mp4 ] && [ ! -f public/uploads/media-test-86/iphone-clip.mov ] \
  && ok "iphone-clip.mp4 на диске, mov удалён" || bad "файлы не заменены"
CODEC=$(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of csv=p=0 public/uploads/media-test-86/iphone-clip.mp4 2>/dev/null)
check "$CODEC" "h264" "кодек итога — h264"

echo "── 3. HEVC MOV → должен перекодироваться в H.264 ──"
attach hevc-clip.mov
RES=$(compress hevc-clip.mov)
echo "$RES" | head -c 350; echo
NOTE=$("$PHP" -r '$d=json_decode($argv[1],true); echo $d["data"]["note"]??($d["error"]??"");' "$RES")
OKF=$("$PHP" -r '$d=json_decode($argv[1],true); echo isset($d["data"]["ok"])?"1":"0";' "$RES")
check "$OKF" "1" "HEVC сжат"
case "$NOTE" in *"перекодировано в H.264"*) ok "метод: транскод ($NOTE)";; *) bad "не транскод: $NOTE";; esac
CODEC=$(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of csv=p=0 public/uploads/media-test-86/hevc-clip.mp4 2>/dev/null)
check "$CODEC" "h264" "HEVC → h264 (играет во всех браузерах)"

echo "── 4. Битый файл → отказ С РЕАЛЬНОЙ ПРИЧИНОЙ ──"
attach broken.mov
RES=$(compress broken.mov)
ERR=$("$PHP" -r '$d=json_decode($argv[1],true); echo $d["error"]??"";' "$RES")
echo "  ответ: $ERR"
[ -f public/uploads/media-test-86/broken.mov ] && ok "битый файл НЕ тронут" || bad "битый файл удалён (!!)"
case "$ERR" in *"ffmpeg:"*) ok "причина от ffmpeg показана админу";; *) bad "без причины: $ERR";; esac

echo "── 5. Уборка ──"
curl -s -X DELETE "$BASE/admin/products/$PID" -H "$AUTH" > /dev/null
LEFT=$("$PHP" -r '$pdo=new PDO("sqlite:backend/storage/database.sqlite"); echo $pdo->query("SELECT COUNT(*) FROM product_images WHERE url LIKE \"%media-test-86%\"")->fetchColumn();')
check "$LEFT" "0" "тестовых привязок не осталось"
rm -rf public/uploads/media-test-86
pkill -f "php.*127.0.0.1:$PORT" 2>/dev/null

echo
echo "ИТОГО: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
