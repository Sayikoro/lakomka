<?php
/* Тест каскада перекодирования видео (Task 86).
   Создаёт проблемные MOV всех типов и проверяет, что:
   1) h264+aac ремуксится без потерь;
   2) iPhone-подобный mov с tmcd/timecode-дорожкой берётся ремуксом с маппингом;
   3) HEVC и ProRes НЕ оставляются ремуксом (браузеры не играют) → транскод в h264;
   4) 10-bit yuv444p10le с нечётными размерами транскодится с добивкой до чётных;
   5) видео без звука проходит;
   6) битый файл не рушит систему и показывает РЕАЛЬНУЮ причину ffmpeg. */
require __DIR__ . '/../backend/src/MediaOptimizer.php';

$dir = '/tmp/vid-cascade-test';
if (!is_dir($dir)) mkdir($dir, 0777, true);
foreach (glob("$dir/*") as $f) @unlink($f);

function mk(string $args, string $out): bool {
    $cmd = "ffmpeg -y -loglevel error $args -f " . (str_ends_with($out, '.mov') ? 'mov' : 'mp4') . " " . escapeshellarg($out) . " 2>&1";
    exec($cmd, $o, $c);
    if ($c !== 0) echo "  (создание $out НЕ УДАЛОСЬ: " . implode(' | ', array_slice($o, 0, 2)) . ")\n";
    return $c === 0 && is_file($out) && filesize($out) > 0;
}
$src = "-f lavfi -i testsrc=duration=2:size=640x360:rate=24 -f lavfi -i sine=frequency=440:duration=2";

$cases = [];
/* 1) чистый h264+aac в mov — должен взять ремукс №1 */
mk("$src -c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 128k", "$dir/clean.mov");
/* 2) h264+aac+timecode-дорожка (как у iPhone): ремукс №1 падает на tmcd,
      должен взять ремукс №2 (с маппингом) */
mk("$src -c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 128k -timecode 00:00:00:00", "$dir/tmcd.mov");
/* 3) HEVC — ремукс в mp4 технически возможен, но браузеры не играют → транскод */
mk("$src -c:v libx265 -preset ultrafast -pix_fmt yuv420p -tag:v hvc1 -c:a aac -b:a 128k", "$dir/hevc.mov");
/* 4) ProRes 422 — ремукс возможен, но неиграбелен → транскод */
mk("-f lavfi -i testsrc=duration=1:size=320x240:rate=12 -c:v prores_ks -profile:v 0 -c:a pcm_s16le", "$dir/prores.mov");
/* 5) 10-bit yuv444p10le + НЕЧЁТНЫЕ размеры (crop обходит выравнивание testsrc2)
      → транскод с pad до чётных (322x200) */
mk("-f lavfi -i testsrc=duration=1:size=640x360:rate=12 -vf crop=321:199 -c:v libx265 -preset ultrafast -pix_fmt yuv444p10le -c:a aac", "$dir/hevc444odd.mov");
/* 6) h264 без звука */
mk("-f lavfi -i testsrc=duration=1:size=320x240:rate=12 -c:v libx264 -pix_fmt yuv420p -an", "$dir/noaudio.mov");
/* 7) битый файл */
file_put_contents("$dir/broken.mov", str_repeat("\x00garbage", 1000));
/* 8) обрезанный mov (нет moov) */
if (mk("$src -c:v libx264 -pix_fmt yuv420p -c:a aac", "$dir/tmp-full.mov")) {
    $data = file_get_contents("$dir/tmp-full.mov");
    file_put_contents("$dir/truncated.mov", substr($data, 0, intdiv(strlen($data), 2)));
    @unlink("$dir/tmp-full.mov");
}

$expect = [
    'clean.mov'      => 'ремукс',
    'tmcd.mov'       => 'ремукс',
    'hevc.mov'       => 'H.264 (перекод)',
    'prores.mov'     => 'H.264 (перекод)',
    'hevc444odd.mov' => 'H.264, чётные размеры',
    'noaudio.mov'    => 'ремукс',
    'broken.mov'     => 'отказ с причиной',
    'truncated.mov'  => 'отказ с причиной',
];

$pass = 0; $fail = 0;
foreach (array_keys($expect) as $file) {
    $path = "$dir/$file";
    if (!is_file($path)) { echo "✗ $file: файл не создан, тест пропущен\n"; $fail++; continue; }
    $size = filesize($path);
    $r = MediaOptimizer::optimizeVideoFile($path);
    $status = $r['converted'] ? 'OK ' : 'FAIL';
    printf("%-16s %9d Б → [%s] name=%-24s note=%s\n", $file, $size, $r['converted'] ? 'OK' : 'NO', $r['name'], $r['note'] ?: '-');
    if ($r['converted']) {
        $out = "$dir/{$r['name']}";
        $cn = []; // exec() ДОПОЛНЯЕТ массив — без сброса увидим размеры прошлой итерации
        exec("ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height -of csv=p=0 " . escapeshellarg($out), $cn);
        echo "    → итог: " . ($cn[0] ?? '?') . ", оригинал удалён=" . (!file_exists($path) ? 'да' : 'НЕТ (!!)') . "\n";
        $codec = explode(',', (string)($cn[0] ?? ''));
        $webSafe = in_array($codec[0] ?? '', ['h264','vp8','vp9','av1'], true);
        $even = isset($codec[1], $codec[2]) && $codec[1] % 2 === 0 && $codec[2] % 2 === 0;
        $wantRemux = str_contains($expect[$file], 'ремукс');
        $ok = $webSafe && ($wantRemux ? str_contains($r['note'], 'без потери качества') : true)
            && ($file === 'hevc444odd.mov' ? $even : true);
        if ($ok) { $pass++; echo "    ✓ соответствует ожиданию: {$expect[$file]}\n"; }
        else { $fail++; echo "    ✗ НЕ соответствует ожиданию: {$expect[$file]}\n"; }
    } else {
        $hasReason = str_contains($r['note'], 'ffmpeg:') && strlen($r['note']) > 40;
        if ($hasReason) { $pass++; echo "    ✓ отказ с реальной причиной ffmpeg\n"; }
        else { $fail++; echo "    ✗ отказ БЕЗ причины: {$r['note']}\n"; }
    }
}
echo $fail === 0 ? "\nALL PASS ($pass)\n" : "\nFAILURES: $fail (pass=$pass)\n";
exit($fail === 0 ? 0 : 1);
