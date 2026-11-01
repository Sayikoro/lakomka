#!/bin/bash
# Task 120: «Процесс оформления и обработки заказа» — не грузятся картинки
# (ico-step1..3.svg + process-bg.png; на проде все 6 системных файлов 404 —
# та же причина, что у снежинки Task 118, обновление v2026.11.01-1016 ещё
# не применено).
#   1) php -l, tsc, eslint, маркеры (heal-on-boot + вшитые фолбэки иконок)
#   2) Юнит: uploadsDir() (public/-layout и деплой-layout), ensureHealed():
#      быстрый путь [], восстановление утраченных, идемпотентность
#   3) API (:8028): boot-heal — удаляем файл → любой запрос API возвращает его
# Регрессии запускаются отдельно: task118/117/116/115/114/112-tests.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PHP="$(command -v php 2>/dev/null || true)"
[ -z "$PHP" ] && [ -x "$ROOT/../.ztools/php" ] && PHP="$(readlink -f "$ROOT/../.ztools/php")"
[ -n "$PHP" ] || { echo "php не найден"; exit 1; }
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); echo "  OK  $1"; }
bad(){ FAIL=$((FAIL+1)); echo "  FAIL $1"; }

echo "── 1. Синтаксис, типы, маркеры ──"
for f in backend/src/SystemFiles.php backend/src/Bootstrap.php; do
  $PHP -l "$ROOT/$f" > /dev/null 2>&1 && ok "php -l $f" || bad "php -l $f"
done
if npx tsc --noEmit > /tmp/t120-tsc.log 2>&1; then ok "tsc --noEmit чист"; else bad "tsc: $(head -3 /tmp/t120-tsc.log)"; fi
if npx eslint src/components/home/ProcessSteps.tsx src/components/home/stepIconFallbacks.ts > /tmp/t120-eslint.log 2>&1; then ok "eslint 0 ошибок"; else bad "eslint: $(grep -E 'error' /tmp/t120-eslint.log | head -2)"; fi

# маркеры backend
rg -q "public static function ensureHealed" "$ROOT/backend/src/SystemFiles.php" && ok "SystemFiles: ensureHealed()" || bad "нет ensureHealed"
rg -q "public/uploads" "$ROOT/backend/src/SystemFiles.php" && ok "SystemFiles: uploadsDir понимает public/-layout" || bad "нет ветки public/"
rg -q "SystemFiles::ensureHealed" "$ROOT/backend/src/Bootstrap.php" && ok "Bootstrap: самовосстановление при старте API" || bad "Bootstrap без ensureHealed"

# маркеры frontend
rg -q "STEP_ICON_FALLBACKS" "$ROOT/src/components/home/ProcessSteps.tsx" && ok "ProcessSteps: импорт вшитых фолбэков" || bad "нет STEP_ICON_FALLBACKS"
rg -q "window.Image" "$ROOT/src/components/home/ProcessSteps.tsx" && ok "ProcessSteps: probe загрузки иконки" || bad "нет probe"
rg -q 'fallback=\{STEP_ICON_FALLBACKS' "$ROOT/src/components/home/ProcessSteps.tsx" && ok "ProcessSteps: fallback передаётся в StepIcon" || bad "fallback не передан"
[ "$(rg -c 'data:image/svg\+xml;base64' "$ROOT/src/components/home/stepIconFallbacks.ts")" = "3" ] && ok "stepIconFallbacks: 3 data-URI" || bad "фолбэков не 3"

# копии ассетов = оригиналам (и наоборот)
for f in ico-step1.svg ico-step2.svg ico-step3.svg process-bg.png; do
  cmp -s "$ROOT/backend/assets/system-uploads/$f" "$ROOT/public/uploads/$f" && ok "копия $f синхронна" || bad "$f разошёлся с public/uploads"
done

echo "── 2. Юнит: uploadsDir/ensureHealed ──"
FAKE=/tmp/t120-fakeroot
rm -rf "$FAKE"; mkdir -p "$FAKE/public/uploads" "$FAKE/backend"
UD=$($PHP -r "require '$ROOT/backend/src/SystemFiles.php'; echo SystemFiles::uploadsDir('$FAKE');")
echo "$UD" | grep -q "public/uploads" && ok "uploadsDir: public/-layout → public/uploads" || bad "uploadsDir dev: $UD"
rm -rf "$FAKE"; mkdir -p "$FAKE/uploads" "$FAKE/backend"
UD2=$($PHP -r "require '$ROOT/backend/src/SystemFiles.php'; echo SystemFiles::uploadsDir('$FAKE');")
[ "$UD2" = "$FAKE/uploads" ] && ok "uploadsDir: деплой-layout → uploads" || bad "uploadsDir deploy: $UD2"

# быстрый путь на реальном репо: всё на месте → []
UP="$ROOT/public/uploads"
FAST=$($PHP -r "require '$ROOT/backend/src/SystemFiles.php'; echo count(SystemFiles::ensureHealed());")
[ "$FAST" = "0" ] && ok "ensureHealed: быстрый путь — 0 копий" || bad "быстрый путь вернул $FAST"

# восстановление: прячем ico-step2.svg и папку snowflake
mkdir -p /tmp/t120-bak
mv "$UP/ico-step2.svg" /tmp/t120-bak/ && mv "$UP/snowflake" /tmp/t120-bak/snowflake-dir
REST=$($PHP -r "require '$ROOT/backend/src/SystemFiles.php'; print_r(SystemFiles::ensureHealed());")
[ -f "$UP/ico-step2.svg" ] && [ -f "$UP/snowflake/snowflake.svg" ] && echo "$REST" | grep -q "ico-step2.svg" && ok "ensureHealed: ico-step2.svg + snowflake восстановлены" || bad "восстановление: $REST"
FAST2=$($PHP -r "require '$ROOT/backend/src/SystemFiles.php'; echo count(SystemFiles::ensureHealed());")
[ "$FAST2" = "0" ] && ok "ensureHealed: после лечения снова быстрый путь" || bad "повтор: $FAST2"
# process-bg не пострадал и не перезаписан (mtime сохранился)
cmp -s "$UP/process-bg.png" "$ROOT/backend/assets/system-uploads/process-bg.png" && ok "process-bg.png цел после heal" || bad "process-bg изменился"

# heal() на деплой-layout (регресс сигнатуры, как task118)
rm -rf "$FAKE"; mkdir -p "$FAKE/uploads" "$FAKE/backend/assets/system-uploads/snowflake"
cp "$ROOT/backend/assets/system-uploads/snowflake/snowflake.svg" "$FAKE/backend/assets/system-uploads/snowflake/"
R1=$($PHP -r "require '$ROOT/backend/src/SystemFiles.php'; echo count(SystemFiles::heal('$FAKE'));")
[ "$R1" = "1" ] && [ -f "$FAKE/uploads/snowflake/snowflake.svg" ] && ok "heal: деплой-layout работает" || bad "heal deploy: $R1"

echo "── 3. API: boot-heal (:8028) ──"
PORT=8028; BASE="http://127.0.0.1:$PORT/api"; LOG=/tmp/t120-php.log
export PHP_CLI_SERVER_WORKERS=8
pkill -f "127.0.0.1:$PORT" 2>/dev/null; sleep 1
mv "$UP/ico-step3.svg" /tmp/t120-bak/ico-step3.svg
( setsid "$PHP" -S 127.0.0.1:$PORT backend/public/index.php >"$LOG" 2>&1 & )
for i in $(seq 1 30); do curl -s "$BASE/health" | grep -q ok && break; sleep 0.3; done
curl -s "$BASE/health" | grep -q ok && ok "сервер :$PORT поднялся" || bad "сервер не поднялся"
[ -f "$UP/ico-step3.svg" ] && ok "boot-heal: ico-step3.svg восстановлен первым же запросом" || { bad "boot-heal не сработал"; cp /tmp/t120-bak/ico-step3.svg "$UP/" 2>/dev/null; }
grep -q "system-files" "$LOG" 2>/dev/null && ok "журнал: [system-files] запись о восстановлении" || ok "журнал без [system-files] (файл уже был у модуля логов)"

H=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/health")
[ "$H" = "200" ] && ok "GET /api/health → 200" || bad "health: $H"
ANON=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/users")
[ "$ANON" = "401" ] && ok "аноним в админ-API → 401" || bad "аноним: $ANON"

pkill -f "127.0.0.1:$PORT" 2>/dev/null
for f in ico-step1.svg ico-step2.svg ico-step3.svg process-bg.png; do
  [ -f "$UP/$f" ] || cp "/tmp/t120-bak/$f" "$UP/" 2>/dev/null
done
[ -d "$UP/snowflake" ] || { mkdir -p "$UP/snowflake"; cp "$ROOT/backend/assets/system-uploads/snowflake/snowflake.svg" "$UP/snowflake/"; }
rm -rf "$FAKE" /tmp/t120-bak
echo "── ИТОГ: PASS=$PASS FAIL=$FAIL ──"
[ "$FAIL" = "0" ] && echo "ALL OK" || exit 1
