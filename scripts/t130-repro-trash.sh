#!/bin/bash
# Task 130 (разведка): воспроизведение бага «восстановить из корзины → не найдено».
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PHP="$(command -v php 2>/dev/null || true)"
[ -z "$PHP" ] && [ -x "$ROOT/.ztools/php" ] && PHP="$ROOT/.ztools/php"
[ -z "$PHP" ] && [ -x "$ROOT/../.ztools/php" ] && PHP="$(readlink -f "$ROOT/../.ztools/php")"
[ -n "$PHP" ] || { echo "php не найден"; exit 1; }

PORT=8040; BASE="http://127.0.0.1:$PORT/api"; LOG=/tmp/t130-php.log
export PHP_CLI_SERVER_WORKERS=8
pkill -f "127.0.0.1:$PORT" 2>/dev/null; sleep 1
( setsid "$PHP" -S 127.0.0.1:$PORT backend/public/index.php >"$LOG" 2>&1 & )
UP=1
for i in $(seq 1 30); do curl -s "$BASE/health" | grep -q ok && { UP=0; break; }; sleep 0.3; done
[ "$UP" = "0" ] && echo "сервер :$PORT поднялся" || { echo "сервер НЕ поднялся"; tail -5 "$LOG"; exit 1; }

CJ=/tmp/t130-cookies.txt
LOGIN=$(curl -s -c "$CJ" -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d '{"email":"admin@lakomka.local","password":"Lakomka2026!"}')
echo "$LOGIN" | grep -q "token\|ok" && echo "логин ok" || { echo "логин FAIL: $LOGIN"; exit 1; }

UPD="$ROOT/public/uploads"
# ── сценарий A: обычный файл ──
mkdir -p "$UPD/products/t130-a"
echo "hello-A" > "$UPD/products/t130-a/0.jpg"
echo "── A: удалить файл ──"
curl -s -b "$CJ" -X POST "$BASE/admin/files/delete" -H "Content-Type: application/json" -d '{"path":"media/products/t130-a/0.jpg"}'; echo
echo "── A: корзина ──"
TRASH=$(curl -s -b "$CJ" "$BASE/admin/files/trash")
echo "$TRASH" | python3 -m json.tool --no-ensure-ascii 2>/dev/null | head -30
IDA=$(echo "$TRASH" | python3 -c "import json,sys;its=json.load(sys.stdin)['data']['items'];print(next((i['id'] for i in its if i['orig']=='products/t130-a/0.jpg'),''))")
echo "── A: восстановить id=$IDA ──"
curl -s -b "$CJ" -X POST "$BASE/admin/files/restore" -H "Content-Type: application/json" -d "{\"id\":\"$IDA\"}"; echo
ls -la "$UPD/products/t130-a/" 2>/dev/null

# ── сценарий B: файл, у цели уже есть новый (суффикс -restored) ──
echo "── B: восстановить повторно (цель существует) ──"
curl -s -b "$CJ" -X POST "$BASE/admin/files/restore" -H "Content-Type: application/json" -d "{\"id\":\"$IDA\"}"; echo

# ── сценарий C: папка с вложенными подпапками ──
mkdir -p "$UPD/products/t130-c/sub/deep"
echo "c1" > "$UPD/products/t130-c/0.jpg"; echo "c2" > "$UPD/products/t130-c/sub/1.jpg"; echo "c3" > "$UPD/products/t130-c/sub/deep/2.jpg"
echo "── C: удалить папку ──"
curl -s -b "$CJ" -X POST "$BASE/admin/files/delete" -H "Content-Type: application/json" -d '{"path":"media/products/t130-c"}'; echo
TRASH=$(curl -s -b "$CJ" "$BASE/admin/files/trash")
IDC=$(echo "$TRASH" | python3 -c "import json,sys;its=json.load(sys.stdin)['data']['items'];print(next((i['id'] for i in its if i['orig']=='products/t130-c'),''))")
echo "── C: восстановить папку id=$IDC ──"
curl -s -b "$CJ" -X POST "$BASE/admin/files/restore" -H "Content-Type: application/json" -d "{\"id\":\"$IDC\"}"; echo
ls -laR "$UPD/products/t130-c" 2>/dev/null | head -20

# ── сценарий D: несуществующий id ──
echo "── D: фейковый id ──"
curl -s -b "$CJ" -X POST "$BASE/admin/files/restore" -H "Content-Type: application/json" -d '{"id":"20990101-000000-deadbe"}'; echo

# ── сценарий E: позиция без meta.json (симуляция поломки) ──
echo "── E: позиция без meta.json ──"
mkdir -p "$UPD/.trash/20990101-000001-abcdef"
echo "x" > "$UPD/.trash/20990101-000001-abcdef/0.jpg"
curl -s -b "$CJ" -X POST "$BASE/admin/files/restore" -H "Content-Type: application/json" -d '{"id":"20990101-000001-abcdef"}'; echo

# ── сценарий F: кириллическое имя файла ──
mkdir -p "$UPD/products/t130-f"
echo "f" > "$UPD/products/t130-f/Видео 0.mov"
echo "── F: удалить кириллицу+пробел ──"
curl -s -b "$CJ" -X POST "$BASE/admin/files/delete" -H "Content-Type: application/json" -d '{"path":"media/products/t130-f/Видео 0.mov"}'; echo
TRASH=$(curl -s -b "$CJ" "$BASE/admin/files/trash")
IDF=$(echo "$TRASH" | python3 -c "import json,sys;its=json.load(sys.stdin)['data']['items'];print(next((i['id'] for i in its if 't130-f' in i['orig']),''))")
echo "── F: восстановить id=$IDF ──"
curl -s -b "$CJ" -X POST "$BASE/admin/files/restore" -H "Content-Type: application/json" -d "{\"id\":\"$IDF\"}"; echo
ls -la "$UPD/products/t130-f/" 2>/dev/null

echo "── G: папка БЕЗ подпапок, rename-путь ──"
mkdir -p "$UPD/products/t130-g"; echo "g" > "$UPD/products/t130-g/0.jpg"
curl -s -b "$CJ" -X POST "$BASE/admin/files/delete" -H "Content-Type: application/json" -d '{"path":"media/products/t130-g"}' >/dev/null
TRASH=$(curl -s -b "$CJ" "$BASE/admin/files/trash")
IDG=$(echo "$TRASH" | python3 -c "import json,sys;its=json.load(sys.stdin)['data']['items'];print(next((i['id'] for i in its if i['orig']=='products/t130-g'),''))")
curl -s -b "$CJ" -X POST "$BASE/admin/files/restore" -H "Content-Type: application/json" -d "{\"id\":\"$IDG\"}"; echo
ls "$UPD/products/t130-g/" 2>/dev/null

echo "── серверный лог (ошибки) ──"
grep -iE "error|warning" "$LOG" | tail -5
pkill -f "127.0.0.1:$PORT" 2>/dev/null
echo "ГОТОВО"
