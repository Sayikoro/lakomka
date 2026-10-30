<?php
declare(strict_types=1);
/* Task 62: учение по восстановлению составов бандлов после потери БД.
 * Сценарий: bundle_items + weight_recipes погибли; products/images живы.
 *   Drill A: восстановление ТОЛЬКО из экспорт-ZIP товаров  → ожидаем 0 составов (дыра)
 *   Drill B: сначала матрица lakomka2027.csv, потом ZIP    → ожидаем полное совпадение с live
 * Живая БД и public/uploads НЕ трогаются (песочница .sandbox-drill/).
 * Usage: php scripts/task62-recovery-drill.php <export.zip>
 */

$ROOT      = '/home/z/my-project';
$exportZip = $argv[1] ?? '';
if ($exportZip === '' || !is_file($exportZip)) {
    fwrite(STDERR, "usage: php task62-recovery-drill.php <export.zip>\n");
    exit(1);
}

require_once $ROOT . '/backend/src/ProductCsvParser.php';
require_once $ROOT . '/backend/src/Controllers/AdminProductsImportExportController.php';

$SB = $ROOT . '/.sandbox-drill';
$LIVE = new PDO('sqlite:' . $ROOT . '/backend/storage/database.sqlite');
$LIVE->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

/* ---------- helpers ---------- */

function prepSandbox(string $db): void {
    if (is_file($db)) unlink($db);
    copy('/home/z/my-project/backend/storage/database.sqlite', $db);
    $pdo = new PDO('sqlite:' . $db);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec('DELETE FROM bundle_items');
    $pdo->exec('DELETE FROM weight_recipes');
    echo "PREP $db: bundle_items + weight_recipes вычищены (симуляция потери)\n";
}

function bundleSet(PDO $pdo): array {
    $rows = [];
    foreach ($pdo->query('SELECT product_id, component_id, quantity FROM bundle_items') as $r) {
        $rows[] = $r['product_id'] . ':' . $r['component_id'] . ':' . $r['quantity'];
    }
    sort($rows);
    return $rows;
}

function extractZip(string $zipPath, string $dest): array {
    $z = new ZipArchive();
    if ($z->open($zipPath) !== true) throw new RuntimeException("cannot open $zipPath");
    @mkdir($dest . '/img', 0755, true);
    @mkdir($dest . '/vid', 0755, true);
    $images = []; $videos = [];
    for ($i = 0; $i < $z->numFiles; $i++) {
        $n = $z->getNameIndex($i);
        if (str_ends_with($n, '/')) continue;
        if (preg_match('#(^|/)images/(.+)$#i', $n, $m)) {
            $base = basename($m[2]);
            file_put_contents($dest . '/img/' . $base, $z->getFromIndex($i));
            $images[strtolower($base)] = $dest . '/img/' . $base;
        } elseif (preg_match('#(^|/)videos/(.+)$#i', $n, $m)) {
            $base = basename($m[2]);
            file_put_contents($dest . '/vid/' . $base, $z->getFromIndex($i));
            $videos[strtolower($base)] = $dest . '/vid/' . $base;
        }
    }
    $z->close();
    return [$images, $videos];
}

/* import через тот же applyImport, что и боевой (Reflection, т.к. private) */
function runImport(string $sandboxDb, string $zipPath, string $csvPath, array $imageFiles, array $videoFiles, string $fsRoot): array {
    $pdo = new PDO('sqlite:' . $sandboxDb);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $parsed = ProductCsvParser::parse($csvPath);
    if (empty($parsed['rows'])) throw new RuntimeException('нет валидных строк');
    $m = new ReflectionMethod(AdminProductsImportExportController::class, 'applyImport');
    $m->setAccessible(true);
    $stats = $m->invoke(null, $pdo, $parsed, $imageFiles, $videoFiles, $fsRoot);
    $stats['rows_processed'] = $parsed['rows_processed'];
    $stats['parse_errors'] = count($parsed['errors']);
    return $stats;
}

function compare(PDO $live, PDO $drill, string $label): void {
    $ls = bundleSet($live);
    $ds = bundleSet($drill);
    $onlyLive  = array_diff($ls, $ds);
    $onlyDrill = array_diff($ds, $ls);
    $bLive = (int)$live->query('SELECT COUNT(DISTINCT product_id) FROM bundle_items')->fetchColumn();
    $bDrill = (int)$drill->query('SELECT COUNT(DISTINCT product_id) FROM bundle_items')->fetchColumn();
    printf(
        "%s: строк live=%d drill=%d | совпало=%d | только-live=%d | только-drill=%d | бандлов с составом live=%d drill=%d\n",
        $label, count($ls), count($ds), count($ls) - count($onlyLive), count($onlyLive), count($onlyDrill), $bLive, $bDrill
    );
    if ($onlyLive)  echo "  пример только-live: " . implode(', ', array_slice($onlyLive, 0, 5)) . "\n";
    if ($onlyDrill) echo "  пример только-drill: " . implode(', ', array_slice($onlyDrill, 0, 5)) . "\n";
}

/* ---------- подготовка ---------- */
@mkdir($SB, 0755, true);
prepSandbox($SB . '/drill-A.sqlite');
prepSandbox($SB . '/drill-B.sqlite');

/* ---------- Drill B: матрица из lakomka2027.csv в песочницу ---------- */
echo "\n=== Drill B: шаг 1 — восстановление матрицы из backend/scripts/lakomka2027.csv ===\n";
$cmd = escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($ROOT . '/backend/scripts/import-weight-recipes.php') . ' '
     . escapeshellarg($ROOT . '/backend/scripts/lakomka2027.csv') . ' --apply '
     . escapeshellarg($SB . '/drill-B.sqlite') . ' 2>&1';
system($cmd);
$matrixCount = (new PDO('sqlite:' . $SB . '/drill-B.sqlite'))->query('SELECT COUNT(*) FROM weight_recipes')->fetchColumn();
echo "матрица в песочнице B: $matrixCount строк (live: " . $LIVE->query('SELECT COUNT(*) FROM weight_recipes')->fetchColumn() . ")\n";

/* ---------- импорт ZIP в обе песочницы ---------- */
echo "\n=== импорт экспорт-ZIP в песочницы ===\n";
foreach (['A' => $SB . '/drill-A.sqlite', 'B' => $SB . '/drill-B.sqlite'] as $tag => $db) {
    [$imageFiles, $videoFiles] = extractZip($exportZip, $SB . '/zip-' . $tag);
    // CSV из ZIP
    $z = new ZipArchive(); $z->open($exportZip);
    for ($i = 0; $i < $z->numFiles; $i++) {
        if (preg_match('/\.csv$/i', $z->getNameIndex($i))) {
            file_put_contents($SB . "/zip-$tag/products.csv", $z->getFromIndex($i));
            break;
        }
    }
    $z->close();

    $t0 = microtime(true);
    $stats = runImport($db, $exportZip, $SB . "/zip-$tag/products.csv", $imageFiles, $videoFiles, $SB . '/fs-' . $tag);
    printf(
        "Drill %s: строк=%d created=%d updated=%d images=%d videos=%d missing_img=%d errors=%d parse_errors=%d (%.1fs)\n",
        $tag, $stats['rows_processed'], $stats['created'], $stats['updated'],
        $stats['images_copied'], $stats['videos_copied'],
        count($stats['images_missing'] ?? []), count($stats['errors'] ?? []), $stats['parse_errors'],
        microtime(true) - $t0
    );
}

/* ---------- сверка с live ---------- */
echo "\n=== СВЕРКА СОСТАВОВ с живой БД ===\n";
$drillA = new PDO('sqlite:' . $SB . '/drill-A.sqlite');
$drillB = new PDO('sqlite:' . $SB . '/drill-B.sqlite');
$drillA->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$drillB->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
compare($LIVE, $drillA, 'Drill A (только ZIP товаров)');
compare($LIVE, $drillB, 'Drill B (матрица + ZIP)    ');

/* ---------- сколько бандлов в CSV имеют РЕЦЕПТ_ВЕС ---------- */
$parsed = ProductCsvParser::parse($SB . '/zip-A/products.csv');
$with = 0; $without = 0;
foreach ($parsed['rows'] as $r) {
    if ($r['type'] !== 'bundle') continue;
    $r['recipe_weight_g'] !== null ? $with++ : $without++;
}
echo "\nВ экспорт-CSV: бандлов с РЕЦЕПТ_ВЕС=$with, без РЕЦЕПТ_ВЕС=$without (последние — вне конфетной матрицы)\n";
