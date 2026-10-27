<?php
require __DIR__ . '/../src/Database.php';

$pdo = Database::get();

$csvPath = __DIR__ . '/../../wc-product-export-25-10-2026-1792930154051.csv';
if (!file_exists($csvPath)) {
    fwrite(STDERR, "CSV ne najden: $csvPath\n");
    exit(1);
}

$handle = fopen($csvPath, 'r');
$header = fgetcsv($handle, 0, ',', '"', '');
if (isset($header[0])) $header[0] = preg_replace('/^\xEF\xBB\xBF/', '', $header[0]);
$col = array_flip($header);

$needed = ['ID', 'Описание', 'Краткое описание', 'Бренды'];
foreach ($needed as $n) {
    if (!isset($col[$n])) {
        echo "WARN: kolonka '$n' ne najdena v CSV\n";
    }
}

function cleanText(string $s): string
{
    $s = str_replace(["\r\n", "\r"], "\n", $s);
    $s = preg_replace('#<br\s*/?>#i', "\n", $s);
    $s = preg_replace('#</(p|li|div|tr|h[1-6])>#i', "\n", $s);
    $s = preg_replace('#<li\b[^>]*>#i', "- ", $s);
    $s = strip_tags($s);
    $s = html_entity_decode($s, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $s = preg_replace("/\n{3,}/", "\n\n", $s);
    return trim($s);
}

$find = $pdo->prepare('SELECT id, description, manufacturer FROM products WHERE legacy_wc_id = ?');
$upd  = $pdo->prepare('UPDATE products SET description = ?, manufacturer = ? WHERE id = ?');

$descFilled = 0;
$manFilled = 0;
$skipped = 0;
$rowsProcessed = 0;

$pdo->exec('BEGIN IMMEDIATE');
try {
    while (($row = fgetcsv($handle, 0, ',', '"', '')) !== false) {
        $legacyId = (int)($row[$col['ID']] ?? 0);
        if (!$legacyId) continue;

        $rowsProcessed++;

        $find->execute([$legacyId]);
        $p = $find->fetch();
        if (!$p) { $skipped++; continue; }

        $desc = null;
        if (isset($col['Описание'])) {
            $desc = cleanText($row[$col['Описание']] ?? '');
        }
        if (($desc === null || $desc === '') && isset($col['Краткое описание'])) {
            $desc = cleanText($row[$col['Краткое описание']] ?? '');
        }

        $man = null;
        if (isset($col['Бренды'])) {
            $brands = trim($row[$col['Бренды']] ?? '');
            if ($brands !== '') {
                $man = trim(explode(',', $brands)[0]);
            }
        }

        $newDesc = $p['description'];
        $newMan = $p['manufacturer'];

        if (!$newDesc && $desc !== null && $desc !== '') {
            $newDesc = $desc;
            $descFilled++;
        }
        if (!$newMan && $man !== null && $man !== '') {
            $newMan = $man;
            $manFilled++;
        }

        if ($newDesc !== $p['description'] || $newMan !== $p['manufacturer']) {
            $upd->execute([$newDesc, $newMan, $p['id']]);
        }
    }
    $pdo->exec('COMMIT');
} catch (Throwable $e) {
    $pdo->exec('ROLLBACK');
    fwrite(STDERR, "ERROR: " . $e->getMessage() . "\n");
    exit(1);
}
fclose($handle);

echo "OK strok obrabotano: {$rowsProcessed}\n";
echo "OK description zapolnen: {$descFilled}\n";
echo "OK manufacturer zapolnen: {$manFilled}\n";
echo "OK propushcheno (net v BD): {$skipped}\n";