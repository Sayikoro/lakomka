<?php
/**
 * Бэкфилл weight_g / length_cm / width_cm / height_cm из выгрузки WooCommerce.
 * Колонки в CSV: "Вес (г)", "Длина (см)", "Ширина (см)", "Высота (см)".
 * Матч по ID (legacy_wc_id). Запуск: php scripts/backfill-weight-dims.php <csv>
 */
require __DIR__ . '/../backend/src/Database.php';

$csvPath = $argv[1] ?? '/home/z/my-project/wc-product-export-25-10-2026-1792930154051.csv';
if (!file_exists($csvPath)) {
    fwrite(STDERR, "CSV не найден: $csvPath\n");
    exit(1);
}

$fh = fopen($csvPath, 'r');
$header = fgetcsv($fh, 0, ',', '"', '');
if (!$header) { fwrite(STDERR, "CSV пуст\n"); exit(1); }
if (isset($header[0])) $header[0] = preg_replace('/^\xEF\xBB\xBF/', '', $header[0]);
$col = array_flip($header);

$idx = static function (string ...$names) use ($col): ?int {
    foreach ($names as $n) if (isset($col[$n])) return $col[$n];
    return null;
};
$iId  = $idx('ID');
$iW   = $idx('Вес (г)', 'Weight (g)');
$iL   = $idx('Длина (см)', 'Length (cm)');
$iWd  = $idx('Ширина (см)', 'Width (cm)');
$iH   = $idx('Высота (см)', 'Height (cm)');
if ($iId === null) { fwrite(STDERR, "Нет колонки ID\n"); exit(1); }

$num = static function (?string $v): ?float {
    if ($v === null) return null;
    $v = str_replace([' ', ','], ['', '.'], trim($v));
    if ($v === '' || !is_numeric($v)) return null;
    $f = (float)$v;
    return $f > 0 ? $f : null;
};

$pdo = Database::get();
$pdo->beginTransaction();

$stmt = $pdo->prepare(
    'UPDATE products
     SET weight_g = :w, length_cm = :l, width_cm = :wd, height_cm = :h
     WHERE legacy_wc_id = :id'
);

$updated = 0; $withWeight = 0; $withDims = 0; $missing = 0; $rows = 0;
while (($r = fgetcsv($fh, 0, ',', '"', '')) !== false) {
    if (count(array_filter($r, fn($v) => $v !== null && $v !== '')) === 0) continue;
    $rows++;
    $legacyId = (int)trim($r[$iId]);
    if (!$legacyId) continue;

    $w  = $num($iW  !== null ? $r[$iW]  : null);
    $l  = $num($iL  !== null ? $r[$iL]  : null);
    $wd = $num($iWd !== null ? $r[$iWd] : null);
    $h  = $num($iH  !== null ? $r[$iH]  : null);
    if ($w === null && $l === null && $wd === null && $h === null) continue;

    $stmt->execute([
        ':w' => $w !== null ? (int)round($w) : null,
        ':l' => $l, ':wd' => $wd, ':h' => $h,
        ':id' => $legacyId,
    ]);
    if ($stmt->rowCount() > 0) {
        $updated++;
        if ($w !== null) $withWeight++;
        if ($l !== null || $wd !== null || $h !== null) $withDims++;
    } else {
        $missing++;
    }
}

$pdo->commit();

echo "Строк CSV: $rows\n";
echo "Обновлено товаров: $updated (с весом: $withWeight, с габаритами: $withDims)\n";
echo "Не найдено в БД по legacy_wc_id: $missing\n";

$chk = $pdo->query(
    'SELECT COUNT(*) total,
            SUM(weight_g IS NOT NULL AND weight_g > 0) w,
            SUM(length_cm IS NOT NULL AND length_cm > 0) l
     FROM products'
)->fetch(PDO::FETCH_ASSOC);
echo "Итог в БД: всего {$chk['total']}, с весом {$chk['w']}, с длиной {$chk['l']}\n";
