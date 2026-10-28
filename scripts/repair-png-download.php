<?php
/* ============================================================
   Ремонт битых (truncated) PNG фото товаров.
   Причина: backend/scripts/download-external-images.php качал
   с CURLOPT_TIMEOUT=8 без проверки Content-Length — оборванные
   загрузки сохранялись как готовые файлы (libpng read error).

   Скрипт: находит .png без .webp-соседа (не сконвертировались в
   convert-png-to-webp.js), восстанавливает исходный URL из WC-
   экспорта (legacy_wc_id + позиция по sort_order) и скачивает
   заново в .png-repair/<dir>/<n>.bin с проверкой полноты.
   Запуск: .ztools/php scripts/repair-png-download.php
   ============================================================ */

require __DIR__ . '/../backend/src/Database.php';
$pdo = Database::get();

$root      = '/home/z/my-project';
$products  = "$root/public/uploads/products";
$repairDir = "$root/.png-repair";
$csvPath   = "$root/wc-product-export-25-10-2026-1792930154051.csv";

if (!is_dir($repairDir)) mkdir($repairDir, 0755, true);

/* 1. Битые файлы: .png без .webp-соседа */
$corrupt = [];
foreach (scandir($products) as $dir) {
    if ($dir[0] === '.' || !is_dir("$products/$dir")) continue;
    foreach (scandir("$products/$dir") as $f) {
        if (substr($f, -4) === '.png' && !file_exists("$products/$dir/" . substr($f, 0, -4) . '.webp')) {
            $corrupt[] = [$dir, $f];
        }
    }
}
echo "Битых PNG: " . count($corrupt) . "\n";
if (!$corrupt) exit(0);

/* 2. CSV: legacy_wc_id → [urls] */
$h = fopen($csvPath, 'r');
$header = fgetcsv($h, 0, ',', '"', '');
$imgIdx = array_search('Изображения', $header);
if ($imgIdx === false) { fwrite(STDERR, "Нет колонки «Изображения»\n"); exit(1); }
$csvImages = [];
while (($row = fgetcsv($h, 0, ',', '"', '')) !== false) {
    if (!isset($row[0]) || $row[0] === '' || !ctype_digit((string)$row[0])) continue;
    $urls = array_values(array_filter(array_map('trim', explode(',', $row[$imgIdx] ?? ''))));
    if ($urls) $csvImages[(int)$row[0]] = $urls;
}
fclose($h);
echo "Товаров в CSV с картинками: " . count($csvImages) . "\n";

/* 3. План ремонта */
$plan = [];
$noUrl = [];
foreach ($corrupt as [$dir, $file]) {
    $pos = (int)$file;                       // «0.png» → 0
    $p = $pdo->prepare("SELECT id, legacy_wc_id FROM products WHERE slug = ?");
    $p->execute([$dir]);
    $prod = $p->fetch(PDO::FETCH_ASSOC);
    if (!$prod || empty($prod['legacy_wc_id'])) { $noUrl[] = "$dir/$file (нет товара/legacy_wc_id)"; continue; }
    $urls = $csvImages[(int)$prod['legacy_wc_id']] ?? [];
    if (!isset($urls[$pos])) { $noUrl[] = "$dir/$file (в CSV позиция $pos отсутствует)"; continue; }
    $plan[] = ['dir' => $dir, 'file' => $file, 'url' => $urls[$pos]];
}
echo "К перекачиванию: " . count($plan) . ", без URL: " . count($noUrl) . "\n";
foreach ($noUrl as $n) echo "  ! $n\n";

/* 4. Скачивание с проверкой полноты */
$ok = 0; $fail = [];
foreach ($plan as $i => $item) {
    $ch = curl_init($item['url']);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS      => 5,
        CURLOPT_TIMEOUT        => 180,          // полный файл, без жёсткого обрыва
        CURLOPT_CONNECTTIMEOUT => 15,
        CURLOPT_USERAGENT      => 'Mozilla/5.0 (compatible; Lakomka-Import/1.0)',
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => 0,
        CURLOPT_HEADERFUNCTION => function ($ch, $line) use (&$cl) {
            if (preg_match('/^Content-Length:\s*(\d+)/i', $line, $m)) $cl = (int)$m[1];
            return strlen($line);
        },
    ]);
    $cl = null;
    $body = curl_exec($ch);
    $http = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err  = curl_error($ch);
    curl_close($ch);

    $received = $body === false ? 0 : strlen($body);
    $complete = $http === 200 && $received > 0 && ($cl === null || $received === $cl);

    if (!$complete) {
        $fail[] = sprintf("%s/%s <- %s (HTTP %d, получено %s из %s) %s",
            $item['dir'], $item['file'], $item['url'], $http,
            $received ?: 0, $cl ?? '?', $err);
        echo "  [" . ($i + 1) . "/" . count($plan) . "] FAIL {$item['dir']}/{$item['file']}\n";
        continue;
    }

    $dest = "$repairDir/{$item['dir']}/" . substr($item['file'], 0, -4) . '.bin';
    if (!is_dir(dirname($dest))) mkdir(dirname($dest), 0755, true);
    file_put_contents($dest, $body);
    file_put_contents("$dest.url", $item['url']);
    $ok++;
    echo "  [" . ($i + 1) . "/" . count($plan) . "] OK {$item['dir']}/{$item['file']} ($received байт)\n";
}

echo "\nСкачано: $ok, ошибок: " . count($fail) . "\n";
foreach ($fail as $f) echo "  • $f\n";
echo "\nДалее: node scripts/repair-png-convert.js\n";
