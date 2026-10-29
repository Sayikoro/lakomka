<?php

/**
 * Task 50: Кастомные наборы конфет.
 * candy_sets        — именованный набор конфет (is_filter=1 → участвует в фильтре «Состав» на витрине).
 * candy_set_items   — состав набора: конфета (products, type=recipe) + количество.
 * Идемпотентно: CREATE TABLE IF NOT EXISTS.
 */

$roots = [
    __DIR__ . '/../storage/database.sqlite',
    __DIR__ . '/../../lakomka/backend/storage/database.sqlite',
];

foreach ($roots as $dbPath) {
    if (!file_exists($dbPath)) {
        echo "SKIP (нет файла): $dbPath\n";
        continue;
    }
    $pdo = new PDO('sqlite:' . $dbPath);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $pdo->exec(<<<SQL
        CREATE TABLE IF NOT EXISTS candy_sets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            is_filter INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    SQL);

    $pdo->exec(<<<SQL
        CREATE TABLE IF NOT EXISTS candy_set_items (
            set_id INTEGER NOT NULL REFERENCES candy_sets(id) ON DELETE CASCADE,
            product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
            quantity INTEGER NOT NULL DEFAULT 1,
            PRIMARY KEY (set_id, product_id)
        )
    SQL);

    // Каскадное удаление работает только при включённом PRAGMA — включаем на уровне соединения
    $pdo->exec('PRAGMA foreign_keys = ON');

    echo "OK: $dbPath\n";
}
echo "Готово.\n";
