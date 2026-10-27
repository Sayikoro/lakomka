<?php
require __DIR__ . '/../src/Database.php';
$pdo = Database::get();

$pdo->exec('BEGIN IMMEDIATE');
try {
    // Проверяем текущее ограничение
    $sql = $pdo->query(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='users'"
    )->fetchColumn();

    if ($sql && str_contains($sql, "'super_admin'")) {
        echo "OK: roli uzhe rasshireny\n";
        $pdo->exec('COMMIT');
        exit(0);
    }

    // Пересоздаём таблицу с расширенным CHECK
    $pdo->exec('ALTER TABLE users RENAME TO users_old');
    $pdo->exec(<<<SQL
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT,
    role TEXT NOT NULL DEFAULT 'viewer'
        CHECK (role IN ('super_admin', 'editor', 'viewer')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
)
SQL);

    // Переносим данные, 'admin' → 'super_admin'
    $pdo->exec(<<<SQL
INSERT INTO users (id, email, password_hash, name, role, created_at)
SELECT id, email, password_hash, name,
       CASE WHEN role = 'admin' THEN 'super_admin' ELSE role END,
       created_at
FROM users_old
SQL);

    $pdo->exec('DROP TABLE users_old');
    $pdo->exec('COMMIT');
    echo "OK: roli rasshireny (super_admin / editor / viewer)\n";
} catch (Throwable $e) {
    $pdo->exec('ROLLBACK');
    fwrite(STDERR, "ERROR: " . $e->getMessage() . "\n");
    exit(1);
}