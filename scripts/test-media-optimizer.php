<?php
/* Тест MediaOptimizer: PNG→webp с прозрачностью, JPEG→webp с уменьшением, mov→mp4. */
require __DIR__ . '/../backend/src/MediaOptimizer.php';

$dir = '/tmp/opt-test';
if (!is_dir($dir)) mkdir($dir, 0777, true);
foreach (glob("$dir/*") as $f) @unlink($f);

/* 1) Большой JPEG 4000x3000 (шумная картинка, чтобы весила много) */
$im = imagecreatetruecolor(4000, 3000);
for ($i = 0; $i < 400; $i++) {
    $c = imagecolorallocate($im, rand(0, 255), rand(0, 255), rand(0, 255));
    imagefilledrectangle($im, rand(0, 3900), rand(0, 2900), rand(0, 3900) + 200, rand(0, 2900) + 200, $c);
}
imagejpeg($im, "$dir/big-photo.jpg", 92);
imagedestroy($im);

/* 2) PNG с прозрачностью 1200x800 */
$im = imagecreatetruecolor(1200, 800);
imagesavealpha($im, true);
$transparent = imagecolorallocatealpha($im, 0, 0, 0, 127);
imagefilledrectangle($im, 0, 0, 1200, 800, $transparent);
$red = imagecolorallocate($im, 200, 30, 30);
imagefilledellipse($im, 600, 400, 500, 500, $red);
imagepng($im, "$dir/with-alpha.png");
imagedestroy($im);

/* 3) GIF (не должен трогаться) */
copy('/tmp/opt-test/with-alpha.png', '/tmp/opt-test/anim.gif'); // содержимое неважно — главное ext

foreach (['big-photo.jpg', 'with-alpha.png', 'anim.gif'] as $f) {
    $before = filesize("$dir/$f");
    $r = MediaOptimizer::optimizeImageFile("$dir/$f");
    printf("%-16s %8d Б → converted=%s name=%-22s after=%d note=%s\n",
        $f, $before, $r['converted'] ? 'YES' : 'no ', $r['name'], $r['after'], $r['note'] ?: '-');
    if ($r['converted']) {
        // проверка: итог — валидный webp с теми же пропорциями
        $info = getimagesize("$dir/" . $r['name']);
        printf("    → итог: %dx%d mime=%s, оригинал удалён=%s\n",
            $info[0], $info[1], $info['mime'],
            !file_exists("$dir/$f") ? 'да' : 'НЕТ (!!)');
    }
}

/* 4) Видео: генерируем mov (h264+aac в QuickTime) через ffmpeg и прогоняем */
exec('ffmpeg -y -loglevel error -f lavfi -i testsrc=duration=2:size=640x360:rate=24 '
   . '-f lavfi -i sine=frequency=440:duration=2 -c:v libx264 -pix_fmt yuv420p -c:a aac '
   . '-movflags +faststart -f mov /tmp/opt-test/clip.mov 2>&1', $o, $c);
echo "mov создан: " . (is_file("$dir/clip.mov") ? filesize("$dir/clip.mov") . ' Б' : "НЕТ ($c)") . "\n";
$r = MediaOptimizer::optimizeVideoFile("$dir/clip.mov");
printf("clip.mov → converted=%s name=%s note=%s\n", $r['converted'] ? 'YES' : 'no', $r['name'], $r['note']);
if ($r['converted']) {
    exec("ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of csv=p=0 $dir/{$r['name']}", $cn);
    echo "    → кодек итога: " . ($cn[0] ?? '?') . ", mov удалён=" . (!file_exists("$dir/clip.mov") ? 'да' : 'НЕТ') . "\n";
}

/* 5) webm не трогаем */
exec('ffmpeg -y -loglevel error -f lavfi -i testsrc=duration=1:size=320x240:rate=12 -c:v libvpx -f webm /tmp/opt-test/clip.webm 2>&1', $o2, $c2);
$r = MediaOptimizer::optimizeVideoFile("$dir/clip.webm");
printf("clip.webm → converted=%s (ожидаем no)\n", $r['converted'] ? 'YES (!!)' : 'no');

/* 6) Битая «картинка» не роняет */
file_put_contents("$dir/broken.jpg", 'это не картинка');
$r = MediaOptimizer::optimizeImageFile("$dir/broken.jpg");
printf("broken.jpg → converted=%s (ожидаем no), файл жив=%s\n", $r['converted'] ? 'YES (!!)' : 'no', file_exists("$dir/broken.jpg") ? 'да' : 'НЕТ (!!)');
echo "OK\n";
