<?php

require_once __DIR__ . '/../Auth.php';
require_once __DIR__ . '/../AdminLog.php';
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
                       total_kopecks, status, delivery_method, created_at,
                       email_sent, email_error
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

    /** GET /api/admin/orders/unread?since_id=N — бейдж новых заказов (Task 97-106).
     *  count_since — заказов с id > since_id (любой статус — заказ мог быстро
     *  подтвердиться); count_new — всего в статусе «new»; max_id/latest — для
     *  запоминания «прочитано» и всплывающего уведомления. */
    public static function unread(PDO $pdo): void
    {
        Auth::requireAuth();

        $sinceId = (int)($_GET['since_id'] ?? 0);
        if ($sinceId < 0) $sinceId = 0;

        $st = $pdo->prepare('SELECT COUNT(*) FROM orders WHERE id > ?');
        $st->execute([$sinceId]);
        $countSince = (int)$st->fetchColumn();

        $countNew = (int)$pdo->query(
            "SELECT COUNT(*) FROM orders WHERE status = 'new'"
        )->fetchColumn();

        $maxId = (int)$pdo->query('SELECT COALESCE(MAX(id), 0) FROM orders')->fetchColumn();

        $latest = null;
        if ($countSince > 0) {
            $st = $pdo->prepare(
                'SELECT id, order_number, customer_name, total_kopecks, created_at
                 FROM orders WHERE id > ? ORDER BY id DESC LIMIT 1'
            );
            $st->execute([$sinceId]);
            if ($row = $st->fetch()) {
                $latest = [
                    'id'            => (int)$row['id'],
                    'order_number'  => $row['order_number'],
                    'customer_name' => Crypto::decrypt($row['customer_name']),
                    'total_kopecks' => (int)$row['total_kopecks'],
                    'created_at'    => $row['created_at'],
                ];
            }
        }

        jsonResponse(['data' => [
            'count_since' => $countSince,
            'count_new'   => $countNew,
            'max_id'      => $maxId,
            'latest'      => $latest,
        ]]);
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

    /**
     * Повторная отправка письма клиенту (кнопка «Отправить клиенту» в админке).
     * Обновляет email_sent/email_error по факту попытки.
     */
    public static function resendEmail(PDO $pdo, int $id): void
    {
        Auth::requireEditor();

        $stmt = $pdo->prepare('SELECT * FROM orders WHERE id = ?');
        $stmt->execute([$id]);
        $order = $stmt->fetch();
        if (!$order) jsonResponse(['error' => 'Заказ не найден'], 404);

        $email = Crypto::decrypt($order['customer_email']);
        if ($email === '') {
            jsonResponse(['error' => 'У заказа не указан email клиента'], 422);
        }

        $itemsStmt = $pdo->prepare(
            'SELECT product_name, qty, price_kopecks FROM order_items WHERE order_id = ?'
        );
        $itemsStmt->execute([$id]);
        $items = $itemsStmt->fetchAll();

        require_once __DIR__ . '/../Mailer.php';
        $mailer = new Mailer();

        $fullOrder = [
            'order_number'    => $order['order_number'],
            'customer_name'   => Crypto::decrypt($order['customer_name']),
            'customer_phone'  => Crypto::decrypt($order['customer_phone']),
            'delivery_method' => $order['delivery_method'],
            'address'         => Crypto::decrypt($order['address']),
            'comment'         => Crypto::decrypt($order['comment']),
            'total_kopecks'   => (int)$order['total_kopecks'],
        ];

        $ok = $mailer->sendOrderToCustomer($fullOrder, $items, $email);

        $pdo->prepare('UPDATE orders SET email_sent = ?, email_error = ? WHERE id = ?')
            ->execute([
                $ok ? 1 : 0,
                $ok ? null : ($mailer->lastError !== '' ? $mailer->lastError : 'Неизвестная ошибка отправки'),
                $id,
            ]);

        if (!$ok) {
            jsonResponse(['error' => 'Не удалось отправить: ' . ($mailer->lastError ?: 'ошибка SMTP')], 502);
        }

        jsonResponse(['data' => ['ok' => true, 'to' => $email]]);
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

            /* Журнал действий (Task 104) */
            AdminLog::add($pdo, AdminLog::actor(Auth::requireAuth()), 'order.status',
                "#{$order['order_number']} → {$status}");
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