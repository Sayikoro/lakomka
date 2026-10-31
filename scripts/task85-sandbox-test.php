<?php
/* Task 85: sandbox-тест сервер-поиска медиа при импорте.
   Песочница: /tmp/t85 (копия схемы БД + свои uploads) — живой сайт не трогается
   (урок Task 51: applyImport вызывается с $uploadsRoot песочницы). */

error_reporting(E_ALL & ~E_DEPRECATED);
$ROOT = dirname(__DIR__);
require_once $ROOT . '/backend/src/Controllers/AdminProductsImportExportController.php';

$SB = '/tmp/t85';
$PUBLIC = $SB . '/public';
$DB = $SB . '/test.sqlite';
$PASS = 0; $FAIL = 0;
function ok(string $m): void    { global $PASS; $PASS++; echo "  OK  $m\n"; }
function bad(string $m): void   { global $FAIL; $FAIL++; echo "FAIL  $m\n"; }
function check($a, $b, string $m): void { ($a === $b) ? ok($m) : bad("$m (ожидалось " . var_export($b, true) . ", получено " . var_export($a, true) . ")"); }

/* ── 0. Чистая песочница ── */
exec('rm -rf ' . escapeshellarg($SB));
mkdir($PUBLIC . '/uploads/products/test-slug', 0755, true);
mkdir($PUBLIC . '/uploads/video', 0755, true);
mkdir($PUBLIC . '/uploads/media', 0755, true);
copy($ROOT . '/backend/storage/database.sqlite', $DB);

/* медиа: 1x1 jpeg, webp (GD), mp4 (ffmpeg, 0.5 c) */
$jpg = base64_decode('/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==');
file_put_contents($PUBLIC . '/uploads/products/test-slug/0.jpg', $jpg);
file_put_contents($PUBLIC . '/uploads/products/test-slug/9.jpg', $jpg); // мусор — должен быть удалён
/* JPEG через ffmpeg (в статическом PHP нет GD-энкодеров: imagewebp/imagejpeg undefined) */
exec('ffmpeg -y -loglevel error -f lavfi -i testsrc2=duration=0.1:size=64x64:rate=10 -frames:v 1 -q:v 4 '
   . escapeshellarg($PUBLIC . '/uploads/media/фото-сервер.jpg'));
foreach (['video-0.mp4' => $PUBLIC . '/uploads/products/test-slug/video-0.mp4',
          'клип-сервер.mp4' => $PUBLIC . '/uploads/video/клип-сервер.mp4'] as $n => $p) {
    exec('ffmpeg -y -loglevel error -f lavfi -i testsrc2=duration=0.5:size=128x96:rate=10 '
       . '-c:v libx264 -preset ultrafast -pix_fmt yuv420p ' . escapeshellarg($p));
    if (!is_file($p)) { bad("ffmpeg не создал $n"); }
}
$cfgHash = hash_file('sha256', $ROOT . '/backend/config.php');

/* ── 1. Тестовые товары в песочной БД ── */
$pdo = new PDO('sqlite:' . $DB);
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$urls = function (int $pid) use ($pdo): array {
    $s = $pdo->prepare('SELECT url, media_type, sort_order FROM product_images WHERE product_id = ? ORDER BY sort_order');
    $s->execute([$pid]);
    return $s->fetchAll(PDO::FETCH_ASSOC);
};
$ins = $pdo->prepare('INSERT INTO products (id, name, type, slug, price_kopecks, show_in_catalog, is_published) VALUES (?, ?, "simple", ?, 99000, 1, 1)');
foreach ([900001 => 'test-slug', 900002 => 'other-slug', 900003 => 'none-slug', 900004 => 'trav-slug', 900005 => 'cross-slug', 900006 => 'glob-slug', 900007 => 'zip-slug'] as $id => $slug) {
    $ins->execute([$id, "Тест 85 $id", $slug]);
}

/* ── 2. CSV «лёгкого» архива (папок images/ videos/ в ZIP НЕТ) ── */
$csv = $SB . '/__data.csv';
$fh = fopen($csv, 'w');
fwrite($fh, "\xEF\xBB\xBF");
fputcsv($fh, ['ИД', 'НАЗВАНИЕ', 'ТИП', 'SLUG', 'КАРТИНКИ', 'ВИДЕО'], ';');
fputcsv($fh, ['900001', 'Своя папка (re-attach + защита)', 'simple', 'test-slug', '0.jpg', 'video-0.mp4'], ';');
fputcsv($fh, ['900002', 'Папки video/ и media/ сервера', 'simple', 'other-slug', 'фото-сервер.jpg', 'клип-сервер.mp4'], ';');
fputcsv($fh, ['900003', 'Нигде нет', 'simple', 'none-slug', 'absent.jpg', 'absent.mp4'], ';');
fputcsv($fh, ['900004', 'Traversal', 'simple', 'trav-slug', '', '../../backend/config.php'], ';');
fputcsv($fh, ['900005', 'Каноническое имя чужой папки', 'simple', 'cross-slug', '0.jpg', ''], ';');
fputcsv($fh, ['900006', 'Не-каноническое имя ищем везде', 'simple', 'glob-slug', 'фото-сервер.jpg', ''], ';');
fputcsv($fh, ['900007', 'Файл есть в ZIP — прежний путь', 'simple', 'zip-slug', 'zip-фото.jpg', 'zip-клип.mp4'], ';');
fclose($fh);

$parsed = ProductCsvParser::parse($csv);
check(count($parsed['rows']), 7, 'парсер: 7 строк');
check($parsed['rows'][1]['video_items'], ['клип-сервер.mp4'], 'парсер: видео строки 2 — имя файла');
check($parsed['rows'][3]['video_items'], ['config.php'], 'парсер: путь сводится к basename (traversal обезврежен уже тут)');

/* ── 3. applyImport c песочным uploadsRoot ── */
/* ZIP-карты (как после распаковки архива) — приоритет ZIP над сервером */
$zipTmp = $SB . '/zipsrc';
mkdir($zipTmp, 0755, true);
file_put_contents($zipTmp . '/zip-фото.jpg', $jpg);
exec('ffmpeg -y -loglevel error -f lavfi -i testsrc2=duration=0.3:size=96x64:rate=10 '
   . '-c:v libx264 -preset ultrafast -pix_fmt yuv420p ' . escapeshellarg($zipTmp . '/zip-клип.mp4'));

$ref = new ReflectionMethod('AdminProductsImportExportController', 'applyImport');
$ref->setAccessible(true);
$stats = $ref->invoke(null, $pdo, $parsed, ['zip-фото.jpg' => $zipTmp . '/zip-фото.jpg'], ['zip-клип.mp4' => $zipTmp . '/zip-клип.mp4'], $PUBLIC);

check($stats['images_attached'], 3, 'attached картинок: своя папка + media/ + глобальный поиск');
check($stats['videos_attached'], 2, 'attached видео: своя папка + video/');
check($stats['images_missing'], ['absent.jpg', '0.jpg'], 'missing картинок: нет нигде + канон из чужой папки');
check($stats['videos_missing'], ['absent.mp4', 'config.php'], 'missing видео: нет нигде + traversal-имя (_basename, ext .php отвергнут)');
check($stats['images_copied'], 1, 'копий картинок из ZIP: 1 (zip-приоритет сохранён)');
check($stats['videos_copied'], 1, 'копий видео из ZIP: 1 (zip-приоритет сохранён)');
check($stats['errors'], [], 'ошибок импорта нет');
$r7 = $urls(900007);
check($r7[0]['url'] ?? '', '/uploads/products/zip-slug/video-0.mp4', 'товар 7: видео СКОПИРОВАНО из ZIP (канон video-0.mp4)');
check($r7[1]['url'] ?? '', '/uploads/products/zip-slug/1.jpg', 'товар 7: картинка СКОПИРОВАНА из ZIP (sort 1 — после видео)');
check(is_file($PUBLIC . '/uploads/products/zip-slug/video-0.mp4'), true, 'копия видео из ZIP на диске');
check(is_file($PUBLIC . '/uploads/products/zip-slug/1.jpg'), true, 'копия картинки из ZIP на диске');

/* ── 4. Файлы на диске ── */
check(is_file($PUBLIC . '/uploads/products/test-slug/0.jpg'), true, '0.jpg пережил импорт (защита от удаления)');
check(is_file($PUBLIC . '/uploads/products/test-slug/video-0.mp4'), true, 'video-0.mp4 пережил импорт (защита)');
check(is_file($PUBLIC . '/uploads/products/test-slug/9.jpg'), false, 'мусор 9.jpg удалён как раньше');
check(is_file($PUBLIC . '/uploads/video/клип-сервер.mp4'), true, 'клип в video/ не копировался и цел');
check(is_file($PUBLIC . '/uploads/media/фото-сервер.jpg'), true, 'фото в media/ цело');
$foreign = glob($PUBLIC . '/uploads/products/other-slug/*') ?: [];
check(count($foreign), 0, 'папка other-slug ПУСТАЯ — файлы с сервера НЕ копировались');
check(hash_file('sha256', $ROOT . '/backend/config.php'), $cfgHash, 'backend/config.php не тронут (traversal отсечён)');

/* ── 5. БД: URL и порядок ── */
$r1 = $urls(900001);
check(count($r1), 2, 'товар 1: 2 медиа');
check($r1[0]['url'] ?? '', '/uploads/products/test-slug/video-0.mp4', 'товар 1: видео — свой прежний URL');
check($r1[0]['sort_order'] ?? -1, 0, 'товар 1: видео sort 0 (канонический порядок)');
check($r1[1]['url'] ?? '', '/uploads/products/test-slug/0.jpg', 'товар 1: картинка — свой прежний URL');
$r2 = $urls(900002);
check($r2[0]['url'] ?? '', '/uploads/video/клип-сервер.mp4', 'товар 2: видео из /uploads/video/');
check($r2[1]['url'] ?? '', '/uploads/media/фото-сервер.jpg', 'товар 2: картинка из /uploads/media/');
check(count($urls(900003)), 0, 'товар 3: медиа нет (missing)');
check(count($urls(900004)), 0, 'товар 4: traversal не привязан');
check(count($urls(900005)), 0, 'товар 5: канон «0.jpg» чужой папки НЕ привязан');
$r6 = $urls(900006);
check($r6[0]['url'] ?? '', '/uploads/media/фото-сервер.jpg', 'товар 6: не-каноническое имя найден глобально');

echo "\nИТОГО sandbox: PASS=$PASS FAIL=$FAIL\n";
exit($FAIL === 0 ? 0 : 1);
