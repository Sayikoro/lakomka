<?php
require __DIR__ . '/../src/Database.php';
$pdo = Database::get();

echo "=== ДО фикса ===\n";
$tables = ['product_images', 'bundle_items', 'order_items', 'weight_recipes'];
foreach ($tables as $t) {
    $fk = $pdo->query("PRAGMA foreign_key_list($t)")->fetchAll();
    echo "  $t:\n";
    foreach ($fk as $f) {
        echo "    → {$f['table']}({$f['from']} → {$f['to']})\n";
    }
}
echo "\n";

$pdo->exec('PRAGMA foreign_keys = OFF');
$pdo->exec('BEGIN IMMEDIATE');

try {
    /* ============================================================
       1. product_images
       ============================================================ */
    $pdo->exec('ALTER TABLE product_images RENAME TO _pi_old');
    $pdo->exec(<<<SQL
CREATE TABLE product_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    alt TEXT,
    media_type TEXT NOT NULL DEFAULT 'image',
    sort_order INTEGER NOT NULL DEFAULT 0
)
SQL);
    $pdo->exec(
        'INSERT INTO product_images (id, product_id, url, alt, media_type, sort_order)
         SELECT id, product_id, url, alt, media_type, sort_order FROM _pi_old'
    );
    $pdo->exec('DROP TABLE _pi_old');
    echo "OK: product_images peresozdana\n";

    /* ============================================================
       2. bundle_items
       ============================================================ */
    $pdo->exec('ALTER TABLE bundle_items RENAME TO _bi_old');
    $pdo->exec(<<<SQL
CREATE TABLE bundle_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    component_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1,
    UNIQUE(product_id, component_id)
)
SQL);
    $pdo->exec(
        'INSERT INTO bundle_items (id, product_id, component_id, quantity)
         SELECT id, product_id, component_id, quantity FROM _bi_old'
    );
    $pdo->exec('DROP TABLE _bi_old');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_bundle_product ON bundle_items(product_id)');
    echo "OK: bundle_items peresozdana\n";

    /* ============================================================
       3. order_items
       ============================================================ */
    $pdo->exec('ALTER TABLE order_items RENAME TO _oi_old');
    $pdo->exec(<<<SQL
CREATE TABLE order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    qty INTEGER NOT NULL,
    price_kopecks INTEGER NOT NULL
)
SQL);
    $pdo->exec(
        'INSERT INTO order_items (id, order_id, product_id, product_name, qty, price_kopecks)
         SELECT id, order_id, product_id, product_name, qty, price_kopecks FROM _oi_old'
    );
    $pdo->exec('DROP TABLE _oi_old');
    echo "OK: order_items peresozdana\n";

    /* ============================================================
       4. weight_recipes
       ============================================================ */
    $pdo->exec('ALTER TABLE weight_recipes RENAME TO _wr_old');
    $pdo->exec(<<<SQL
CREATE TABLE weight_recipes (
    weight_g INTEGER NOT NULL,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    PRIMARY KEY (weight_g, product_id)
)
SQL);
    $pdo->exec(
        'INSERT INTO weight_recipes (weight_g, product_id, quantity)
         SELECT weight_g, product_id, quantity FROM _wr_old'
    );
    $pdo->exec('DROP TABLE _wr_old');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_weight_recipes_weight ON weight_recipes(weight_g)');
    echo "OK: weight_recipes peresozdana\n";

    $pdo->exec('COMMIT');
} catch (Throwable $e) {
    $pdo->exec('ROLLBACK');
    $pdo->exec('PRAGMA foreign_keys = ON');
    echo "\nERROR: " . $e->getMessage() . "\n";
    exit(1);
}

$pdo->exec('PRAGMA foreign_keys = ON');

/* ============================================================
   Проверка
   ============================================================ */
echo "\n=== ПОСЛЕ фикса ===\n";
foreach ($tables as $t) {
    $fk = $pdo->query("PRAGMA foreign_key_list($t)")->fetchAll();
    echo "  $t:\n";
    foreach ($fk as $f) {
        echo "    → {$f['table']}({$f['from']} → {$f['to']})\n";
    }
}
echo "\n";

$issues = $pdo->query('PRAGMA foreign_key_check')->fetchAll();
if (empty($issues)) {
    echo "✅ foreign_key_check: чисто\n";
} else {
    echo "⚠️ Остались битые ссылки:\n";
    foreach ($issues as $i) {
        echo "  {$i['table']} (rowid {$i['rowid']}) → {$i['parent']}\n";
    }
}

/* ============================================================
   Статистика
   ============================================================ */
echo "\n=== ДАННЫЕ ===\n";
$q = fn($sql) => (int)$pdo->query($sql)->fetchColumn();
echo "  products:        " . $q('SELECT COUNT(*) FROM products') . "\n";
echo "  product_images:  " . $q('SELECT COUNT(*) FROM product_images') . "\n";
echo "  bundle_items:    " . $q('SELECT COUNT(*) FROM bundle_items') . "\n";
echo "  order_items:     " . $q('SELECT COUNT(*) FROM order_items') . "\n";
echo "  weight_recipes:  " . $q('SELECT COUNT(*) FROM weight_recipes') . "\n";