<?php
require __DIR__ . '/../src/Database.php';

$dbPath = __DIR__ . '/../storage/database.sqlite';
$backupDir = __DIR__ . '/../storage/backups';

if (!is_file($dbPath)) {
    fwrite(STDERR, "БД не найдена: $dbPath\n");
    exit(1);
}

if (!is_dir($backupDir) && !@mkdir($backupDir, 0755, true)) {
    fwrite(STDERR, "Не удалось создать $backupDir\n");
    exit(1);
}

$timestamp = date('Y-m-d-H-i-s');
$backupPath = $backupDir . '/database-' . $timestamp . '.sqlite';

// В WAL-режиме нужно форсировать checkpoint, чтобы данные были в основном файле
$pdo = Database::get();
$pdo->exec('PRAGMA wal_checkpoint(TRUNCATE)');

if (!@copy($dbPath, $backupPath)) {
    fwrite(STDERR, "Не удалось скопировать БД\n");
    exit(1);
}

echo "OK: backup sozdan: storage/backups/database-$timestamp.sqlite (" . round(filesize($backupPath) / 1024, 1) . " KB)\n";

// Оставляем только последние 14 бэкапов
$files = glob($backupDir . '/database-*.sqlite');
if ($files !== false && count($files) > 14) {
    usort($files, fn($a, $b) => filemtime($a) <=> filemtime($b));
    $toDelete = array_slice($files, 0, count($files) - 14);
    foreach ($toDelete as $old) {
        @unlink($old);
        echo "  удалён старый: " . basename($old) . "\n";
    }
}

echo "Хранится бэкапов: " . count(glob($backupDir . '/database-*.sqlite')) . " (макс. 14)\n";