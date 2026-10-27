<?php
require __DIR__ . '/../src/Database.php';
$pdo = Database::get();

$pdo->exec('BEGIN IMMEDIATE');
try {
    $pdo->exec(<<<SQL
CREATE TABLE IF NOT EXISTS login_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT NOT NULL,
    email TEXT,
    success INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
)
SQL);
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time ON login_attempts(ip, created_at)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_login_attempts_email_time ON login_attempts(email, created_at)');

    echo "OK: tablica login_attempts gotova\n";
    $pdo->exec('COMMIT');
} catch (Throwable $e) {
    $pdo->exec('ROLLBACK');
    fwrite(STDERR, "ERROR: " . $e->getMessage() . "\n");
    exit(1);
}