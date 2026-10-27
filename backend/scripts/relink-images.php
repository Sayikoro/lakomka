<?php
/**
 * Привязка локальных файлов изображений к товарам БД.
 *
 * Аналог download-external-images.php, но БЕЗ скачивания: если файлы уже лежат
 * в public/uploads/products/<slug>/ (cover.* и ext-N.*), просто переписывает
 * внешние URL в product_images на локальные пути.
 *
 * Запуск: php scripts/relink-images.php
 */
require __DIR__ . '/../src/Database.php';

$pdo = Database::get();

$rows = $pdo->query(
    "SELECT i.id, i.product_id, i.sort_order, i.url, p.slug AS product_slug
     FROM product_images i
     JOIN products p ON p.id = i.product_id
     WHERE i.url LIKE 'http%'
     ORDER BY p.id, i.sort_order, i.id"
)->fetchAll();

if (!$rows) {
    echo "OK: vneshnih izobrazhenij v DB net\n";
    exit(0);
}

$byProduct = [];
foreach ($rows as $r) {
    $byProduct[$r['product_slug']][] = $r;
}

$update = $pdo->prepare('UPDATE product_images SET url = ? WHERE id = ?');
$linked = 0;
$skipped = 0;

foreach ($byProduct as $slug => $images) {
    $safeSlug = preg_replace('/[^a-z0-9\-]/', '', strtolower($slug)) ?: null;
    if (!$safeSlug) { $skipped += count($images); continue; }

    $dir = __DIR__ . '/../../public/uploads/products/' . $safeSlug;
    if (!is_dir($dir)) { $skipped += count($images); continue; }

    // Файлы в порядке приоритета: cover.*, затем ext-N по возрастанию N
    $cover = glob($dir . '/cover.*');
    $exts = glob($dir . '/ext-*.png') + glob($dir . '/ext-*.jpg') + glob($dir . '/ext-*.jpeg') + glob($dir . '/ext-*.webp') + glob($dir . '/ext-*.gif');
    usort($exts, fn($a, $b) => (int)preg_replace('/\D/', '', basename($a)) <=> (int)preg_replace('/\D/', '', basename($b)));
    $files = array_merge($cover, $exts);

    if (!$files) { $skipped += count($images); continue; }

    foreach ($images as $i => $img) {
        if (!isset($files[$i])) break; // файлов меньше, чем картинок — остальное не трогаем
        $relUrl = '/uploads/products/' . $safeSlug . '/' . basename($files[$i]);
        $update->execute([$relUrl, $img['id']]);
        $linked++;
    }
}

$remaining = (int)$pdo->query(
    "SELECT COUNT(*) FROM product_images WHERE url LIKE 'http%'"
)->fetchColumn();

echo "OK: privyazano: $linked, propushcheno: $skipped, ostalos vneshnih: $remaining\n";
