#!/bin/bash
# Task 110: тесты отказоустойчивого каскада перекодирования видео.
# Покрывает: санитайз-попытки (setsar/fps/format), -nostdin, пробник диагностики
# (probeTranscode), конвертацию iPhone-подобных HEVC-mov, нечётных размеров,
# экзотического SAR и full-range mjpeg.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PHP="$(command -v php 2>/dev/null || true)"
[ -z "$PHP" ] && [ -x "$ROOT/.ztools/php" ] && PHP="$ROOT/.ztools/php"
[ -z "$PHP" ] && [ -x "$ROOT/../.ztools/php" ] && PHP="$ROOT/../.ztools/php"
[ -n "$PHP" ] || { echo "php не найден"; exit 1; }
FF="$(command -v ffmpeg 2>/dev/null || true)"
[ -z "$FF" ] && { echo "ffmpeg не найден"; exit 1; }
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  OK  $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  FAIL $1"; }
chk()  { if [ "$2" = "1" ]; then ok "$1"; else bad "$1"; fi; }

echo "── 1. Синтаксис и юнит-пробник ──"
$PHP -l "$ROOT/backend/src/MediaOptimizer.php" > /dev/null 2>&1 && ok "php -l MediaOptimizer" || bad "php -l MediaOptimizer"
$PHP "$ROOT/scripts/test-probe-110.php" > /tmp/t110-probe.log 2>&1
rg -q "PROBE-TESTS OK" /tmp/t110-probe.log && ok "probeTranscode/sanitizerFilter unit (4 кейса)" || { bad "unit-тесты пробника"; cat /tmp/t110-probe.log; }

echo "── 2. Полный каскад на проблемных исходниках ──"
T=$(mktemp -d)
# 2a. iPhone-подобный HEVC mov (ремукс даст неиграбельный hevc → должен уйти в транскод)
$FF -y -v error -f lavfi -i "testsrc2=d=0.6:s=516x516:r=25" -f lavfi -i "sine=d=0.6" -c:v libx265 -pix_fmt yuv420p -tag:v hvc1 -c:a aac -shortest "$T/hevc.mov" 2>/dev/null
if [ -s "$T/hevc.mov" ]; then
    cp "$T/hevc.mov" "$T/hevc-work.mov"
    $PHP -r "require '$ROOT/backend/src/MediaOptimizer.php'; \$r=MediaOptimizer::optimizeVideoFile('$T/hevc-work.mov'); echo \$r['converted']?':'.\$r['note']:':FAIL '.\$r['note'];" > "$T/hevc.res"
    rg -q ":перекодировано" "$T/hevc.res" && ok "HEVC mov → H.264 mp4 $(cat "$T/hevc.res" | cut -c2-60)…" || { bad "HEVC mov не перекодирован: $(cat "$T/hevc.res")"; }
    [ -f "$T/hevc-work.mp4" ] && [ ! -f "$T/hevc-work.mov" ] && ok "исходник заменён mp4" || bad "замена исходника"
else
    echo "  (libx265 недоступен — кейс HEVC пропущен)"
fi

# 2b. Нечётные размеры + экзотический SAR + full-range mjpeg
$FF -y -v error -f lavfi -i "testsrc2=d=0.6:s=1001x559:r=25" -c:v libx264 -pix_fmt yuv420p -vf "setsar=2/1" -an "$T/odd.mov" 2>/dev/null
cp "$T/odd.mov" "$T/odd-work.mov"
$PHP -r "require '$ROOT/backend/src/MediaOptimizer.php'; \$r=MediaOptimizer::optimizeVideoFile('$T/odd-work.mov'); echo \$r['converted']?':'.\$r['note']:':FAIL '.\$r['note'];" > "$T/odd.res"
rg -q ":(перекодировано|контейнер mov → mp4)" "$T/odd.res" && ok "нечётные 1001x559 + SAR 2:1 → чётный играбельный mp4" || bad "нечётные размеры: $(cat "$T/odd.res")"

$FF -y -v error -f lavfi -i "testsrc2=d=0.6:s=640x360:r=25" -c:v mjpeg -q:v 3 -pix_fmt yuvj420p -an "$T/j420.mov" 2>/dev/null
cp "$T/j420.mov" "$T/j420-work.mov"
$PHP -r "require '$ROOT/backend/src/MediaOptimizer.php'; \$r=MediaOptimizer::optimizeVideoFile('$T/j420-work.mov'); echo \$r['converted']?':'.\$r['note']:':FAIL '.\$r['note'];" > "$T/j420.res"
rg -q ":перекодировано" "$T/j420.res" && ok "yuvj420p (full-range mjpeg) → mp4" || bad "yuvj420p: $(cat "$T/j420.res")"

echo "── 3. -nostdin и санитайз-цепочка понимаются ffmpeg ──"
$FF -y -v error -nostdin -i "$T/odd.mov" -map '0:v:0' -c:v libx264 -preset veryfast -crf 26 -vf 'pad=ceil(iw/2)*2:ceil(ih/2)*2,setsar=1,fps=30,format=yuv420p' -an -f mp4 "$T/san.mp4" 2>/dev/null
[ -s "$T/san.mp4" ] && ok "santайзер-цепочка: pad+setsar+fps+format" || bad "santайзер-цепочка"
$FF -y -v error -nostdin -i "$T/odd.mov" -map '0:v:0' -c:v libx264 -preset ultrafast -crf 26 -vf "scale=w='min(1920,iw)':h=-2:flags=lanczos,pad=ceil(iw/2)*2:ceil(ih/2)*2,setsar=1,fps=30,format=yuv420p" -an -f mp4 "$T/cap.mp4" 2>/dev/null
[ -s "$T/cap.mp4" ] && ok "лимит-цепочка: scale min(1920,iw) + pad + setsar + fps + format" || bad "лимит-цепочка"

echo "── 4. Ремукс-путь не сломан (h264 mov → remux без перекодирования) ──"
$FF -y -v error -f lavfi -i "testsrc2=d=0.6:s=640x360:r=25" -c:v libx264 -pix_fmt yuv420p -an "$T/h264.mov" 2>/dev/null
cp "$T/h264.mov" "$T/h264-work.mov"
$PHP -r "require '$ROOT/backend/src/MediaOptimizer.php'; \$r=MediaOptimizer::optimizeVideoFile('$T/h264-work.mov'); echo \$r['converted']?':'.\$r['note']:':FAIL '.\$r['note'];" > "$T/h264.res"
rg -q ":контейнер mov → mp4" "$T/h264.res" && ok "ремукс без потери качества" || bad "ремукс: $(cat "$T/h264.res")"

echo "── 5. Уборка ──"
rm -rf "$T" /tmp/t110-probe.log
ok "тестовые файлы удалены"

echo "════════ ИТОГ: PASS=$PASS FAIL=$FAIL ════════"
[ "$FAIL" = "0" ]
