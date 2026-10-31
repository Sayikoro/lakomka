#!/usr/bin/env bash
# Тесты Task 89: двойные слеши и кириллица в конвейере файлового менеджера.
# Гипотеза владельца «двойной слеш из-за кириллицы» проверяется полным циклом:
#   УРОВЕНЬ 0 (миграция 003): унаследованные битые ссылки «/uploads//…»
#             вычищаются из product_images/products.video_url одним запуском
#             DbMigrations (тройные «///» — тоже), внешние https:// не тронуты.
#   УРОВЕНЬ 1 (API :8013): кириллическая папка «Мои наборы 2026», файлы
#             «Клип №1.mov» и «Жирный клип.mp4» → загрузка → переименование →
#             привязка → «Сжать»: нигде не появляется «//», всё работает
#             как с латиницей.
#   Кейс «унаследованная битая ссылка»: compress по «/uploads//Мои наборы 2026/…»
#             сжимает файл и переписывает БИТЫЕ записи в базе (raw+norm).
#   Регресс Task 87 кейс A: битая ссылка + готовый mp4 на диске → «уже
#             перекодировано», ссылки чинятся.
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
PHP="$(command -v php || true)"
[ -z "$PHP" ] && [ -x "$ROOT/.ztools/php" ] && PHP="$ROOT/.ztools/php"
[ -z "$PHP" ] && [ -x "$ROOT/../.ztools/php" ] && PHP="$ROOT/../.ztools/php"
[ -n "$PHP" ] || { echo "php не найден"; exit 1; }
PORT=8013
BASE="http://127.0.0.1:$PORT/api"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  OK  $1"; }
bad()  { FAIL=$((FAIL+1)); echo "FAIL  $1"; }
check(){ if [ "$1" = "$2" ]; then ok "$3"; else bad "$3 (ожидалось '$2', получено '$1')"; fi; }
true_ok(){ if [ "$(echo "${1:-}" | tr 'A-Z' 'a-z')" = "true" ]; then ok "$2"; else bad "$2 (получено '${1:-}')"; fi; }
nz_ok(){ if [ -n "${1:-}" ]; then ok "$2"; else bad "$2 (получено пусто)"; fi; }
jget(){ python3 -c "
import json,sys
try:
    d=json.load(sys.stdin)
    for k in sys.argv[1].split('.'):
        d=d[int(k)] if k.lstrip('-').isdigit() else d[k]
    print(d)
except Exception:
    print('')" "$1" 2>/dev/null; }
mkmov(){ # $1=выход $2=[lossless|big]
  case "${2:-}" in
    lossless) V=(-qp 0 -preset ultrafast);;
    big)      ffmpeg -y -loglevel error -f lavfi -i mandelbrot=size=480x360:rate=12 \
              -f lavfi -i sine=frequency=440:duration=2 -t 2 -c:v libx264 -qp 0 -preset ultrafast \
              -pix_fmt yuv420p -c:a aac -shortest -f mov "$1" && return 0;;
    *)        V=(-crf 23);;
  esac
  ffmpeg -y -loglevel error -f lavfi -i testsrc=duration=1:size=320x240:rate=12 \
         -f lavfi -i sine=frequency=440:duration=1 \
         -c:v libx264 "${V[@]}" -pix_fmt yuv420p -c:a aac -shortest -f mov "$1"
}
mkdir -p /tmp/t89

echo "── УРОВЕНЬ 0. Миграция 003: чистка унаследованных «//» ──"
# Чистим остатки прошлых прогонов и сбрасываем 003 — эмулируем сайт
# со старой базой, на которую только что установили обновление
$PHP -r '
$pdo = new PDO("sqlite:backend/storage/database.sqlite");
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$pdo->exec("DELETE FROM schema_migrations WHERE version = \"003_fix_double_slash_urls.sql\"");
$pdo->exec("DELETE FROM product_images WHERE url LIKE \"%//%\"");
$pdo->exec("UPDATE products SET video_url = NULL WHERE video_url LIKE \"%//%\" AND video_url LIKE \"/uploads/%\"");
$pdo->exec("DELETE FROM products WHERE name IN (\"Тест 89 миграция\", \"Тест 89 кириллица\")");
echo "reset\n";
' >/tmp/t89-reset.log 2>&1 || { cat /tmp/t89-reset.log; echo "reset не прошёл"; exit 1; }
rm -rf "$ROOT/public/uploads/Мои наборы 2026" "public/uploads/loc89"
ok "остатки прошлых прогонов вычищены, 003 сброшена"
$PHP -r '
$pdo = new PDO("sqlite:backend/storage/database.sqlite");
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$pdo->prepare("INSERT INTO products (name, slug, type) VALUES (?, ?, ?)")->execute(["Тест 89 миграция", "test-89-migraciya-" . bin2hex(random_bytes(3)), "simple"]);
$pid = (int)$pdo->lastInsertId();
file_put_contents("/tmp/t89-pid", (string)$pid);
$ins = $pdo->prepare("INSERT INTO product_images (product_id, url, media_type) VALUES (?, ?, ?)");
$ins->execute([$pid, "/uploads//Миграция//тест.mov", "video"]);        // два «//»
$ins->execute([$pid, "/uploads/media//sub/фото.jpg", "image"]);        // «//» в середине
$ins->execute([$pid, "/uploads///тройной/файл.mov", "video"]);         // тройной
$ins->execute([$pid, "https://cdn.example//x.mp4", "video"]);          // внешняя — НЕ трогать
$pdo->prepare("UPDATE products SET video_url = ? WHERE id = ?")->execute(["/uploads//видео//тест.mp4", $pid]);
echo "seeded\n";
' >/tmp/t89-seed.log 2>&1 || { cat /tmp/t89-seed.log; echo "Не удалось сесть данные"; exit 1; }
ok "битые ссылки засеяны (2×//, ///, внешняя https)"

APPLIED=$($PHP -r '
require_once "backend/src/DbMigrations.php";
$pdo = new PDO("sqlite:backend/storage/database.sqlite");
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$res = DbMigrations::run($pdo);
echo in_array("003_fix_double_slash_urls.sql", $res["applied"], true) ? "yes" : "no:" . implode(",", $res["applied"]);
' 2>/tmp/t89-mig.log)
check "$APPLIED" "yes" "миграция 003 применена"

LEFT=$($PHP -r '
$pdo = new PDO("sqlite:backend/storage/database.sqlite");
$pid = (int)file_get_contents("/tmp/t89-pid");
$n = (int)$pdo->query("SELECT COUNT(*) FROM product_images WHERE product_id = $pid AND url LIKE \"/uploads/%\" AND url LIKE \"%//%\"")->fetchColumn();
$n += (int)$pdo->query("SELECT COUNT(*) FROM products WHERE id = $pid AND video_url LIKE \"/uploads/%\" AND video_url LIKE \"%//%\"")->fetchColumn();
echo $n;')
check "$LEFT" "0" "после миграции битых «/uploads/…//…» ссылок не осталось"

KEPT=$($PHP -r '
$pdo = new PDO("sqlite:backend/storage/database.sqlite");
$pid = (int)file_get_contents("/tmp/t89-pid");
echo $pdo->query("SELECT COUNT(*) FROM product_images WHERE product_id = $pid AND url = \"https://cdn.example//x.mp4\"")->fetchColumn();
$u = $pdo->query("SELECT url FROM product_images WHERE product_id = $pid AND url LIKE \"/uploads/media/%\"")->fetchColumn();
echo $u === "/uploads/media/sub/фото.jpg" ? "ok" : "bad:" . $u;')
check "$KEPT" "1ok" "внешняя https:// не тронута; «/uploads/media//sub/фото.jpg» → «/uploads/media/sub/фото.jpg»"

echo "── УРОВЕНЬ 1. Кириллица в файловом менеджере (API :$PORT) ──"
pkill -f "php.*127.0.0.1:$PORT" 2>/dev/null; sleep 1
( setsid "$PHP" -S 127.0.0.1:$PORT backend/public/index.php >/tmp/t89-php.log 2>&1 & )
UP=0
for i in $(seq 1 30); do
  curl -s -m 2 "$BASE/health" | grep -q '"ok"' && UP=1 && break
  sleep 0.5
done
check "$UP" "1" "PHP-бэкенд поднялся на :$PORT"

TOKEN=$("$PHP" -r 'require_once "backend/src/Auth.php"; echo Auth::issueToken(2, "admin@lakomka.local", "super_admin");')
[ -n "$TOKEN" ] && ok "токен выдан" || { bad "токен пустой"; exit 1; }
AUTH="Authorization: Bearer $TOKEN"
CT="Content-Type: application/json"

PROD=$(curl -s -X POST "$BASE/admin/products" -H "$AUTH" -H "$CT" -d '{"name":"Тест 89 кириллица","type":"simple"}')
PID89=$(echo "$PROD" | jget data.id)
[ -n "$PID89" ] && ok "тестовый товар id=$PID89" || { bad "товар не создан"; exit 1; }

# A. Кириллическая папка
MK=$(curl -s -X POST "$BASE/admin/files/mkdir" -H "$AUTH" -H "$CT" -d '{"path":"media","name":"Мои наборы 2026"}')
MKPATH=$(echo "$MK" | jget data.path)
check "$MKPATH" "media/Мои наборы 2026" "mkdir кириллической папки — path без «//»"
[ -d "public/uploads/Мои наборы 2026" ] && ok "папка на диске" || bad "папки нет на диске"

# B. Кириллический MOV (h264+aac — remux в mp4 без перекодирования)
mkmov "/tmp/t89/Клип №1.mov"
[ -s "/tmp/t89/Клип №1.mov" ] && ok "MOV «Клип №1.mov» создан" || { bad "ffmpeg не создал видео"; exit 1; }

# C. Загрузка: chunk → upload
B64=$(base64 -w0 "/tmp/t89/Клип №1.mov")
CH=$(jq -n --arg b "$B64" '{upload_id:"up-t89-cyr-01", chunk_index:0, total_chunks:1, filename:"Клип №1.mov", chunk_base64:$b}')
CU=$(curl -s -X POST "$BASE/admin/upload/chunk" -H "$AUTH" -H "$CT" -d "$CH")
FP=$(echo "$CU" | jget data.file_name)
[ -n "$FP" ] && ok "chunk принят" || { bad "chunk не принят: $CU"; exit 1; }

UP=$(jq -n --arg fp "$FP" '{file_path:$fp, original_name:"Клип №1.mov", target:"media/Мои наборы 2026"}' | curl -s -X POST "$BASE/admin/files/upload" -H "$AUTH" -H "$CT" -d @-)
UPURL=$(echo "$UP" | jget data.url)
# «№» санитайзится в «_» (небуквенно-цифровые символы → _) — так спроектировано;
# кириллица, пробелы и точки сохраняются как есть
check "$UPURL" "/uploads/Мои наборы 2026/Клип _1.mp4" "загрузка: url чистый, mov→mp4 без «//» (№→_ в имени)"
[ -s "public/uploads/Мои наборы 2026/Клип _1.mp4" ] && ok "файл на диске с кириллическим именем" || bad "файла нет на диске"

# D. Переименование в media (Task 93): СВОБОДНЫЙ файл (ещё не привязан)
# переименовать МОЖНО, а привязанный — нельзя (403, защита ссылок).
# Сначала качели «переименовали → вернули», после attach — проверка 403.
RNMED=$(jq -n --arg p "media/Мои наборы 2026/Клип _1.mp4" '{path:$p, name:"Клип _1 (свободный).mp4"}' | curl -s -X POST "$BASE/admin/files/rename" -H "$AUTH" -H "$CT" -d @-)
true_ok "$(echo "$RNMED" | jget data.ok)" "rename в media СВОБОДНОГО файла разрешён (Task 93)"
RNBACK=$(jq -n --arg p "media/Мои наборы 2026/Клип _1 _свободный_.mp4" '{path:$p, name:"Клип _1.mp4"}' | curl -s -X POST "$BASE/admin/files/rename" -H "$AUTH" -H "$CT" -d @-)
true_ok "$(echo "$RNBACK" | jget data.ok)" "...и обратное переименование тоже"

MK2=$(curl -s -X POST "$BASE/admin/files/mkdir" -H "$AUTH" -H "$CT" -d '{"path":"exports","name":"Архивы 2026"}')
check "$(echo "$MK2" | jget data.path)" "exports/Архивы 2026" "mkdir кириллической папки в exports"
B64E=$(base64 -w0 "/tmp/t89/Клип №1.mov")
CH2=$(jq -n --arg b "$B64E" '{upload_id:"up-t89-cyr-02", chunk_index:0, total_chunks:1, filename:"Клип №1.mov", chunk_base64:$b}')
FP2=$(curl -s -X POST "$BASE/admin/upload/chunk" -H "$AUTH" -H "$CT" -d "$CH2" | jget data.file_name)
UP2=$(jq -n --arg fp "$FP2" '{file_path:$fp, original_name:"Клип №1.mov", target:"exports/Архивы 2026"}' | curl -s -X POST "$BASE/admin/files/upload" -H "$AUTH" -H "$CT" -d @-)
# в exports оптимизатор НЕ работает (только media): mov останется mov, «№»→«_»
RN2=$(jq -n --arg p "exports/Архивы 2026/Клип _1.mov" '{path:$p, name:"Клип №2 (финал).mov"}' | curl -s -X POST "$BASE/admin/files/rename" -H "$AUTH" -H "$CT" -d @-)
check "$(echo "$RN2" | jget data.path)" "exports/Архивы 2026/Клип _2 _финал_.mov" "rename с кириллицей/№/скобками в exports"
[ -s "public/exports/Архивы 2026/Клип _2 _финал_.mov" ] && ok "переименованный файл на диске" || bad "после rename файла нет на диске"

# E. Привязка к товару — Task 92: видео ПЕРЕЕЗЖАЕТ в папку товара
AT=$(jq -n --arg u "/uploads/Мои наборы 2026/Клип _1.mp4" '{url:$u}' | curl -s -X POST "$BASE/admin/products/$PID89/media/attach" -H "$AUTH" -H "$CT" -d @-)
nz_ok "$(echo "$AT" | jget data.id)" "attach по кириллическому url (data.id в ответе)"
DBURL=$("$PHP" -r '$pdo=new PDO("sqlite:backend/storage/database.sqlite");
  echo $pdo->query("SELECT url FROM product_images WHERE product_id=".(int)$argv[1])->fetchColumn();' "$PID89")
SLUG89=$("$PHP" -r '$pdo=new PDO("sqlite:backend/storage/database.sqlite");
  echo $pdo->query("SELECT slug FROM products WHERE id=".(int)$argv[1])->fetchColumn();' "$PID89")
check "$DBURL" "/uploads/products/$SLUG89/Клип _1.mp4" "видео переехало в папку товара, ссылка в БД чистая (без «//»)"
[ ! -f "public/uploads/Мои наборы 2026/Клип _1.mp4" ] && ok "в папке видео файла больше нет (перенос)" || bad "файл остался в папке видео"
[ -s "public/uploads/products/$SLUG89/Клип _1.mp4" ] && ok "файл лежит в папке товара" || bad "файла в папке товара нет"
# теперь файл referenced — rename обязан отклониться (защита ссылок)
RNREF=$(jq -n --arg p "media/products/$SLUG89/Клип _1.mp4" '{path:$p, name:"взлом.mp4"}' | curl -s -X POST "$BASE/admin/files/rename" -H "$AUTH" -H "$CT" -d @-)
echo "$RNREF" | grep -q "используется" && ok "rename ПРИВЯЗАННОГО файла в media — 403 (защита ссылок)" || bad "referenced-файл переименован?! $RNREF"

# F. «Сжать» чистого URL: крупный LOSSLESS (>1 МБ порога компрессии)
mkmov "/tmp/t89/Жирный клип.mp4" big
mv "/tmp/t89/Жирный клип.mp4" "public/uploads/Мои наборы 2026/Жирный клип.mp4"
SZ=$(stat -c%s "public/uploads/Мои наборы 2026/Жирный клип.mp4")
[ "$SZ" -gt 1000000 ] && ok "LOSSLESS «Жирный клип.mp4» на диске ($SZ байт > 1 МБ)" || { bad "lossless меньше 1 МБ ($SZ) — порог компрессии не пройти"; exit 1; }
AT2=$(jq -n --arg u "/uploads/Мои наборы 2026/Жирный клип.mp4" '{url:$u}' | curl -s -X POST "$BASE/admin/products/$PID89/media/attach" -H "$AUTH" -H "$CT" -d @-)
nz_ok "$(echo "$AT2" | jget data.id)" "attach lossless mp4 (data.id в ответе)"
# Task 92: файл уже в папке товара → compress работает с новым URL
FATURL=$("$PHP" -r '$pdo=new PDO("sqlite:backend/storage/database.sqlite");
  echo $pdo->query("SELECT url FROM product_images WHERE product_id=".(int)$argv[1]." AND url LIKE \"%Жирный клип%\"")->fetchColumn();' "$PID89")
CM=$(jq -n --arg u "$FATURL" '{url:$u}' | curl -s -X POST "$BASE/admin/files/compress" -H "$AUTH" -H "$CT" -d @-)
true_ok "$(echo "$CM" | jget data.ok)" "compress кириллического видео (перекодирование)"
CMURL=$(echo "$CM" | jget data.url)
check "$CMURL" "/uploads/products/$SLUG89/Жирный клип.mp4" "имя после сжатия не меняется, файл в папке товара, «//» нет"
DBURL2=$("$PHP" -r '$pdo=new PDO("sqlite:backend/storage/database.sqlite");
  echo $pdo->query("SELECT url FROM product_images WHERE product_id=".(int)$argv[1]." AND url LIKE \"%Жирный клип%\"")->fetchColumn();' "$PID89")
check "$DBURL2" "$CMURL" "после сжатия ссылка в БД = url из ответа"
[ -s "public/uploads/products/$SLUG89/Жирный клип.mp4" ] && ok "сжатый файл на диске (в папке товара)" || bad "сжатого файла нет на диске"

# G. Унаследованная битая ссылка: «//» в БД, compress по битому URL чинит базу
mkmov "/tmp/t89/Старый клип.mov"
mv "/tmp/t89/Старый клип.mov" "public/uploads/Мои наборы 2026/Старый клип.mov"
[ -s "public/uploads/Мои наборы 2026/Старый клип.mov" ] && ok "второй mov на диске" || { bad "ffmpeg не создал второй mov"; exit 1; }
BIT="/uploads//Мои наборы 2026/Старый клип.mov"
"$PHP" -r '$pdo=new PDO("sqlite:backend/storage/database.sqlite");
  $p=$pdo->prepare("INSERT INTO product_images (product_id, url, media_type) VALUES (?, ?, \"video\")");
  $p->execute([(int)$argv[1], $argv[2]]);
  $pdo->prepare("UPDATE products SET video_url = ? WHERE id = ?")->execute([$argv[2], (int)$argv[1]]);' "$PID89" "$BIT" >/dev/null
ok "битая ссылка «/uploads//…» вставлена в product_images + products.video_url"

CM2=$(jq -n --arg u "$BIT" '{url:$u}' | curl -s -X POST "$BASE/admin/files/compress" -H "$AUTH" -H "$CT" -d @-)
true_ok "$(echo "$CM2" | jget data.ok)" "compress по БИТОМУ url сработал (нормализация на входе)"
CM2URL=$(echo "$CM2" | jget data.url)
case "$CM2URL" in
  *"//"*) bad "в ответе url с «//»: $CM2URL";;
  *) ok "ответ чистый: $CM2URL";;
esac
REFS=$(echo "$CM2" | jget data.refs_updated)
check "$REFS" "2" "переписаны ОБЕ битые записи (product_images + video_url)"
BADLEFT=$("$PHP" -r '$pdo=new PDO("sqlite:backend/storage/database.sqlite");
  echo $pdo->query("SELECT COUNT(*) FROM product_images WHERE url LIKE \"%//%\" AND url LIKE \"/uploads/%\"")->fetchColumn()
      + $pdo->query("SELECT COUNT(*) FROM products WHERE video_url LIKE \"%//%\" AND video_url LIKE \"/uploads/%\"")->fetchColumn();')
check "$BADLEFT" "0" "битых ссылок в БД после сжатия не осталось"

echo "── Регресс Task 87 кейс A: «уже перекодировано» + битые ссылки ──"
mkdir -p public/uploads/loc89
ffmpeg -y -loglevel error -f lavfi -i testsrc=duration=1:size=320x240:rate=12 \
       -f lavfi -i sine=frequency=440:duration=1 \
       -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest -f mp4 public/uploads/loc89/KAM_v012.mp4
BIT2="/uploads//KAM_v012.mov"
"$PHP" -r '$pdo=new PDO("sqlite:backend/storage/database.sqlite");
  $p=$pdo->prepare("INSERT INTO product_images (product_id, url, media_type) VALUES (?, ?, \"video\")");
  $p->execute([(int)$argv[1], $argv[2]]);
  $pdo->prepare("UPDATE products SET video_url = ? WHERE id = ?")->execute([$argv[2], (int)$argv[1]]);' "$PID89" "$BIT2" >/dev/null
CM3=$(jq -n --arg u "$BIT2" '{url:$u}' | curl -s -X POST "$BASE/admin/files/compress" -H "$AUTH" -H "$CT" -d @-)
CM3NOTE=$(echo "$CM3" | jget data.note)
CM3URL=$(echo "$CM3" | jget data.url)
CM3REFS=$(echo "$CM3" | jget data.refs_updated)
echo "$CM3NOTE" | grep -q "уже" && ok "ветка «уже перекодировано»: $CM3NOTE" || bad "не «уже перекодировано»: $CM3NOTE"
check "$CM3URL" "/uploads/loc89/KAM_v012.mp4" "найден готовый mp4 (Task 87)"
check "$CM3REFS" "2" "битые ссылки переписаны (raw+norm)"
BADLEFT2=$("$PHP" -r '$pdo=new PDO("sqlite:backend/storage/database.sqlite");
  echo $pdo->query("SELECT COUNT(*) FROM product_images WHERE url LIKE \"%//%\" AND url LIKE \"/uploads/%\"")->fetchColumn()
      + $pdo->query("SELECT COUNT(*) FROM products WHERE video_url LIKE \"%//%\" AND video_url LIKE \"/uploads/%\"")->fetchColumn();')
check "$BADLEFT2" "0" "битых ссылок в БД не осталось"

echo "── Уборка ──"
# media — раздел «только просмотр» для API-удаления (защита ссылок),
# тестовые папки снимаем с диска напрямую
rm -rf "public/uploads/Мои наборы 2026" "public/uploads/loc89" "public/exports/Архивы 2026"
[ -d "public/uploads/Мои наборы 2026" ] && bad "тестовая папка не удалена" || ok "тестовые папки удалены"
"$PHP" -r '$pdo=new PDO("sqlite:backend/storage/database.sqlite");
  $pid=(int)$argv[1];
  $pdo->exec("DELETE FROM product_images WHERE product_id=".$pid);
  $pdo->exec("DELETE FROM products WHERE id=".$pid);
  $mig=(int)$pdo->query("SELECT id FROM products WHERE name=\"Тест 89 миграция\"")->fetchColumn();
  if ($mig) { $pdo->exec("DELETE FROM product_images WHERE product_id=".$mig); $pdo->exec("DELETE FROM products WHERE id=".$mig); }' "$PID89" >/dev/null
ok "тестовые записи из БД удалены"

echo "════════════════════════════════"
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ] || exit 1
pkill -f "php.*127.0.0.1:$PORT" 2>/dev/null || true
exit 0
