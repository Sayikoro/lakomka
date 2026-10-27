<?php
require __DIR__ . '/../src/Database.php';
$pdo = Database::get();

$pdo->exec('BEGIN IMMEDIATE');
try {
    // Таблица рецептов
    $pdo->exec(<<<SQL
CREATE TABLE IF NOT EXISTS weight_recipes (
    weight_g   INTEGER NOT NULL,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity   INTEGER NOT NULL CHECK (quantity > 0),
    PRIMARY KEY (weight_g, product_id)
)
SQL);
    echo "OK: tablica weight_recipes gotova\n";

    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_weight_recipes_weight ON weight_recipes(weight_g)');

    // Поле recipe_weight_g в products
    $cols = $pdo->query('PRAGMA table_info(products)')->fetchAll();
    $names = array_column($cols, 'name');

    if (!in_array('recipe_weight_g', $names, true)) {
        $pdo->exec('ALTER TABLE products ADD COLUMN recipe_weight_g INTEGER');
        echo "OK: kolonka products.recipe_weight_g dobavlena\n";
    } else {
        echo "OK: products.recipe_weight_g uzhe est\n";
    }

    $pdo->exec('COMMIT');
} catch (Throwable $e) {
    $pdo->exec('ROLLBACK');
    fwrite(STDERR, "ERROR: " . $e->getMessage() . "\n");
    exit(1);
}