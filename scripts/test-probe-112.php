<?php
/* Task 112: unit-тесты диагностики MediaOptimizer.
 * Главная цель — тот самый прод-кейс: проба падает, в логе только
 * приветствие x264 («using SAR=1/1»), и эта строка НЕ должна выдаваться
 * за причину ошибки (раньше именно она уезжала админу). */

require __DIR__ . '/../backend/src/MediaOptimizer.php';

$pass = 0; $fail = 0;
$ok  = function (string $m) use (&$pass) { $pass++; echo "  OK  $m\n"; };
$bad = function (string $m) use (&$fail) { $fail++; echo "  FAIL $m\n"; };

$pick = new ReflectionMethod('MediaOptimizer', 'pickProbeReason');
$pick->setAccessible(true);
$trim = new ReflectionMethod('MediaOptimizer', 'trimErr');
$trim->setAccessible(true);
$ferr = new ReflectionMethod('MediaOptimizer', 'ffmpegError');
$ferr->setAccessible(true);

/* Прод-лог Task 112: кодер открылся, дальше — тишина/обрыв */
$benign = [
    '[libx264 @ 0x126ded0] using SAR=1/1',
    '[libx264 @ 0x126ded0] using cpu capabilities: MMX2 SSE2Fast SSSE3',
    '[libx264 @ 0x126ded0] profile High, level 3.0, 4:2:0, 8-bit',
    '[libx264 @ 0x126ded0] 264 - core 155 r2917 02484 - H.264/MPEG-4 AVC codec',
    'frame=    1 fps=0.0 q=-1.0 size=       0kB time=00:00:00.00 bitrate=N/A',
];

/* 1. Только приветствие кодера → причины НЕТ (пусто, а не «using SAR=1/1») */
$r = $pick->invoke(null, $benign);
if ($r === '') $ok('приветствие x264 («using SAR=1/1», cpu, профиль) не выдаётся за ошибку');
else $bad("benign-лог вернул «{$r}»");

/* 2. Явная ошибка x264 — извлекается */
$l2 = $benign; $l2[2] = '[libx264 @ 0x126ded0] x264 [error]: malloc of buffer failed';
$r = $pick->invoke(null, $l2);
if (strpos($r, 'malloc of buffer failed') !== false) $ok('x264 [error] извлекается');
else $bad("x264 error: «{$r}»");

/* 3. Не-приветственная строка кодера (без слова error) — запасная причина */
$l3 = $benign; $l3[] = '[libx264 @ 0x126ded0] encode frame failed (check your parameters)';
$r = $pick->invoke(null, $l3);
if (strpos($r, 'encode frame failed') !== false) $ok('не-приветственная строка x264 возвращается как причина');
else $bad("fallback-строка: «{$r}»");

/* 4. Расширенные жёсткие маски (новые классы ошибок старых ffmpeg) */
$masks = [
    'Error while decoding stream #0:0',
    'Decoder (codec hevc) not found for input stream #0:0',
    'Too many packets buffered for output stream 0:0',
    'Conversion failed!',
    'Cannot allocate memory',
];
foreach ($masks as $m) {
    $r = $pick->invoke(null, ['[fmt @ 0x1] ' . $m]);
    if ($r !== '' && stripos($r, preg_replace('/[#!.\s].*$/', '', $m)) !== false) {
        $ok("маска: «{$m}»");
    } else {
        $bad("маска не сработала: «{$m}» → «{$r}»");
    }
}

/* 5. trimErr: адрес с пробелом после @ (реальный формат av_log) и без */
foreach (['[libx264 @ 0x126ded0] something bad', '[libx264 @0x126ded0] something bad'] as $l) {
    if ($trim->invoke(null, $l) === 'something bad') $ok('trimErr: ' . substr($l, 0, 22) . '…');
    else $bad("trimErr не срезал адрес: $l");
}

/* 6. ffmpegError тоже срезает адрес с пробелом */
$r = $ferr->invoke(null, ['[libx264 @ 0x126ded0] using SAR=1/1']);
if ($r === 'using SAR=1/1') $ok('ffmpegError: срез адреса с пробелом после @');
else $bad("ffmpegError: «{$r}»");

echo $fail === 0 ? "PROBE-112 TESTS OK ($pass)\n" : "PROBE-112 TESTS FAIL ($fail)\n";
exit($fail === 0 ? 0 : 1);
