<?php
require __DIR__ . '/../src/Database.php';
$pdo = Database::get();

// Колонка manufacturer
$cols = $pdo->query('PRAGMA table_info(products)')->fetchAll();
$has = false;
foreach ($cols as $c) if ($c['name'] === 'manufacturer') { $has = true; break; }

if (!$has) {
    $pdo->exec('ALTER TABLE products ADD COLUMN manufacturer TEXT');
    echo "OK: kolonka manufacturer dobavlena\n";
} else {
    echo "OK: kolonka manufacturer uzhe est\n";
}

// Заполнение из CSV (колонка «Бренды»)
$csvPath = __DIR__ . '/../../wc-product-export-25-10-2026-1792930154051.csv';
if (!file_exists($csvPath)) {
    echo "WARN: CSV ne najden, propuskayu zapolnenie\n";
    exit(0);
}

$handle = fopen($csvPath, 'r');
$header = fgetcsv($handle, 0, ',', '"', '');
if (isset($header[0])) $header[0] = preg_replace('/^\xEF\xBB\xBF/', '', $header[0]);
$col = array_flip($header);

if (!isset($col['Бренды'])) {
    echo "WARN: v CSV net kolonki 'Бренды', propuskayu\n";
    exit(0);
}

$upd = $pdo->prepare('UPDATE products SET manufacturer = ? WHERE legacy_wc_id = ?');
$filled = 0;

while (($row = fgetcsv($handle, 0, ',', '"', '')) !== false) {
    $id = (int)($row[$col['ID']] ?? 0);
    if (!$id) continue;
    $brands = trim($row[$col['Бренды']] ?? '');
    if ($brands === '') continue;
    // Берём первый бренд, если их несколько через запятую
    $first = trim(explode(',', $brands)[0]);
    if ($first !== '') {
        $upd->execute([$first, $id]);
        $filled++;
    }
}
fclose($handle);

echo "OK: manufacturer zapolnen dlya {$filled} tovarov\n";