<?php
require __DIR__ . '/../src/Database.php';
$pdo = Database::get();

$cols = $pdo->query('PRAGMA table_info(products)')->fetchAll();
$has = false;
foreach ($cols as $c) {
    if ($c['name'] === 'video_url') { $has = true; break; }
}

if (!$has) {
    $pdo->exec('ALTER TABLE products ADD COLUMN video_url TEXT');
    echo "OK: kolonka video_url dobavlena\n";
} else {
    echo "OK: kolonka video_url uzhe est\n";
}

// Папка для картинок
$dir = __DIR__ . '/../../public/uploads/products';
if (!is_dir($dir)) {
    mkdir($dir, 0755, true);
    echo "OK: papka public/uploads/products sozdana\n";
} else {
    echo "OK: papka public/uploads/products uzhe est\n";
}