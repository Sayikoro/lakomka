<?php
require __DIR__ . '/../src/Database.php';
require __DIR__ . '/../src/Crypto.php';

$pdo = Database::get();

$pdo->exec('BEGIN IMMEDIATE');
try {
    // 1. Добавить колонку customer_phone_hash, если нет
    $cols = $pdo->query('PRAGMA table_info(orders)')->fetchAll();
    $hasHash = false;
    foreach ($cols as $c) {
        if ($c['name'] === 'customer_phone_hash') { $hasHash = true; break; }
    }

    if (!$hasHash) {
        $pdo->exec('ALTER TABLE orders ADD COLUMN customer_phone_hash TEXT');
        $pdo->exec('CREATE INDEX IF NOT EXISTS idx_orders_phone_hash ON orders(customer_phone_hash)');
        echo "OK: kolonka customer_phone_hash dobavlena\n";
    } else {
        echo "OK: customer_phone_hash uzhe est\n";
    }

    // 2. Пройтись по всем заказам и зашифровать PII
    $orders = $pdo->query(
        'SELECT id, customer_name, customer_phone, customer_email, address, comment,
                customer_phone_hash
         FROM orders'
    )->fetchAll();

    $encrypted = 0;
    $alreadyEncrypted = 0;

    $upd = $pdo->prepare(
        'UPDATE orders SET
            customer_name = ?,
            customer_phone = ?,
            customer_email = ?,
            address = ?,
            comment = ?,
            customer_phone_hash = ?
         WHERE id = ?'
    );

    foreach ($orders as $o) {
        // Проверяем, зашифровано ли уже (по customer_name)
        $isEncrypted = str_starts_with($o['customer_name'] ?? '', 'v1:');

        $needsHash = empty($o['customer_phone_hash']);

        if ($isEncrypted && !$needsHash) {
            $alreadyEncrypted++;
            continue;
        }

        // Расшифровываем (для plaintext — вернёт как есть)
        $name     = Crypto::decrypt($o['customer_name']);
        $phone    = Crypto::decrypt($o['customer_phone']);
        $email    = Crypto::decrypt($o['customer_email']);
        $address  = Crypto::decrypt($o['address']);
        $comment  = Crypto::decrypt($o['comment']);

        // Шифруем заново
        $upd->execute([
            Crypto::encrypt($name),
            Crypto::encrypt($phone),
            Crypto::encrypt($email),
            Crypto::encrypt($address),
            Crypto::encrypt($comment),
            Crypto::phoneHash($phone),
            (int)$o['id'],
        ]);
        $encrypted++;
    }

    $pdo->exec('COMMIT');

    echo "OK: zashifrovano zazorov: {$encrypted}\n";
    echo "OK: uzhe byli zashifrovany: {$alreadyEncrypted}\n";

    // Проверка
    $check = $pdo->query(
        'SELECT id, customer_name, customer_phone FROM orders ORDER BY id DESC LIMIT 3'
    )->fetchAll();
    echo "\nProverka (pervye 3 posle migracii):\n";
    foreach ($check as $c) {
        $preview = substr($c['customer_name'], 0, 40);
        echo "  id={$c['id']}  " . $preview . "...\n";
    }

} catch (Throwable $e) {
    $pdo->exec('ROLLBACK');
    fwrite(STDERR, "ERROR: " . $e->getMessage() . "\n");
    exit(1);
}