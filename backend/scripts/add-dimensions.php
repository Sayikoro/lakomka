<?php
require __DIR__ . '/../src/Database.php';

$pdo = Database::get();

$pdo->exec('BEGIN IMMEDIATE');
try {
    // 1. Колонки
    $cols = $pdo->query('PRAGMA table_info(products)')->fetchAll();
    $existing = array_column($cols, 'name');

    $adds = [
        'weight_g'  => 'INTEGER',
        'length_cm' => 'REAL',
        'width_cm'  => 'REAL',
        'height_cm' => 'REAL',
    ];
    foreach ($adds as $name => $type) {
        if (!in_array($name, $existing, true)) {
            $pdo->exec("ALTER TABLE products ADD COLUMN $name $type");
            echo "OK: kolonka $name dobavlena\n";
        }
    }

    // 2. Заполнение из CSV
    $csvPath = __DIR__ . '/../../wc-product-export-25-10-2026-1792930154051.csv';
    if (!file_exists($csvPath)) {
        $pdo->exec('COMMIT');
        echo "WARN: CSV ne najden, propuskayu zapolnenie\n";
        exit(0);
    }

    $handle = fopen($csvPath, 'r');
    $header = fgetcsv($handle, 0, ',', '"', '');
    if (isset($header[0])) $header[0] = preg_replace('/^\xEF\xBB\xBF/', '', $header[0]);
    $col = array_flip($header);

    $find = $pdo->prepare('SELECT id FROM products WHERE legacy_wc_id = ?');
    $upd  = $pdo->prepare(
        'UPDATE products SET weight_g = ?, length_cm = ?, width_cm = ?, height_cm = ? WHERE id = ?'
    );

    $filled = 0;

    while (($row = fgetcsv($handle, 0, ',', '"', '')) !== false) {
        $legacyId = (int)($row[$col['ID']] ?? 0);
        if (!$legacyId) continue;

        $find->execute([$legacyId]);
        $pid = (int)$find->fetchColumn();
        if (!$pid) continue;

        $w  = trim($row[$col['Вес (г)']]     ?? '');
        $l  = trim($row[$col['Длина (см)']]   ?? '');
        $wd = trim($row[$col['Ширина (см)']]  ?? '');
        $h  = trim($row[$col['Высота (см)']]  ?? '');

        $weight   = ($w  !== '' && is_numeric(str_replace(',', '.', $w)))  ? (int)round((float)str_replace(',', '.', $w)) : null;
        $length   = ($l  !== '' && is_numeric(str_replace(',', '.', $l)))  ? (float)str_replace(',', '.', $l) : null;
        $width    = ($wd !== '' && is_numeric(str_replace(',', '.', $wd))) ? (float)str_replace(',', '.', $wd) : null;
        $height   = ($h  !== '' && is_numeric(str_replace(',', '.', $h)))  ? (float)str_replace(',', '.', $h) : null;

        if ($weight === null && $length === null && $width === null && $height === null) continue;

        $upd->execute([$weight, $length, $width, $height, $pid]);
        $filled++;
    }
    fclose($handle);

    echo "OK: ves/gabarity zapolneny dlya {$filled} tovarov\n";

    // 3. packaging_material из категории (если ещё null)
    $catMap = [
        'zhest'     => 'tin',
        'karton'    => 'cardboard',
        'tekstil'   => 'textile',
        'tuby'      => 'tube',
        'meshochki' => 'pouch',
    ];

    $packCount = 0;
    foreach ($catMap as $catSlug => $mat) {
        $sql = "UPDATE products
                SET packaging_material = ?
                WHERE packaging_material IS NULL
                  AND category_id = (SELECT id FROM categories WHERE slug = ?)";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$mat, $catSlug]);
        $packCount += $stmt->rowCount();
    }
    echo "OK: packaging_material zapolnen iz kategorij: {$packCount}\n";

    $pdo->exec('COMMIT');
} catch (Throwable $e) {
    $pdo->exec('ROLLBACK');
    fwrite(STDERR, "ERROR: " . $e->getMessage() . "\n");
    exit(1);
}