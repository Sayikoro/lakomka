#!/usr/bin/env bash
# Тесты Task 111:
#  А) чанковая загрузка до 1 ГБ (клиент 2000×512КБ, сервер MAX_TOTAL 1024 MB,
#     проверка места перед склейкой);
#  Б) описание PDF живёт на «странице скачивания» (/api/pdfs отдаёт описание
#     сразу после правки в админке; SSR /catalogs остаётся запечённым —
#     клиентская подмена добирает живое при загрузке).
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
PHP="$(command -v php || true)"
[ -z "$PHP" ] && [ -x "$ROOT/.ztools/php" ] && PHP="$ROOT/.ztools/php"
[ -z "$PHP" ] && [ -x "$ROOT/.ztools/bin" ] && PHP="$ROOT/.ztools/bin"
[ -z "$PHP" ] && [ -x "$ROOT/../.ztools/php" ] && PHP="$ROOT/../.ztools/php"
[ -z "$PHP" ] && [ -x "$ROOT/../.ztools/bin" ] && PHP="$ROOT/../.ztools/bin"
[ -n "$PHP" ] || { echo "php не найден"; exit 1; }
PORT=8018
BASE="http://127.0.0.1:$PORT/api"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  OK  $1"; }
bad()  { FAIL=$((FAIL+1)); echo "FAIL  $1"; }
check(){ if [ "$1" = "$2" ]; then ok "$3"; else bad "$3 (ожидалось '$2', получено '$1')"; fi; }

echo "── 1. Синтаксис и типы ──"
$PHP -l backend/src/ChunkedUpload.php > /dev/null 2>&1 && ok "php -l ChunkedUpload" || bad "php -l ChunkedUpload"
$PHP -l backend/src/Controllers/AdminFilesController.php > /dev/null 2>&1 && ok "php -l AdminFilesController" || bad "php -l AdminFilesController"
npx tsc --noEmit > /tmp/t111-tsc.log 2>&1 && ok "tsc --noEmit" || { bad "tsc"; tail -5 /tmp/t111-tsc.log; }

echo "── 2. ChunkedUpload: новый потолок 1 ГБ ──"
MAX=$($PHP -r "require 'backend/src/ChunkedUpload.php'; echo (new ReflectionClass('ChunkedUpload'))->getConstant('MAX_TOTAL');")
check "$MAX" "1073741824" "MAX_TOTAL = 1024 MB"

$PHP -r '
require "backend/src/ChunkedUpload.php";
try { ChunkedUpload::receiveChunk("t111-cap-test", 0, 2500, "big.zip", base64_encode("x")); echo "NO_THROW"; }
catch (InvalidArgumentException $e) { echo "REJECTED: " . $e->getMessage(); }
' > /tmp/t111-cap.out 2>&1
rg -q "REJECTED: Слишком много чанков" /tmp/t111-cap.out && ok "2500 чанков сервером отклонены (>2000)" || { bad "лимит чанков: $(cat /tmp/t111-cap.out)"; }

# 1500 чанков по 512 Б (768 КБ) — прежде лимит был 1000 чанков/500 МБ
$PHP -r '
require "backend/src/ChunkedUpload.php";
$chunk = str_repeat("A", 512);
$uid = "t111-1500-" . date("His") . "-" . bin2hex(random_bytes(2)); // ОДИН раз: date() внутри цикла менялся на границе секунды
$last = null;
for ($i = 0; $i < 1500; $i++) {
    $last = ChunkedUpload::receiveChunk($uid, $i, 1500, "import.zip", base64_encode($chunk));
}
echo ($last["done"] ?? false) ? "DONE size=" . $last["size"] : "NOT_DONE";
ChunkedUpload::removeFile($uid . ".zip");
' > /tmp/t111-1500.out 2>&1
rg -q "DONE size=768000" /tmp/t111-1500.out && ok "1500 чанков склеились в файл 768000 Б" || { bad "1500 чанков: $(cat /tmp/t111-1500.out)"; }

echo "── 3. PDF-описание через API (живое, без пересборки) ──"
pkill -f "php.*127.0.0.1:$PORT" 2>/dev/null; sleep 1
( setsid "$PHP" -S 127.0.0.1:$PORT backend/public/index.php >/tmp/t111-php.log 2>&1 & )
UP=0
for i in $(seq 1 30); do curl -s -m 2 "$BASE/health" | grep -q '"ok"' && UP=1 && break; sleep 0.5; done
check "$UP" "1" "PHP-бэкенд поднялся на :$PORT"

TOKEN=$("$PHP" -r 'require_once "backend/src/Auth.php"; echo Auth::issueToken(2, "admin@lakomka.local", "super_admin");')
AUTH="Authorization: Bearer $TOKEN"

DESC="Тест-описание Task 111 — обновляется без пересборки"
R=$(curl -s -X POST "$BASE/admin/pdfs/certificate/meta" -H "$AUTH" -H "Content-Type: application/json" -d "{\"description\":\"$DESC\"}")
rg -q '"ok":true' <<< "$R" && ok "saveMeta принял описание" || bad "saveMeta: $R"
G=$(curl -s "$BASE/pdfs")
rg -q "$DESC" <<< "$G" && ok "GET /api/pdfs отдаёт свежее описание" || bad "GET /api/pdfs без описания"

# Статический пакет (после build-static.sh): SSR запечён — описания в нём нет,
# зато клиентский чанк содержит живой fetch /api/pdfs (логика Task 111 в бандле)
if [ -f .deploy-package/catalogs/index.html ]; then
  rg -lq "/api/pdfs" .deploy-package/_next/static/chunks/ 2>/dev/null \
    && ok "в бандле статики есть живой fetch /api/pdfs (клиентская подмена)" \
    || bad "в статике нет /api/pdfs — клиентская подмена не собралась"
else
  echo "  (статический пакет не собран — проверка бандла пропущена)"
fi

# чистка описания из dev-БД (сборка должна остаться чистой)
$PHP -r '$pdo=new PDO("sqlite:backend/storage/database.sqlite"); $pdo->prepare("DELETE FROM settings WHERE key = ?")->execute(["pdf_description_certificate"]);' \
  && ok "описание вычищено из dev-БД" || bad "чистка описания"

echo "── 4. Уборка ──"
rm -rf backend/storage/chunked-uploads/t111-* backend/storage/chunked-uploads/up-t111-* 2>/dev/null
rm -f /tmp/t111-*.log /tmp/t111-*.out /tmp/t111-cat.html
pkill -f "php.*127.0.0.1:$PORT" 2>/dev/null
ok "тестовые артефакты удалены"

echo "════════ ИТОГ: PASS=$PASS FAIL=$FAIL ════════"
[ "$FAIL" = "0" ]
