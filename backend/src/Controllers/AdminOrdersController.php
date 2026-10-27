<?php

require_once __DIR__ . '/../Auth.php';
require_once __DIR__ . '/../Crypto.php';

class AdminOrdersController
{
    public static function list(PDO $pdo): void
    {
        Auth::requireAuth();

        $status = $_GET['status'] ?? null;
        $phone  = trim($_GET['phone'] ?? '');
        $number = trim($_GET['number'] ?? '');

        $sql = 'SELECT id, order_number, customer_name, customer_phone, customer_email,
                       total_kopecks, status, delivery_method, created_at
                FROM orders WHERE 1=1';
        $params = [];

        if ($status !== null && $status !== '') {
            $sql .= ' AND status = ?';
            $params[] = $status;
        }

        if ($phone !== '') {
            $hash = Crypto::phoneHash($phone);
            if ($hash === null) {
                jsonResponse(['data' => []]);
            }
            $sql .= ' AND customer_phone_hash = ?';
            $params[] = $hash;
        }

        if ($number !== '') {
            $sql .= ' AND order_number LIKE ?';
            $params[] = "%$number%";
        }

        $sql .= ' ORDER BY id DESC LIMIT 200';

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $orders = $stmt->fetchAll();

        foreach ($orders as &$o) {
            $o['customer_name']  = Crypto::decrypt($o['customer_name']);
            $o['customer_phone'] = Crypto::decrypt($o['customer_phone']);
            $o['customer_email'] = Crypto::decrypt($o['customer_email']);
        }
        unset($o);

        $itemsStmt = $pdo->prepare(
            'SELECT product_name, qty FROM order_items WHERE order_id = ?'
        );
        foreach ($orders as &$o) {
            $itemsStmt->execute([$o['id']]);
            $o['items_preview'] = $itemsStmt->fetchAll();
        }
        unset($o);

        jsonResponse(['data' => $orders]);
    }

    public static function show(PDO $pdo, int $id): void
    {
        Auth::requireAuth();

        $stmt = $pdo->prepare('SELECT * FROM orders WHERE id = ?');
        $stmt->execute([$id]);
        $order = $stmt->fetch();

        if (!$order) jsonResponse(['error' => 'Not found'], 404);

        $order['customer_name']  = Crypto::decrypt($order['customer_name']);
        $order['customer_phone'] = Crypto::decrypt($order['customer_phone']);
        $order['customer_email'] = Crypto::decrypt($order['customer_email']);
        $order['address']        = Crypto::decrypt($order['address']);
        $order['comment']        = Crypto::decrypt($order['comment']);

        $items = $pdo->prepare('SELECT * FROM order_items WHERE order_id = ?');
        $items->execute([$id]);
        $order['items'] = $items->fetchAll();

        $history = $pdo->prepare(
            'SELECT status, comment, created_at FROM order_status_history
             WHERE order_id = ? ORDER BY id ASC'
        );
        $history->execute([$id]);
        $order['history'] = $history->fetchAll();

        jsonResponse(['data' => $order]);
    }

    public static function updateStatus(PDO $pdo, int $id): void
    {
        Auth::requireAuth();

        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true) ?? [];
        $status = (string)($data['status'] ?? '');
        $comment = trim((string)($data['comment'] ?? ''));

        $allowed = ['new', 'confirmed', 'paid', 'shipped', 'done', 'cancelled'];
        if (!in_array($status, $allowed, true)) {
            jsonResponse(['error' => 'Некорректный статус'], 422);
        }

        // Загружаем заказ для письма (до COMMIT, чтобы расшифровать PII)
        $orderStmt = $pdo->prepare('SELECT * FROM orders WHERE id = ?');
        $orderStmt->execute([$id]);
        $order = $orderStmt->fetch();
        if (!$order) jsonResponse(['error' => 'Заказ не найден'], 404);

        $pdo->exec('BEGIN IMMEDIATE');
        try {
            $pdo->prepare('UPDATE orders SET status = ? WHERE id = ?')
                ->execute([$status, $id]);

            $pdo->prepare(
                'INSERT INTO order_status_history (order_id, status, comment)
                 VALUES (?, ?, ?)'
            )->execute([$id, $status, $comment !== '' ? $comment : null]);

            $pdo->exec('COMMIT');
        } catch (Throwable $e) {
            $pdo->exec('ROLLBACK');
            jsonResponse(['error' => $e->getMessage()], 500);
        }

        // Письмо — только для confirmed / shipped / cancelled
        if (in_array($status, ['confirmed', 'shipped', 'cancelled'], true)) {
            try {
                require_once __DIR__ . '/../Mailer.php';
                $mailer = new Mailer();

                $email = Crypto::decrypt($order['customer_email']);
                $name  = Crypto::decrypt($order['customer_name']);

                $fullOrder = [
                    'order_number'    => $order['order_number'],
                    'customer_name'   => $name,
                    'total_kopecks'   => (int)$order['total_kopecks'],
                    'delivery_method' => $order['delivery_method'],
                ];

                $mailer->sendOrderStatusChanged($fullOrder, $status, $email ?: null);
            } catch (Throwable $mailErr) {
                error_log('[mail status] ' . $mailErr->getMessage());
            }
        }

        jsonResponse(['data' => ['id' => $id, 'status' => $status]]);
    }
}