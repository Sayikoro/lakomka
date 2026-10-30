<?php
/* Task 63: no-op round-trip тест «живого архива».
   1) бэкап БД; 2) чанковая загрузка архива; 3) импорт;
   4) проверка счётчиков/дрейфа; 5) отчёт о синхронизации архива. */

$root = '/home/z/my-project';
$zipPath = $root . '/public/exports/lakomka-products.zip';
if (!is_file($zipPath)) exit("Архив не найден: $zipPath\n");

require_once $root . '/backend/src/Database.php';
require_once $root . '/backend/src/Auth.php';

$pdo = Database::get();
$pdo->exec('PRAGMA wal_checkpoint(TRUNCATE)');
copy($root . '/backend/storage/database.sqlite', '/tmp/db-before-import.sqlite');
echo "DB backup ok: /tmp/db-before-import.sqlite\n";

$token = Auth::issueToken(1, 'admin@local.test', 'super_admin');
$base = 'http://127.0.0.1:8000';

function post(string $url, array $payload, string $token): array
{
    $ctx = stream_context_create(['http' => [
        'method'  => 'POST',
        'header'  => "Content-Type: application/json\r\nCookie: admin_token=$token\r\n",
        'content' => json_encode($payload),
        'timeout' => 900,
        'ignore_errors' => true,
    ]]);
    $body = file_get_contents($url, false, $ctx);
    $code = explode(' ', $http_response_header[0] ?? '')[1] ?? '?';
    return ['code' => $code, 'json' => json_decode((string)$body, true)];
}

/* Что должно произойти с бандлами 357–367: смотрим РЕЦЕПТ_ВЕС в CSV */
$z = new ZipArchive();
$z->open($zipPath);
$csv = $z->getFromName('products.csv');
$z->close();
foreach (explode("\n", $csv) as $line) {
    if (preg_match('/^357;/', $line)) {
        $cols = str_getcsv($line, ';');
        echo "row357 РЕЦЕПТ_ВЕС (col18): '" . ($cols[18] ?? '') . "', УПАКОВКА: '" . ($cols[19] ?? '') . "'\n";
        break;
    }
}

/* Снимки до */
function counts(PDO $pdo): array
{
    $q = fn (string $t) => (int)$pdo->query("SELECT COUNT(*) FROM $t")->fetchColumn();
    return [
        'products' => $q('products'),
        'product_images' => $q('product_images'),
        'bundle_items' => $q('bundle_items'),
        'weight_recipes' => $q('weight_recipes'),
        'candy_sets' => $q('candy_sets'),
    ];
}
function bundleHash(PDO $pdo): string
{
    $rows = $pdo->query('SELECT product_id, component_id, quantity FROM bundle_items ORDER BY product_id, component_id, quantity')->fetchAll(PDO::FETCH_ASSOC);
    return md5(json_encode($rows));
}
function newBundles(PDO $pdo): array
{
    $out = [];
    foreach ($pdo->query('SELECT product_id, COUNT(*) n FROM bundle_items WHERE product_id BETWEEN 357 AND 367 GROUP BY product_id') as $r) {
        $out[(int)$r['product_id']] = (int)$r['n'];
    }
    ksort($out);
    return $out;
}

$before = counts($pdo);
$bHashBefore = bundleHash($pdo);
$nbBefore = newBundles($pdo);
echo "counts before: " . json_encode($before) . "\n";
echo "bundle_items hash before: $bHashBefore\n";
echo "bundles 357-367 before: " . json_encode($nbBefore) . "\n";

/* 1) Чанковая загрузка архива */
$uploadId = 'task63test' . substr((string)time(), -5);
$size = filesize($zipPath);
$chunkSize = 4 * 1024 * 1024;
$total = (int)ceil($size / $chunkSize);
echo "upload: $size bytes в $total чанках\n";
$fh = fopen($zipPath, 'rb');
for ($i = 0; $i < $total; $i++) {
    $chunk = fread($fh, $chunkSize);
    $r = post("$base/api/admin/upload/chunk", [
        'upload_id'    => $uploadId,
        'chunk_index'  => $i,
        'total_chunks' => $total,
        'filename'     => 'lakomka-products.zip',
        'chunk_base64' => base64_encode($chunk),
    ], $token);
    if ($r['code'] !== '200') {
        echo "chunk $i FAILED: {$r['code']} " . json_encode($r['json']) . "\n";
        exit(1);
    }
    if ($i % 5 === 0 || $i === $total - 1) echo "  chunk " . ($i + 1) . "/$total ok\n";
}
fclose($fh);
$filePath = $uploadId . '.zip';
echo "assembled: $filePath\n";

/* 2) Импорт */
$r = post("$base/api/admin/products/import-zip", ['file_path' => $filePath], $token);
echo "import http {$r['code']}\n";
$d = $r['json']['data'] ?? null;
if (!$d) {
    echo "RESPONSE: " . json_encode($r['json']) . "\n";
    exit(1);
}
echo "rows_processed: {$d['rows_processed']}, created: {$d['created']}, updated: {$d['updated']}\n";
echo "images_copied: {$d['images_copied']}, videos_copied: {$d['videos_copied']}\n";
echo "parse_errors: " . count($d['parse_errors']) . ", import_errors: " . count($d['import_errors']) . "\n";
echo "images_missing: " . count($d['images_missing']) . ", videos_missing: " . count($d['videos_missing']) . "\n";
echo "ARCHIVE SYNC: " . json_encode($d['archive'], JSON_UNESCAPED_UNICODE) . "\n";

/* 3) Сверка после */
$after = counts($pdo);
$bHashAfter = bundleHash($pdo);
$nbAfter = newBundles($pdo);
echo "counts after:  " . json_encode($after) . "\n";
echo "bundle_items hash after:  $bHashAfter\n";
echo "bundles 357-367 after:  " . json_encode($nbAfter) . "\n";
echo ($before == $after ? "✓ COUNTS MATCH" : "✗ COUNTS CHANGED!") . "\n";
echo ($bHashBefore === $bHashAfter ? "✓ BUNDLE_ITEMS IDENTICAL" : "✗ BUNDLE_ITEMS DRIFT!") . "\n";
