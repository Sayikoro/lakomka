#!/usr/bin/env bash
# ============================================================
# Сборка статических пакетов «Лакомки» для обычного сервера.
#
#   bash scripts/build-static.sh               # полный деплой-пакет (по умолчанию)
#   MODE=update bash scripts/build-static.sh   # только архив обновления
#   MODE=both    bash scripts/build-static.sh  # оба архива сразу
#
# Результат в download/:
#   lakomka-deploy-static.zip        — ПЕРВЫЙ деплой: вся статика + ВСЕ медиа
#                                      + backend с базой (каталог/SMTP).
#   lakomka-update-<версия>.zip      — ОБНОВЛЕНИЕ функционала: страницы, стили,
#                                      скрипты, .htaccess, PHP. БЕЗ uploads/
#                                      и БЕЗ database.sqlite — медиа и заказы
#                                      на сервере не затрагиваются.
#                                      Применение: Настройки → «Обновление»
#                                      (песочница) или страница /update
#                                      на развёрнутом сайте.
#
# Что делает:
#   1) полная проверка типов;
#   2) временно убирает src/app/admin (админка — server-only, в статику
#      не экспортируется) и возвращает её всегда, даже при ошибке;
#   3) собирает Next.js в режиме EXPORT_MODE (PHP должен быть запущен —
#      данные товаров запекаются на этапе сборки);
#   4) собирает пакет: статика + backend + .htaccess + update.html +
#      инструкция; в backend/version.json — версия сборки;
#   5) для режима update/both — копия пакета без медиа и БД +
#      update-manifest.json с версией;
#   6) упаковывает в ZIP.
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$(pwd)
# ВАЖНО: в Next 16 (Turbopack) при кастомном distDir экспорт пишется
# ПРЯМО В distDir (отдельного out/ не создаётся), а .next занят dev-сервером.
OUT="$ROOT/.next-static"
PKG="$ROOT/.deploy-package"
PKG_U="$ROOT/.deploy-package-update"
MODE="${MODE:-full}"
STASH="$ROOT/.admin-export-stash"

if [[ "$MODE" != "full" && "$MODE" != "update" && "$MODE" != "both" ]]; then
  echo "MODE должен быть full | update | both (получено: $MODE)"; exit 1
fi

echo "[0/6] полная проверка типов (пока админка на месте)…"
npx tsc --noEmit

if [ -d "$ROOT/src/app/admin" ]; then
  mv "$ROOT/src/app/admin" "$STASH"
  echo "[1/6] admin-роуты временно убраны из экспорта"
else
  echo "[1/6] admin-роуты уже отсутствуют (прошлый запуск был прерван?)"
fi
restore_admin() {
  if [ -d "$STASH" ] && [ ! -d "$ROOT/src/app/admin" ]; then
    mv "$STASH" "$ROOT/src/app/admin"
    echo "[*] admin-роуты возвращены на место"
  fi
}
trap restore_admin EXIT

echo "[2/6] сборка Next.js (EXPORT_MODE=1)…"
rm -rf "$OUT"
# ВАЖНО: при force-cache (EXPORT_MODE) Next пишет data-cache в ОБЩИЙ .next/cache/fetch-cache,
# а не в .next-static. Без очистки сборка переиспользует ответы ПРЕДЫДУЩЕЙ сборки
# (поймано: product_card_template=new в БД, а в пакет запёкся classic из кеша).
rm -rf "$ROOT/.next/cache"
EXPORT_MODE=1 \
PHP_API_URL="${PHP_API_URL:-http://127.0.0.1:8000/api}" \
NEXT_TELEMETRY_DISABLED=1 \
  npx next build

echo "[3/6] сборка базового пакета…"
rm -rf "$PKG" "$PKG_U"
mkdir -p "$PKG"
cp -a "$OUT/." "$PKG/"
# админский экспорт-архив (78МБ) в деплой не нужен
rm -rf "$PKG/exports"
# PHP-бэкенд целиком (с базой и настройками SMTP)
cp -a "$ROOT/backend" "$PKG/backend"
# журналы, рантайм-артефакты и песочница-специфичное в пакеты не идут
rm -f "$PKG/backend/storage/"*.log "$PKG/backend/storage/"*-wal "$PKG/backend/storage/"*-shm 2>/dev/null || true
rm -rf "$PKG/backend/storage/chunked-uploads"
rm -f "$PKG/backend/storage/last-update.json"
rm -f "$PKG/backend/UPDATE_ROOT"
cp "$ROOT/scripts/deploy/.htaccess" "$PKG/.htaccess"
cp "$ROOT/scripts/deploy/README-DEPLOY.md" "$PKG/README-DEPLOY.md"
# страница обновления: на развёрнутом сайте админки нет, обновление через /update
cp "$ROOT/scripts/deploy/update.html" "$PKG/update.html"

VERSION="$(date +%Y.%m.%d-%H%M)"
BUILT_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
GITSHA="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo none)"

printf '{"version":"%s","built_at":"%s","type":"deploy","git":"%s"}\n' \
  "$VERSION" "$BUILT_AT" "$GITSHA" > "$PKG/backend/version.json"

mkdir -p "$ROOT/download"

zip_full() {
  echo "[5/6] ZIP полного деплоя (со всеми медиа)…"
  FULL_ZIP="$ROOT/download/lakomka-deploy-static.zip"
  rm -f "$FULL_ZIP"
  ( cd "$PKG" && zip -qr "$FULL_ZIP" . )
  echo "    полный деплой: $FULL_ZIP"
}

make_update_package() {
  echo "[4/6] пакет обновления (без медиа и БД)…"
  cp -a "$PKG" "$PKG_U"
  # медиа остаётся на сервере
  rm -rf "$PKG_U/uploads"
  # база на сервере (заказы, SMTP, товары для корзины) не перезаписывается
  rm -f "$PKG_U/backend/storage/database.sqlite"*
  printf '{"type":"update","version":"%s","built_at":"%s","git":"%s"}\n' \
    "$VERSION" "$BUILT_AT" "$GITSHA" > "$PKG_U/update-manifest.json"
  UPDATE_ZIP="$ROOT/download/lakomka-update-$VERSION.zip"
  rm -f "$UPDATE_ZIP"
  ( cd "$PKG_U" && zip -qr "$UPDATE_ZIP" . )
  echo "    обновление: $UPDATE_ZIP"
}

if [ "$MODE" = "update" ]; then
  make_update_package
  rm -rf "$PKG"
elif [ "$MODE" = "both" ]; then
  zip_full
  make_update_package
else
  zip_full
fi

echo "[6/6] готово:"
if [ -f "$ROOT/download/lakomka-deploy-static.zip" ]; then
  du -sh "$PKG" "$ROOT/download/lakomka-deploy-static.zip" | sed 's/^/    /'
  echo "    пакет:   $PKG"
fi
if [ -d "$PKG_U" ]; then
  du -sh "$PKG_U" | sed 's/^/    /'
  echo "    пакет обновления: $PKG_U"
fi
ls -1 "$ROOT/download"/lakomka-*.zip 2>/dev/null | sed 's/^/    архив: /'
