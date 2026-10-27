<?php
require __DIR__ . '/../src/Database.php';
$pdo = Database::get();

$pdo->exec('PRAGMA foreign_keys = OFF');
$pdo->exec('BEGIN IMMEDIATE');

try {
    // Проверяем текущий CHECK
    $sql = $pdo->query(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='products'"
    )->fetchColumn();

    if ($sql && str_contains($sql, "'recipe'")) {
        echo "OK: type uzhe vklyuchaet 'recipe'\n";
        $pdo->exec('COMMIT');
        $pdo->exec('PRAGMA foreign_keys = ON');
        exit(0);
    }

    echo "Peresozdayu tablicu products s rasshirennym CHECK...\n";

    $pdo->exec('ALTER TABLE products RENAME TO products_old');

    $pdo->exec(<<<SQL
CREATE TABLE products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    legacy_wc_id INTEGER UNIQUE,
    sku TEXT,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    manufacturer TEXT,
    type TEXT NOT NULL CHECK (type IN ('simple', 'bundle', 'recipe')),
    price_kopecks INTEGER NOT NULL DEFAULT 0,
    old_price_kopecks INTEGER,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    packaging_material TEXT,
    show_in_catalog INTEGER NOT NULL DEFAULT 1,
    is_published INTEGER NOT NULL DEFAULT 1,
    stock_qty INTEGER NOT NULL DEFAULT 0,
    weight_g INTEGER,
    length_cm REAL,
    width_cm REAL,
    height_cm REAL,
    recipe_weight_g INTEGER,
    video_url TEXT,
    legacy_slug TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
)
SQL);

    $pdo->exec(<<<SQL
INSERT INTO products
    (id, legacy_wc_id, sku, slug, name, description, manufacturer, type,
     price_kopecks, old_price_kopecks, category_id, packaging_material,
     show_in_catalog, is_published, stock_qty,
     weight_g, length_cm, width_cm, height_cm, recipe_weight_g, video_url,
     legacy_slug, created_at)
SELECT
    id, legacy_wc_id, sku, slug, name, description, manufacturer, type,
    price_kopecks, old_price_kopecks, category_id, packaging_material,
    show_in_catalog, is_published, stock_qty,
    weight_g, length_cm, width_cm, height_cm, recipe_weight_g, video_url,
    legacy_slug, created_at
FROM products_old
SQL);

    $pdo->exec('DROP TABLE products_old');

    echo "OK: tablica peresozdana\n";

    // Индексы (старые удалились вместе с таблицей)
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_products_catalog ON products(show_in_catalog, is_published)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_products_type ON products(type)');

    // Мигрируем: все товары, которые есть в weight_recipes → type = 'recipe'
    $upd = $pdo->prepare(
        "UPDATE products SET type = 'recipe', show_in_catalog = 0
         WHERE id IN (SELECT DISTINCT product_id FROM weight_recipes)
           AND type = 'simple'"
    );
    $upd->execute();
    $converted = $upd->rowCount();
    echo "OK: perevedeno v 'recipe': $converted tovarov\n";

    // Статистика
    $stats = $pdo->query(
        'SELECT type, COUNT(*) c FROM products GROUP BY type ORDER BY type'
    )->fetchAll();
    echo "\nItogo po tipam:\n";
    foreach ($stats as $s) {
        echo "  {$s['type']}: {$s['c']}\n";
    }

    $pdo->exec('COMMIT');
    $pdo->exec('PRAGMA foreign_keys = ON');
} catch (Throwable $e) {
    $pdo->exec('ROLLBACK');
    $pdo->exec('PRAGMA foreign_keys = ON');
    fwrite(STDERR, "ERROR: " . $e->getMessage() . "\n");
    exit(1);
}
