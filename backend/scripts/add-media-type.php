<?php
require __DIR__ . '/../src/Database.php';
$pdo = Database::get();

// 1. Добавить колонку media_type
$cols = $pdo->query('PRAGMA table_info(product_images)')->fetchAll();
$has = false;
foreach ($cols as $c) {
    if ($c['name'] === 'media_type') { $has = true; break; }
}

if (!$has) {
    $pdo->exec("ALTER TABLE product_images ADD COLUMN media_type TEXT NOT NULL DEFAULT 'image'");
    echo "OK: kolonka media_type dobavlena\n";
} else {
    echo "OK: kolonka media_type uzhe est\n";
}

// 2. Перенести video_url из products в product_images как медиа-элементы
$withVideo = $pdo->query(
    'SELECT id, video_url FROM products WHERE video_url IS NOT NULL AND video_url <> ""'
)->fetchAll();

$inserted = 0;
$checkDup = $pdo->prepare(
    "SELECT 1 FROM product_images WHERE product_id = ? AND url = ? AND media_type = 'video'"
);
$maxSort = $pdo->prepare('SELECT COALESCE(MAX(sort_order), -1) FROM product_images WHERE product_id = ?');
$insertStmt = $pdo->prepare(
    "INSERT INTO product_images (product_id, url, alt, media_type, sort_order) VALUES (?, ?, NULL, 'video', ?)"
);

$pdo->exec('BEGIN IMMEDIATE');
try {
    foreach ($withVideo as $row) {
        $pid = (int)$row['id'];
        $url = $row['video_url'];

        $checkDup->execute([$pid, $url]);
        if ($checkDup->fetchColumn()) continue;

        $maxSort->execute([$pid]);
        $next = (int)$maxSort->fetchColumn() + 1;

        $insertStmt->execute([$pid, $url, $next]);
        $inserted++;
    }
    $pdo->exec('COMMIT');
} catch (Throwable $e) {
    $pdo->exec('ROLLBACK');
    echo "ERROR: " . $e->getMessage() . "\n";
    exit(1);
}

echo "OK: video pereneseno v media: {$inserted}\n";

// 3. Статистика
$counts = $pdo->query(
    "SELECT media_type, COUNT(*) c FROM product_images GROUP BY media_type"
)->fetchAll();
foreach ($counts as $r) {
    echo "  {$r['media_type']}: {$r['c']}\n";
}