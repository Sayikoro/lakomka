#!/bin/bash
# Task 159 E2E-обёртка: стенд .deploy-package :8096 + Playwright (task159-e2e.cjs).
# Проверки:
#   1) запечённый каталог: пустая категория «Тубы» фильтруется честно
#      (лендинг /catalog/tuby — пустое состояние, не весь каталог);
#   2) плитка «Тубы» в фильтрах каталога, клик фильтрует, сброс возвращает;
#   3) старый ?category= и лендинги непустых категорий работают как раньше;
#   4) ЖИВОЙ путь: товар, назначенный «Тубам» в БД пакета (эмуляция будущих
#      правок владельца в админке), появляется на лендинге без пересборки.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

[ -f "$ROOT/.deploy-package/index.html" ] || { echo "нет .deploy-package — сначала MODE=both bash scripts/build-static.sh"; exit 1; }
PHP="$(command -v php 2>/dev/null || true)"
[ -z "$PHP" ] && [ -x "$ROOT/../.ztools/php" ] && PHP="$(readlink -f "$ROOT/../.ztools/php")"
[ -n "$PHP" ] || { echo "php не найден"; exit 1; }

echo "── 0. Стенд :8096 ──"
PORT=8096; BASE="http://127.0.0.1:$PORT"
export PHP_CLI_SERVER_WORKERS=8
pkill -f "127.0.0.1:$PORT" 2>/dev/null; sleep 1
( cd "$ROOT/.deploy-package" && setsid "$PHP" -S 127.0.0.1:$PORT "$ROOT/scripts/deploy/dev-router.php" >/tmp/t159-stand.log 2>&1 & )
for i in $(seq 1 30); do curl -s "$BASE/api/health" 2>/dev/null | grep -q ok && break; sleep 0.3; done
curl -s "$BASE/api/health" | grep -q ok && echo "  OK  стенд :$PORT поднялся" || { echo "  FAIL стенд не поднялся (см. /tmp/t159-stand.log)"; exit 1; }

RC=0
echo "── 1. Playwright: запечённый каталог + плитки фильтров ──"
node scripts/task159-e2e.cjs "$BASE" || RC=1

echo "── 2. Живой путь: товар назначен категории «Тубы» ──"
PKGDB="$ROOT/.deploy-package/backend/storage/database.sqlite"
if [ -f "$PKGDB" ]; then
  PICK=$("$PHP" -r '
$db = new PDO("sqlite:$argv[1]");
$r = $db->query("SELECT id, COALESCE(category_id,-1) AS cid FROM products WHERE show_in_catalog=1 AND deleted_at IS NULL AND is_published=1 AND (category_id IS NULL OR category_id<>8) ORDER BY id LIMIT 1")->fetch(PDO::FETCH_ASSOC);
echo $r["id"]." ".$r["cid"];' "$PKGDB") || PICK=""
  if [ -n "$PICK" ]; then
    PID=${PICK%% *}; PCAT=${PICK##* }
    "$PHP" -r '$db=new PDO("sqlite:$argv[1]"); $st=$db->prepare("UPDATE products SET category_id=8 WHERE id=?"); $st->execute([$argv[2]]); echo "assigned\n";' "$PKGDB" "$PID" >/dev/null
    node scripts/task159-e2e.cjs "$BASE" live || RC=1
    "$PHP" -r '$db=new PDO("sqlite:$argv[1]"); $st=$db->prepare("UPDATE products SET category_id=? WHERE id=?"); $st->execute([$argv[2],$argv[3]]);' "$PKGDB" "$PCAT" "$PID"
    echo "  OK  товар #$PID возвращён в категорию $PCAT (пакет восстановлен)"
  else
    echo "  SKIP нет видимого товара вне «Туб» для живой проверки"
  fi
else
  echo "  SKIP в пакете нет backend/storage/database.sqlite"
fi

# Сирота-php держит пайп вызывающего (грабли прошлых циклов) — гасим стенд
pkill -f "127.0.0.1:$PORT" 2>/dev/null; sleep 0.5
[ "$RC" = "0" ] && echo "  OK  task159 e2e зелёный" || { echo "  FAIL task159 e2e провален"; exit 1; }
