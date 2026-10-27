<?php

require_once __DIR__ . '/../Crypto.php';

class OrderController
{
    public static function create(PDO $pdo): void
    {
        $raw = file_get_contents('php://input');
        $payload = json_decode($raw, true);

        if (!is_array($payload)) {
            self::fail('Invalid JSON', 400);
        }

        $name    = trim((string)($payload['customer_name'] ?? ''));
        $phone   = trim((string)($payload['customer_phone'] ?? ''));
        $email   = trim((string)($payload['customer_email'] ?? ''));
        $method  = (string)($payload['delivery_method'] ?? '');
        $address = trim((string)($payload['address'] ?? ''));
        $comment = trim((string)($payload['comment'] ?? ''));
        $items   = $payload['items'] ?? [];

        if ($name === '')  self::fail('Укажите имя', 422);
        if ($phone === '') self::fail('Укажите телефон', 422);
        if (!in_array($method, ['pickup', 'city', 'region', 'tk'], true)) {
            self::fail('Некорректный способ доставки', 422);
        }
        if (!is_array($items) || count($items) === 0) {
            self::fail('Корзина пуста', 422);
        }

        $pdo->exec('BEGIN IMMEDIATE');

        try {
            $checkStmt = $pdo->prepare(
                'SELECT id, name, price_kopecks, stock_qty
                 FROM products
                 WHERE id = ? AND is_published = 1'
            );

            $lines = [];
            $total = 0;

            foreach ($items as $row) {
                $productId = (int)($row['product_id'] ?? 0);
                $qty = (int)($row['qty'] ?? 0);

                if ($productId <= 0 || $qty <= 0) {
                    throw new RuntimeException('Некорректная позиция корзины');
                }

                $checkStmt->execute([$productId]);
                $product = $checkStmt->fetch();

                if (!$product) {
                    throw new RuntimeException("Товар #{$productId} не найден");
                }
                if ($product['stock_qty'] < $qty) {
                    throw new RuntimeException(
                        "«{$product['name']}»: осталось {$product['stock_qty']} шт."
                    );
                }

                $lineSum = $product['price_kopecks'] * $qty;
                $total  += $lineSum;

                $lines[] = [
                    'product_id'    => (int)$product['id'],
                    'product_name'  => $product['name'],
                    'qty'           => $qty,
                    'price_kopecks' => (int)$product['price_kopecks'],
                ];
            }

            $orderNumber = 'ЛК-' . date('Ymd') . '-' . str_pad(
                (string)random_int(1, 9999),
                4,
                '0',
                STR_PAD_LEFT
            );

            // Шифруем PII перед сохранением
            $insertOrder = $pdo->prepare(
                'INSERT INTO orders
                    (order_number, customer_name, customer_phone, customer_phone_hash,
                     customer_email, delivery_method, address, comment,
                     total_kopecks, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $insertOrder->execute([
                $orderNumber,
                Crypto::encrypt($name),
                Crypto::encrypt($phone),
                Crypto::phoneHash($phone),
                $email !== '' ? Crypto::encrypt($email) : null,
                $method,
                $address !== '' ? Crypto::encrypt($address) : null,
                $comment !== '' ? Crypto::encrypt($comment) : null,
                $total,
                'new',
            ]);

            $orderId = (int)$pdo->lastInsertId();

            $insertItem = $pdo->prepare(
                'INSERT INTO order_items
                    (order_id, product_id, product_name, qty, price_kopecks)
                 VALUES (?, ?, ?, ?, ?)'
            );
            $deductStock = $pdo->prepare(
                'UPDATE products SET stock_qty = stock_qty - ? WHERE id = ?'
            );

            foreach ($lines as $line) {
                $insertItem->execute([
                    $orderId,
                    $line['product_id'],
                    $line['product_name'],
                    $line['qty'],
                    $line['price_kopecks'],
                ]);
                $deductStock->execute([$line['qty'], $line['product_id']]);
            }

            $pdo->prepare(
                'INSERT INTO order_status_history (order_id, status, comment)
                 VALUES (?, ?, ?)'
            )->execute([$orderId, 'new', 'Заказ создан клиентом']);

            $pdo->exec('COMMIT');

            // Письма — после COMMIT, ошибки не ломают ответ
            try {
                require_once __DIR__ . '/../Mailer.php';
                $mailer = new Mailer();
                $fullOrder = [
                    'order_number'    => $orderNumber,
                    'customer_name'   => $name,     // в письме — открытым
                    'customer_phone'  => $phone,
                    'delivery_method' => $method,
                    'address'         => $address,
                    'comment'         => $comment,
                    'total_kopecks'   => $total,
                ];
                $mailer->sendOrderToCustomer($fullOrder, $lines, $email !== '' ? $email : null);
                $mailer->sendOrderToAdmin($fullOrder, $lines);
            } catch (Throwable $mailErr) {
                error_log('[mail] ' . $mailErr->getMessage());
            }

            jsonResponse([
                'data' => [
                    'order_id'      => $orderId,
                    'order_number'  => $orderNumber,
                    'total_kopecks' => $total,
                    'status'        => 'new',
                ],
            ], 201);

        } catch (Throwable $e) {
            $pdo->exec('ROLLBACK');
            self::fail($e->getMessage(), 422);
        }
    }

    private static function fail(string $message, int $status = 400): never
    {
        jsonResponse(['error' => $message], $status);
    }
}