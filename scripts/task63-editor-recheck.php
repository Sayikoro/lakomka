<?php
/* Task 63: PHP-валидация ZIP, собранного ядром editor.html (Node-тест).
   Проверяет: ZipArchive открывает, CRC всех записей валиден,
   ProductCsvParser читает 368 строк без ошибок, цена 357 = 350.01. */
$f = '/tmp/task63-edited.zip';
if (!is_file($f)) { fwrite(STDERR, "нет $f\n"); exit(1); }

$z = new ZipArchive();
$r = @$z->open($f);
if ($r !== true) { fwrite(STDERR, "ZipArchive не открыл (код $r)\n"); exit(1); }
echo "ZipArchive: OK, записей: {$z->numFiles}\n";

$bad = 0;
for ($i = 0; $i < $z->numFiles; $i++) {
    $st = $z->statIndex($i);
    if (!is_array($st)) { $bad++; continue; }
    $data = $z->getFromIndex($i);
    if ($data === false) { $bad++; continue; }
    if (sprintf('%08x', crc32($data)) !== sprintf('%08x', $st['crc'])) $bad++;
}
echo "CRC всех записей: " . ($bad === 0 ? "OK" : "ПЛОХИХ $bad") . "\n";

$csv = $z->getFromName('products.csv');
file_put_contents('/tmp/task63-edited.csv', $csv);
$z->close();

require_once __DIR__ . '/../backend/src/ProductCsvParser.php';
$parsed = ProductCsvParser::parse('/tmp/task63-edited.csv');
echo "ProductCsvParser: строк " . count($parsed['rows']) . ", ошибок " . count($parsed['errors']) . "\n";
foreach (array_slice($parsed['errors'], 0, 5) as $er) echo "  ! $er\n";
$p357 = null;
foreach ($parsed['rows'] as $row) if ($row['id'] === 357) $p357 = $row;
echo "Товар 357: " . ($p357 ? ($p357['name'] . ", цена " . ($p357['price_kopecks'] / 100) . " руб.") : "НЕ НАЙДЕН") . "\n";
$pass = $bad === 0 && count($parsed['rows']) === 368 && count($parsed['errors']) === 0
    && $p357 && $p357['price_kopecks'] === 35001;
echo $pass ? "PHP-ПРОВЕРКА ПРОЙДЕНА\n" : "PHP-ПРОВЕРКА ПРОВАЛЕНА\n";
exit($pass ? 0 : 1);
