<?php
/* Task 55: аудит БД, часть 2 — структура products, источники данных фич. */
require_once __DIR__ . '/../backend/src/Database.php';
$pdo = Database::get();

echo "=== products: колонки ===\n";
echo "  " . implode(', ', $pdo->query("PRAGMA table_info(products)")->fetchAll(PDO::FETCH_COLUMN)) . "\n";

echo "\n=== candy_sets: колонки ===\n";
echo "  " . implode(', ', $pdo->query("PRAGMA table_info(candy_sets)")->fetchAll(PDO::FETCH_COLUMN)) . "\n";
echo "=== candy_set_items: колонки ===\n";
echo "  " . implode(', ', $pdo->query("PRAGMA table_info(candy_set_items)")->fetchAll(PDO::FETCH_COLUMN)) . "\n";
echo "=== bundle_items: колонки ===\n";
echo "  " . implode(', ', $pdo->query("PRAGMA table_info(bundle_items)")->fetchAll(PDO::FETCH_COLUMN)) . "\n";
echo "=== weight_recipes: колонки ===\n";
echo "  " . implode(', ', $pdo->query("PRAGMA table_info(weight_recipes)")->fetchAll(PDO::FETCH_COLUMN)) . "\n";

echo "\n=== ТОВАРЫ по активности/наличию ===\n";
$cols = $pdo->query("PRAGMA table_info(products)")->fetchAll(PDO::FETCH_COLUMN);
foreach (['published','status','visible','active','in_stock','stock'] as $c) {
    if (in_array($c, $cols, true)) {
        $st = $pdo->query("SELECT $c, COUNT(*) n FROM products GROUP BY $c");
        while ($r = $st->fetch(PDO::FETCH_ASSOC)) echo "  $c={$r[$c]}: {$r['n']}\n";
    }
}

echo "\n=== Товары без картинок ===\n";
echo "  " . $pdo->query("SELECT COUNT(*) FROM products p WHERE NOT EXISTS (SELECT 1 FROM product_images i WHERE i.product_id=p.id)")->fetchColumn() . "\n";

echo "\n=== Дубли slug ===\n";
echo "  " . $pdo->query("SELECT COUNT(*) FROM (SELECT slug FROM products GROUP BY slug HAVING COUNT(*)>1)")->fetchColumn() . "\n";
