<?php
declare(strict_types=1);
// Task 61: inspect the 04:49 export CSV (pre-user-import state) for products 357-367
$z = new ZipArchive();
if ($z->open('/home/z/my-project/public/exports/lakomka-products-2026-10-29-04-49-05.zip') !== true) {
    fwrite(STDERR, "cannot open zip\n");
    exit(1);
}
for ($i = 0; $i < $z->numFiles; $i++) {
    $n = $z->getNameIndex($i);
    if (!preg_match('/\.csv$/i', $n)) continue;
    $csv = $z->getFromIndex($i);
    echo "CSV file: $n, size=" . strlen($csv) . "\n";
    $lines = explode("\n", $csv);
    echo "header: " . mb_substr($lines[0], 0, 250) . "\n";
    echo "---\n";
    foreach ($lines as $ln) {
        if (preg_match('/^35[7-9];|^36[0-7];/', $ln)) {
            $cols = explode(';', $ln);
            printf(
                "ID=%s | TYPE[%s] | %s | price=%s | weight=%s | recipe_w=[%s] | images=[%s]\n",
                $cols[0] ?? '?',
                $cols[2] ?? '?',
                mb_substr($cols[1] ?? '?', 0, 40),
                $cols[5] ?? '?',
                $cols[9] ?? '?',
                $cols[18] ?? '',
                mb_substr($cols[15] ?? '', 0, 70)
            );
        }
    }
    // total rows
    $cnt = 0;
    foreach ($lines as $ln) if (preg_match('/^\d+;/', $ln)) $cnt++;
    echo "total product rows in export CSV: $cnt\n";
    break;
}
