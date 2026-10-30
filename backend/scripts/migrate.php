<?php
/**
 * Каноническая миграция схемы БД.
 * Создаёт ФИНАЛЬНУЮ структуру сразу (вместо череды одноразовых add/fix скриптов).
 * Идемпотентна: можно запускать повторно.
 *
 * SQL схемы живёт в src/schema.sql — тот же файл использует автосоздание
 * при первом запуске на хостинге (src/Bootstrap.php).
 *
 * Запуск: php scripts/migrate.php
 */
require __DIR__ . '/../src/Database.php';

$pdo = Database::get();

$sql = file_get_contents(__DIR__ . '/../src/schema.sql');
if ($sql === false) {
    fwrite(STDERR, "Не найден src/schema.sql\n");
    exit(1);
}

$pdo->exec($sql);

echo "OK: migrate completed (canonical schema v1)\n";
