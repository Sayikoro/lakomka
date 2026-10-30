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
#   2) собирает Next.js в режиме EXPORT_MODE (PHP должен быть запущен —
#      данные товаров запекаются на этапе сборки). Админка — клиентские
#      страницы, она экспортируется вместе с витриной в /admin/;
#   3) собирает пакет: статика + backend + .htaccess + update.html +
#      инструкция; в backend/version.json — версия сборки;
#   4) для режима update/both — копия пакета без медиа и БД +
#      update-manifest.json с версией;
#   5) упаковывает в ZIP.
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

if [[ "$MODE" != "full" && "$MODE" != "update" && "$MODE" != "both" ]]; then
  echo "MODE должен быть full | update | both (получено: $MODE)"; exit 1
fi

echo "[0/5] полная проверка типов…"
npx tsc --noEmit

echo "[1/5] сборка Next.js (EXPORT_MODE=1)…"
rm -rf "$OUT"
# ВАЖНО: при force-cache (EXPORT_MODE) Next пишет data-cache в ОБЩИЙ .next/cache/fetch-cache,
# а не в .next-static. Без очистки сборка переиспользует ответы ПРЕДЫДУЩЕЙ сборки
# (поймано: product_card_template=new в БД, а в пакет запёкся classic из кеша).
rm -rf "$ROOT/.next/cache"
EXPORT_MODE=1 \
PHP_API_URL="${PHP_API_URL:-http://127.0.0.1:8000/api}" \
NEXT_TELEMETRY_DISABLED=1 \
  npx next build

echo "[2/5] сборка базового пакета…"
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
# авто-дампы БД песочницы в пакет не идут (на сервере создаются свои)
rm -rf "$PKG/backend/storage/backups"
rm -f "$PKG/backend/storage/last-update.json"
# секреты и приватные артефакты песочницы: на сервере создаются заново
# (jwt/encryption — автогенерация при первом запуске, см. config.php)
rm -f "$PKG/backend/storage/secret-keys.php"
rm -f "$PKG/backend/storage/github-token.txt"
rm -f "$PKG/backend/storage/github-release-cache.json"
rm -f "$PKG/backend/storage/deploy-archive-meta.json"
rm -f "$PKG/backend/UPDATE_ROOT"
cp "$ROOT/scripts/deploy/.htaccess" "$PKG/.htaccess"
cp "$ROOT/scripts/deploy/README-DEPLOY.md" "$PKG/README-DEPLOY.md"
# страница обновления: дубль входа и на развёрнутом сайте (там есть и /admin)
cp "$ROOT/scripts/deploy/update.html" "$PKG/update.html"

# Дефолтный суперадмин (admin@lakomka.local / Lakomka2026!) — сразу в БД
# пакета: админка на хостинге открывается без ручных настроек; подсказку
# с кредами показывает страница входа до смены пароля.
PHP_BIN="$(command -v php || true)"
if [ -z "$PHP_BIN" ]; then
  for cand in "$ROOT/.ztools/php" "$ROOT/../.ztools/php"; do
    [ -x "$cand" ] && PHP_BIN="$cand" && break
  done
fi
[ -x "$PHP_BIN" ] || { echo "php не найден (нужен в PATH, \$ROOT/.ztools/php или \$ROOT/../.ztools/php)"; exit 1; }
"$PHP_BIN" "$ROOT/scripts/seed-default-admin.php" "$PKG/backend/storage/database.sqlite"
# Рантайм-мусор песочницы (попытки входа, анти-флуд, тестовые заказы) —
# наружу не едем: иначе отравленный рейт-лимит и чужие заказы в пакете.
"$PHP_BIN" "$ROOT/scripts/clean-package-db.php" "$PKG/backend/storage/database.sqlite"

VERSION="$(date +%Y.%m.%d-%H%M)"
BUILT_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
GITSHA="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo none)"

printf '{"version":"%s","built_at":"%s","type":"deploy","git":"%s"}\n' \
  "$VERSION" "$BUILT_AT" "$GITSHA" > "$PKG/backend/version.json"

mkdir -p "$ROOT/download"

zip_full() {
  echo "[3/5] ZIP полного деплоя (со всеми медиа)…"
  FULL_ZIP="$ROOT/download/lakomka-deploy-static.zip"
  rm -f "$FULL_ZIP"
  ( cd "$PKG" && zip -qr "$FULL_ZIP" . )
  echo "    полный деплой: $FULL_ZIP"
}

make_update_package() {
  echo "[4/5] пакет обновления (без медиа и БД)…"
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

echo "[5/5] готово:"
if [ -f "$ROOT/download/lakomka-deploy-static.zip" ]; then
  du -sh "$PKG" "$ROOT/download/lakomka-deploy-static.zip" | sed 's/^/    /'
  echo "    пакет:   $PKG"
fi
if [ -d "$PKG_U" ]; then
  du -sh "$PKG_U" | sed 's/^/    /'
  echo "    пакет обновления: $PKG_U"
fi
ls -1 "$ROOT/download"/lakomka-*.zip 2>/dev/null | sed 's/^/    архив: /'
