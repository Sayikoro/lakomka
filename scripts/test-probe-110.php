<?php
// Task 110: unit-тест probeTranscode (диагностика провала кодера) через Reflection.
require __DIR__ . '/../backend/src/MediaOptimizer.php';

$ref = new ReflectionMethod('MediaOptimizer', 'probeTranscode');
$ref->setAccessible(true);
$bin = trim((string)shell_exec('command -v ffmpeg'));
$map = "-map '0:v:0' -map '0:a:0?'";

$ok = true;

// 1) Валидный файл: пробник должен пройти (кодер в норме) и вернуть диагностический текст
$tmp = sys_get_temp_dir() . '/probe-ok-' . bin2hex(random_bytes(3)) . '.mov';
copy('/home/z/my-project/upload/LA_v006.mov', $tmp);
$r = $ref->invoke(null, $bin, $tmp, $map);
echo "[1] valid file -> {$r}\n";
$ok = $ok && ($r !== '' && mb_stripos($r, 'кодер') !== false);
unlink($tmp);

// 2) Битый источник (текстовый файл): пробник должен упасть и выцепить причину
$bad = sys_get_temp_dir() . '/probe-bad-' . bin2hex(random_bytes(3)) . '.mov';
file_put_contents($bad, str_repeat('not a video at all', 1000));
$r2 = $ref->invoke(null, $bin, $bad, $map);
echo "[2] broken file -> {$r2}\n";
$ok = $ok && ($r2 !== '');
unlink($bad);

// 3) sanitizerFilter: обе ветки начинаются с -vf и содержат ключевые фильтры
$refS = new ReflectionMethod('MediaOptimizer', 'sanitizerFilter');
$refS->setAccessible(true);
$s1 = $refS->invoke(null, false);
$s2 = $refS->invoke(null, true);
echo "[3] san: {$s1}\n    cap: {$s2}\n";
foreach ([$s1, $s2] as $s) {
    $ok = $ok && str_starts_with($s, '-vf ') && str_contains($s, 'setsar=1') && str_contains($s, 'format=yuv420p');
}
$ok = $ok && str_contains($s2, 'min(1920,iw)') && !str_contains($s1, 'min(1920,iw)');

// 4) sanitizer-команда реально работает через shell (эмуляция попытки №4 каскада)
$t = sys_get_temp_dir() . '/san-' . bin2hex(random_bytes(3));
mkdir($t);
copy('/home/z/my-project/upload/LA_v006.mov', "$t/v.mov");
$cmd = $bin . ' -y -loglevel error -nostdin -i ' . escapeshellarg("$t/v.mov")
     . " $map -c:v libx264 -preset veryfast -crf 26 " . $s1
     . ' -c:a aac -b:a 128k -movflags +faststart -f mp4 ' . escapeshellarg("$t/v.mp4") . ' 2>&1';
exec($cmd, $o, $c);
$made = is_file("$t/v.mp4") && filesize("$t/v.mp4") > 0;
echo "[4] sanitizer attempt via shell: code=$c, mp4=" . ($made ? 'yes' : 'no') . "\n";
$ok = $ok && $c === 0 && $made;

echo $ok ? "PROBE-TESTS OK\n" : "PROBE-TESTS FAILED\n";
exit($ok ? 0 : 1);
