#!/usr/bin/env bash
# ============================================================
# Сборка статического деплой-пакета «Лакомки» для обычного сервера.
#
#   bash scripts/build-static.sh
#
# Результат: download/lakomka-deploy-static.zip — распаковать в корень
# сайта (инструкция внутри: README-DEPLOY.md).
#
# Что делает:
#   1) временно убирает src/app/admin (админка — server-only, в статику
#      не экспортируется) и возвращает её всегда, даже при ошибке;
#   2) собирает Next.js в режиме EXPORT_MODE (out/, PHP должен быть
#      запущен — данные товаров запекаются на этапе сборки);
#   3) собирает пакет: статика + backend + .htaccess + инструкция;
#   4) упаковывает в ZIP.
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$(pwd)
# ВАЖНО: в Next 16 (Turbopack) при кастомном distDir экспорт пишется
# ПРЯМО В distDir (отдельного out/ не создаётся), а .next занят dev-сервером.
OUT="$ROOT/.next-static"
PKG="$ROOT/.deploy-package"

STASH="$ROOT/.admin-export-stash"

echo "[0/5] полная проверка типов (пока админка на месте)…"
npx tsc --noEmit

if [ -d "$ROOT/src/app/admin" ]; then
  mv "$ROOT/src/app/admin" "$STASH"
  echo "[1/5] admin-роуты временно убраны из экспорта"
else
  echo "[1/5] admin-роуты уже отсутствуют (прошлый запуск был прерван?)"
fi
restore_admin() {
  if [ -d "$STASH" ] && [ ! -d "$ROOT/src/app/admin" ]; then
    mv "$STASH" "$ROOT/src/app/admin"
    echo "[*] admin-роуты возвращены на место"
  fi
}
trap restore_admin EXIT

echo "[2/5] сборка Next.js (EXPORT_MODE=1)…"
rm -rf "$OUT"
EXPORT_MODE=1 \
PHP_API_URL="${PHP_API_URL:-http://127.0.0.1:8000/api}" \
NEXT_TELEMETRY_DISABLED=1 \
  npx next build

echo "[3/5] сборка деплой-пакета…"
rm -rf "$PKG"
mkdir -p "$PKG"
cp -a "$OUT/." "$PKG/"
# админский экспорт-архив (78МБ) в деплой не нужен
rm -rf "$PKG/exports"
# PHP-бэкенд целиком (с базой и настройками SMTP)
cp -a "$ROOT/backend" "$PKG/backend"
# журналы и временные файлы песочницы не нужны
rm -f "$PKG/backend/storage/"*.log "$PKG/backend/storage/"*-wal "$PKG/backend/storage/"*-shm 2>/dev/null || true
cp "$ROOT/scripts/deploy/.htaccess" "$PKG/.htaccess"
cp "$ROOT/scripts/deploy/README-DEPLOY.md" "$PKG/README-DEPLOY.md"

echo "[4/5] ZIP-архив…"
mkdir -p "$ROOT/download"
ZIP="$ROOT/download/lakomka-deploy-static.zip"
rm -f "$ZIP"
( cd "$PKG" && zip -qr "$ZIP" . )

echo "[5/5] готово:"
du -sh "$PKG" "$ZIP" | sed 's/^/    /'
echo "    пакет:   $PKG"
echo "    архив:   $ZIP"
