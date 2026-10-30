<?php
/**
 * Очистка рантайм-таблиц в копии БД деплой-пакета.
 *
 * Вызывается из scripts/build-static.sh ПОСЛЕ копирования dev-базы в пакет:
 * в пакете для первого развёртывания не должно быть ничего из песочницы —
 * попыток входа (login_attempts), счётчиков анти-флуда (order_rate) и
 * тестовых заказов. Иначе: мусор в админке и отравленный рейт-лимит
 * (5 «чужих» провальных попыток входа из песочницы блокировали бы вход
 * первому настоящему админу, если хостинг отдаёт REMOTE_ADDR=127.0.0.1).
 *
 * Запуск: php scripts/clean-package-db.php <путь-к-database.sqlite>
 */

$dbPath = $argv[1] ?? '';
if ($dbPath === '' || !is_file($dbPath)) {
    fwrite(STDERR, "Укажите путь к database.sqlite\n");
    exit(1);
}

$pdo = new PDO('sqlite:' . $dbPath);
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$tables = [
    'login_attempts',
    'order_rate',
    'order_status_history',
    'order_items',
    'orders',
];

$pdo->exec('BEGIN IMMEDIATE');
try {
    foreach ($tables as $t) {
        try {
            $n = (int)$pdo->query("SELECT COUNT(*) FROM {$t}")->fetchColumn();
            $pdo->exec("DELETE FROM {$t}");
            if ($n > 0) echo "  cleaned {$t}: {$n}\n";
        } catch (Throwable $e) {
            // таблицы может не быть в старой схеме — не критично
        }
    }
    // сброс автоинкремента заказов, чтобы первый заказ на новом сайте был №1
    try {
        $pdo->exec("DELETE FROM sqlite_sequence WHERE name IN ('orders','order_items','order_status_history')");
    } catch (Throwable $e) {
    }
    $pdo->exec('COMMIT');
} catch (Throwable $e) {
    $pdo->exec('ROLLBACK');
    throw $e;
}

echo "package DB cleaned: {$dbPath}\n";
