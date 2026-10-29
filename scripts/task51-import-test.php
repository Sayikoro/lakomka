<?php
/**
 * Task 51: интеграционный тест полного цикла.
 * Импортирует CSV, полученный в editor.html (байт-в-байт равный экспорту),
 * в КОПИЮ основной БД и проверяет, что данные не изменились вообще (no-op).
 */
require_once __DIR__ . '/../backend/src/ProductCsvParser.php';
require_once __DIR__ . '/../backend/src/Controllers/AdminProductsImportExportController.php';

$srcDb = '/home/z/my-project/backend/storage/database.sqlite';
$tmpDb = '/tmp/task51-import-test.sqlite';
@unlink($tmpDb);
copy($srcDb, $tmpDb);

$pdoBefore = new PDO('sqlite:' . $tmpDb);
$before = [];
foreach ($pdoBefore->query('SELECT id, name, type, slug, sku, price_kopecks, old_price_kopecks, stock_qty, weight_g, length_cm, width_cm, height_cm, manufacturer, category_id, description, recipe_weight_g, packaging_material, show_in_catalog, is_published, legacy_slug FROM products ORDER BY id') as $r) {
    $before[$r['id']] = $r;
}
$beforeImages = $pdoBefore->query('SELECT COUNT(*) FROM product_images')->fetchColumn();
$pdoBefore = null;

/* --- парсим CSV, который выдал editor.html (байт-в-байт экспорт) --- */
$parsed = ProductCsvParser::parse('/tmp/mine-full.csv');
echo "CSV: строк=", count($parsed['rows']), " ошибок=", count($parsed['errors']), PHP_EOL;
if ($parsed['errors']) { print_r($parsed['errors']); exit(1); }

/* --- импорт в копию БД (без медиа-файлов) --- */
/* ВАЖНО: пятый аргумент — песочница ФС. applyImport трогает файлы (unlink/copy);
   без песочницы no-op-тест на копии БД вытер 432 файла живого сайта (урок 2026-10-28). */
$sandboxFs = '/tmp/task51-fs';
if (!is_dir($sandboxFs . '/uploads/products')) mkdir($sandboxFs . '/uploads/products', 0755, true);
$pdo = new PDO('sqlite:' . $tmpDb);
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$ref = new ReflectionMethod('AdminProductsImportExportController', 'applyImport');
$ref->setAccessible(true);
$stats = $ref->invoke(null, $pdo, $parsed, [], [], $sandboxFs);
printf("applyImport: created=%d updated=%d errors=%d\n", $stats['created'], $stats['updated'], count($stats['errors']));
if ($stats['errors']) { print_r(array_slice($stats['errors'], 0, 5)); }

/* --- сверка данных до/после --- */
$pdo->sqlite_busy_timeout = 1000;
$after = [];
foreach ($pdo->query('SELECT id, name, type, slug, sku, price_kopecks, old_price_kopecks, stock_qty, weight_g, length_cm, width_cm, height_cm, manufacturer, category_id, description, recipe_weight_g, packaging_material, show_in_catalog, is_published, legacy_slug FROM products ORDER BY id') as $r) {
    $after[$r['id']] = $r;
}
$diffs = 0;
foreach ($before as $id => $b) {
    if (!isset($after[$id])) { $diffs++; echo "товар $id исчез!\n"; continue; }
    foreach ($b as $k => $v) {
        if ((string)($after[$id][$k] ?? '') !== (string)$v) {
            $diffs++;
            if ($diffs <= 5) echo "товар $id поле $k: до=", var_export($v, true), " после=", var_export($after[$id][$k], true), "\n";
        }
    }
}
if (count($after) !== count($before)) { $diffs++; echo "кол-во товаров изменилось!\n"; }
printf("товаров: %d → %d | расхождений: %d\n", count($before), count($after), $diffs);
echo $diffs === 0 ? "✓ ПОЛНЫЙ ЦИКЛ ЭКСПОРТ→РЕДАКТОР→ИМПОРТ: ДАННЫЕ НЕ ИЗМЕНИЛИСЬ (no-op)\n" : "✗ ЕСТЬ РАЗЛИЧИЯ\n";

/* спот-чек хвоста NBSP у товара 113 */
$r113 = $after[113] ?? null;
if ($r113) {
    $tail = mb_substr((string)$r113['description'], -4);
    echo 'товар 113 хвост описания: ';
    foreach (str_split($tail) as $ch) echo ord($ch), ' ';
    echo "(ожидаем ...33 13 10 194 160 в конце — NBSP сохранён)\n";
}
