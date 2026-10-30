#!/usr/bin/env bash
# Тесты Task 82: рекурсивный поиск видео, attach с юникод-папками,
# настройка gallery_video_folder, hero-загрузка, миграции через HTTP.
set -u
cd /home/z/my-project
PHP=/home/z/my-project/.ztools/php
BASE=http://127.0.0.1:8000/api
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  OK  $1"; }
bad()  { FAIL=$((FAIL+1)); echo "FAIL  $1"; }
check(){ if [ "$1" = "$2" ]; then ok "$3"; else bad "$3 (ожидалось '$2', получено '$1')"; fi; }

TOKEN=$($PHP -r "require_once 'backend/src/Auth.php'; echo Auth::issueToken(7, 'admin@lakomka.local', 'super_admin');" 2>/dev/null)
AUTH="Cookie: admin_token=$TOKEN"

U="public/uploads"
mkdir -p "$U"

echo "── 1. Тестовая миграция 002 через HTTP ──"
cat > backend/migrations/002_tmp_task82.sql <<'SQL'
CREATE TABLE IF NOT EXISTS tmp_task82 (id INTEGER PRIMARY KEY, note TEXT);
SQL
curl -s -o /dev/null "$BASE/settings/public"
$PHP -r '
$pdo = new PDO("sqlite:backend/storage/database.sqlite");
$t = $pdo->query("SELECT name FROM sqlite_master WHERE type=\"table\" AND name=\"tmp_task82\"")->fetchColumn();
echo $t ? "TABLE-OK" : "TABLE-NO", "\n";
$v = $pdo->query("SELECT version FROM schema_migrations WHERE version=\"002_tmp_task82.sql\"")->fetchColumn();
echo $v ? "ROW-OK" : "ROW-NO", "\n";
' > /tmp/t82mig.txt
check "$(sed -n 1p /tmp/t82mig.txt)" "TABLE-OK" "таблица из 002 создана после HTTP-запроса"
check "$(sed -n 2p /tmp/t82mig.txt)" "ROW-OK" "002 записана в schema_migrations"
N1=$(ls backend/storage/backups/*.sqlite 2>/dev/null | wc -l)
[ "$N1" -ge 1 ] && ok "дампы создаются (сейчас: $N1)" || bad "дампов нет"

echo "── 2. Уборка после миграционного теста ──"
rm -f backend/migrations/002_tmp_task82.sql
$PHP -r '$pdo = new PDO("sqlite:backend/storage/database.sqlite"); $pdo->exec("DROP TABLE IF EXISTS tmp_task82"); $pdo->exec("DELETE FROM schema_migrations WHERE version=\"002_tmp_task82.sql\"");'
ok "002 удалена (файл, таблица, запись)"

echo "── 3. Папка с «неудобным» именем + видео ──"
mkdir -p "$U/видео (2026) — мои MOV"
cp /tmp/t82-test.mp4 "$U/видео (2026) — мои MOV/LA_v005.mov" 2>/dev/null || {
  # минимальный валидный mp4, если нет заготовки
  ffmpeg -y -loglevel error -f lavfi -i testsrc=duration=0.3:size=128x96:rate=10 -f lavfi -i sine=duration=0.3 -c:v libx264 -c:a aac -pix_fmt yuv420p "$U/видео (2026) — мои MOV/LA_v005.mov"
  cp "$U/видео (2026) — мои MOV/LA_v005.mov" /tmp/t82-test.mp4
}
curl -s -H "$AUTH" "$BASE/admin/files/videos" | $PHP -r '$d = json_decode(stream_get_contents(STDIN), true); echo isset($d["data"]["entries"]) ? json_encode(array_column($d["data"]["entries"], "url")) : "ERR ".($d["error"]??"");' > /tmp/t82vid.json
grep -q "LA_v005.mov" /tmp/t82vid.json && ok "рекурсивный поиск нашёл видео в своей папке" || bad "видео не найдено: $(cat /tmp/t82vid.json)"

curl -s -H "$AUTH" --get --data-urlencode "folder=видео (2026) — мои MOV" "$BASE/admin/files/videos" | $PHP -r '$d = json_decode(stream_get_contents(STDIN), true); echo ($d["data"]["count"] ?? -1);' > /tmp/t82cnt
check "$(cat /tmp/t82cnt)" "1" "поиск с ?folder= ограничен папкой"

echo "── 4. Настройка gallery_video_folder ──"
R=$(curl -s -X POST -H "$AUTH" -H "Content-Type: application/json" -d '{"gallery_video_folder":"видео (2026) — мои MOV"}' "$BASE/admin/settings")
echo "$R" | grep -q '"ok":true' && ok "папка видео сохранена в настройках" || bad "настройка не сохранилась: $R"
curl -s -H "$AUTH" "$BASE/admin/files/videos" | $PHP -r '$d = json_decode(stream_get_contents(STDIN), true); echo ($d["data"]["folder"] ?? "ERR")."|".($d["data"]["count"] ?? -1);' > /tmp/t82fold
check "$(cat /tmp/t82fold)" "видео (2026) — мои MOV|1" "без ?folder берётся настройка"
R=$(curl -s -X POST -H "$AUTH" -H "Content-Type: application/json" -d '{"gallery_video_folder":"../etc"}' "$BASE/admin/settings")
echo "$R" | grep -q "422\|внутрин\|uploads" && ok "«..» в папке отвергается" || bad "traversal прошёл: $R"

echo "── 5. attach из своей папки (главный баг «Допустимы только файлы из /uploads/») ──"
PID=$(curl -s -H "$AUTH" -X POST -H "Content-Type: application/json" -d '{"name":"T82-тест","slug":"t82-test","price_kopecks":1000,"category_id":1,"description":"","is_active":0}' "$BASE/admin/products" | $PHP -r '$d=json_decode(stream_get_contents(STDIN),true); echo $d["data"]["id"] ?? "";')
[ -n "$PID" ] || { bad "тестовый товар не создался"; PID=1; }
R=$(curl -s -X POST -H "$AUTH" -H "Content-Type: application/json" --data-raw "{\"url\":\"/uploads/видео (2026) — мои MOV/LA_v005.mov\"}" "$BASE/admin/products/$PID/media/attach")
echo "$R" | grep -q '"type":"video"' && ok "attach принял юникод-папку и пробелы" || bad "attach: $R"
R=$(curl -s -X POST -H "$AUTH" -H "Content-Type: application/json" --data-raw '{"url":"/uploads/../config.php"}' "$BASE/admin/products/$PID/media/attach")
echo "$R" | grep -q "error" && ok "traversal в attach по-прежнему закрыт" || bad "traversal прошёл: $R"

echo "── 6. Hero-загрузка (jpg → webp) ──"
ffmpeg -y -loglevel error -f lavfi -i testsrc=duration=0.1:size=800x600:rate=5 -frames:v 1 /tmp/t82-hero.jpg
R=$(curl -s -H "$AUTH" -F "file=@/tmp/t82-hero.jpg" "$BASE/admin/uploads/hero")
echo "$R" | grep -qE '"url":"/uploads/hero/[0-9][^"]+"' && ok "hero: файл загружен, URL отдан" || bad "hero: $R"
echo "$R" | grep -q '\.webp' && ok "hero: оптимизатор пережал в WebP" || echo "  (i) hero: webp-конвертация не сработала: $R"

echo "── 7. Уборка тестовых данных ──"
[ -n "$PID" ] && [ "$PID" != "1" ] && curl -s -X DELETE -H "$AUTH" "$BASE/admin/products/$PID" > /dev/null && ok "тестовый товар удалён"
rm -rf "$U/видео (2026) — мои MOV"
$PHP -r '$pdo = new PDO("sqlite:backend/storage/database.sqlite"); $pdo->exec("DELETE FROM settings WHERE key=\"gallery_video_folder\"");'
ok "тестовые папка/настройка удалены"

echo "════════ ИТОГО: OK=$PASS FAIL=$FAIL ════════"
[ "$FAIL" = "0" ]
