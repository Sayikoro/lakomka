<?php

require_once __DIR__ . '/../Auth.php';

class AdminSettingsController
{
    /** Публично видимые ключи; smtp_pass возвращаем пустым для безопасности */
    private const KEYS = [
        'admin_email',
        'from_email',
        'from_name',
        'site_url',
        'mail_driver',
        'smtp_host',
        'smtp_port',
        'smtp_user',
        'smtp_pass',
        'smtp_secure',
    ];

    public static function show(PDO $pdo): void
    {
        Auth::requireAuth();

        $rows = $pdo->query('SELECT key, value FROM settings')->fetchAll();
        $map = [];
        foreach ($rows as $r) {
            $map[$r['key']] = $r['value'];
        }

        $out = [];
        foreach (self::KEYS as $k) {
            if ($k === 'smtp_pass') {
                $out[$k] = ($map[$k] ?? '') !== '' ? '••••••••' : '';
                $out['smtp_pass_set'] = ($map[$k] ?? '') !== '';
            } else {
                $out[$k] = $map[$k] ?? '';
            }
        }

        jsonResponse(['data' => $out]);
    }

    public static function update(PDO $pdo): void
    {
        Auth::requireAuth();

        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true);
        if (!is_array($data)) {
            jsonResponse(['error' => 'Invalid JSON'], 400);
        }

        // Валидация
        if (isset($data['mail_driver']) && !in_array($data['mail_driver'], ['log', 'smtp'], true)) {
            jsonResponse(['error' => 'mail_driver: log | smtp'], 422);
        }
        if (isset($data['smtp_secure']) && !in_array($data['smtp_secure'], ['', 'tls', 'ssl'], true)) {
            jsonResponse(['error' => 'smtp_secure: tls | ssl | пусто'], 422);
        }
        if (isset($data['admin_email']) && $data['admin_email'] !== ''
            && !filter_var($data['admin_email'], FILTER_VALIDATE_EMAIL)) {
            jsonResponse(['error' => 'Некорректный admin_email'], 422);
        }

        $upd = $pdo->prepare(
            'INSERT INTO settings (key, value) VALUES (?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value'
        );

        foreach (self::KEYS as $k) {
            if (!array_key_exists($k, $data)) continue;

            // Пустой пароль — не перезаписываем (значит не меняли)
            if ($k === 'smtp_pass' && $data[$k] === '') continue;

            $upd->execute([$k, (string)$data[$k]]);
        }

        jsonResponse(['data' => ['ok' => true]]);
    }

    public static function testEmail(PDO $pdo): void
    {
        Auth::requireAuth();

        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true) ?? [];
        $to = trim((string)($data['to'] ?? ''));

        if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
            jsonResponse(['error' => 'Укажите корректный email'], 422);
        }

        require_once __DIR__ . '/../Mailer.php';

        try {
            $mailer = new Mailer();
            $order = [
                'order_number'    => 'ТЕСТ-' . date('His'),
                'customer_name'   => 'Тест',
                'customer_phone'  => '+7 (999) 000-00-00',
                'delivery_method' => 'city',
                'address'         => 'Тестовый адрес',
                'comment'         => 'Это тестовое письмо из админки',
                'total_kopecks'   => 100000,
            ];
            $items = [
                ['product_name' => 'Тестовый товар', 'qty' => 1, 'price_kopecks' => 100000],
            ];
            $mailer->sendOrderToCustomer($order, $items, $to);

            jsonResponse(['data' => ['ok' => true, 'message' => 'Письмо отправлено (или записано в log)']]);
        } catch (Throwable $e) {
            jsonResponse(['error' => $e->getMessage()], 500);
        }
    }
}