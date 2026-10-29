<?php
// Миграция: статус письма клиенту в orders.
// email_sent: NULL = неизвестно (старые заказы) / письма не требовалось; 0 = не ушло; 1 = отправлено.
// email_error: текст ошибки SMTP при неудаче.
// Идемпотентно: колонки добавляются только если их нет.
declare(strict_types=1);

$dbs = [
    __DIR__ . '/../../backend/storage/database.sqlite',
    __DIR__ . '/../../lakomka/backend/storage/database.sqlite',
];

foreach ($dbs as $db) {
    if (!file_exists($db)) { echo "skip (no db): $db\n"; continue; }
    $pdo = new PDO('sqlite:' . $db);

    $cols = array_column($pdo->query('PRAGMA table_info(orders)')->fetchAll(), 'name');

    if (!in_array('email_sent', $cols, true)) {
        $pdo->exec("ALTER TABLE orders ADD COLUMN email_sent INTEGER DEFAULT NULL");
        echo "[$db] + email_sent\n";
    } else {
        echo "[$db] email_sent exists\n";
    }

    if (!in_array('email_error', $cols, true)) {
        $pdo->exec("ALTER TABLE orders ADD COLUMN email_error TEXT DEFAULT NULL");
        echo "[$db] + email_error\n";
    } else {
        echo "[$db] email_error exists\n";
    }
}

// Заказ #1 создан 2026-10-28 09:05, когда SMTP был сломан («Could not authenticate»,
// ошибки в php-errors.log 09:06/09:07/09:12) — помечаем как неотправленный.
foreach ($dbs as $db) {
    if (!file_exists($db)) continue;
    $pdo = new PDO('sqlite:' . $db);
    $st = $pdo->prepare(
        "UPDATE orders
         SET email_sent = 0, email_error = 'SMTP Error: Could not authenticate (SMTP был сломан в момент создания заказа)'
         WHERE id = 1 AND email_sent IS NULL"
    );
    $st->execute();
    if ($st->rowCount()) echo "[$db] order#1 marked email_sent=0\n";
}

echo "migration done\n";
