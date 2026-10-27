<?php
require __DIR__ . '/../src/Database.php';
$pdo = Database::get();

// 1. Добавить колонку, если нет
$cols = $pdo->query('PRAGMA table_info(products)')->fetchAll();
$hasColumn = false;
foreach ($cols as $c) {
    if ($c['name'] === 'legacy_slug') { $hasColumn = true; break; }
}

if (!$hasColumn) {
    $pdo->exec('ALTER TABLE products ADD COLUMN legacy_slug TEXT');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_products_legacy_slug ON products(legacy_slug)');
    echo "OK: kolonka legacy_slug dobavlena\n";
} else {
    echo "OK: kolonka legacy_slug uzhe est\n";
}

// WP sanitize_title, но с сохранением кириллицы
function wpSanitizeTitle(string $s): string {
    $s = mb_strtolower(trim($s), 'UTF-8');
    $s = preg_replace('/[^\p{L}\p{N}\-]+/u', '-', $s);
    $s = preg_replace('/-+/', '-', $s);
    return trim($s, '-');
}

// 2. Заполнить legacy_slug для всех товаров
$products = $pdo->query(
    'SELECT id, legacy_wc_id, name, legacy_slug FROM products
     ORDER BY legacy_wc_id ASC, id ASC'
)->fetchAll();

$used = [];
$upd = $pdo->prepare('UPDATE products SET legacy_slug = ? WHERE id = ?');
$updated = 0;

foreach ($products as $p) {
    if (!empty($p['legacy_slug'])) {
        $used[$p['legacy_slug']] = true;
        continue;
    }

    $base = wpSanitizeTitle($p['name']);
    if ($base === '') $base = 'product-' . $p['id'];

    $slug = $base;
    $n = 2;
    while (isset($used[$slug])) {
        $slug = $base . '-' . $n;
        $n++;
    }
    $used[$slug] = true;

    $upd->execute([$slug, $p['id']]);
    $updated++;
}

echo "OK: legacy_slug obnovlen dlya {$updated} tovarov\n";