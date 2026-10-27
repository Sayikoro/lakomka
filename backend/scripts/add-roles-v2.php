<?php
require __DIR__ . '/../src/Database.php';
$pdo = Database::get();

$pdo->exec('BEGIN IMMEDIATE');
try {
    $cols = $pdo->query('PRAGMA table_info(users)')->fetchAll();
    $names = array_column($cols, 'name');

    if (!in_array('last_login_at', $names, true)) {
        $pdo->exec('ALTER TABLE users ADD COLUMN last_login_at TEXT');
        echo "OK: kolonka last_login_at dobavlena\n";
    } else {
        echo "OK: last_login_at uzhe est\n";
    }

    $pdo->exec('COMMIT');
} catch (Throwable $e) {
    $pdo->exec('ROLLBACK');
    fwrite(STDERR, "ERROR: " . $e->getMessage() . "\n");
    exit(1);
}
