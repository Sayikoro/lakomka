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
        /* витрина: hero и карточка товара */
        'hero_image',
        'hero_slider_enabled',
        'hero_slides',
        'product_card_template',
        /* витрина: снегопад */
        'snow_enabled',
        'snow_count',
        'snow_count_mobile',
        'snow_speed',
        'snow_size',
        'snow_color',
        'snow_flake',
    ];

    /** Ключи, доступные витрине без авторизации */
    private const PUBLIC_KEYS = [
        'hero_image',
        'hero_slider_enabled',
        'hero_slides',
        'product_card_template',
        'snow_enabled',
        'snow_count',
        'snow_count_mobile',
        'snow_speed',
        'snow_size',
        'snow_color',
        'snow_flake',
    ];

    /** Снегопад: значения по умолчанию (как в оригинальном particle-fall: 110 / 0.5 / 31 / #f5f5f5).
        Для телефонов — своя плотность (экран меньше), по умолчанию 60. */
    private const SNOW_DEFAULTS = [
        'enabled' => false,
        'count'   => 110,
        'count_mobile' => 60,
        'speed'   => 0.5,
        'size'    => 31,
        'color'   => '#f5f5f5',
        'flake'   => '',
    ];

    /** Собрать конфиг снегопада из сырых значений settings + клампы */
    private static function snowConfig(array $map): array
    {
        $count = (int)($map['snow_count'] ?? self::SNOW_DEFAULTS['count']);
        $countMobile = (int)($map['snow_count_mobile'] ?? self::SNOW_DEFAULTS['count_mobile']);
        $speed = (float)($map['snow_speed'] ?? self::SNOW_DEFAULTS['speed']);
        $size  = (int)($map['snow_size'] ?? self::SNOW_DEFAULTS['size']);
        $color = trim((string)($map['snow_color'] ?? self::SNOW_DEFAULTS['color']));
        if (!preg_match('/^#[0-9a-fA-F]{6}$/', $color)) {
            $color = self::SNOW_DEFAULTS['color'];
        }
        return [
            'enabled' => ($map['snow_enabled'] ?? '0') === '1',
            'count'   => max(0, min(500, $count)),
            'count_mobile' => max(0, min(500, $countMobile)),
            'speed'   => max(0.1, min(20, $speed)),
            'size'    => max(4, min(120, $size)),
            'color'   => $color,
            'flake'   => (string)($map['snow_flake'] ?? ''),
        ];
    }

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
            } elseif ($k === 'snow_count' && ($map[$k] ?? '') === '') {
                $out[$k] = (string)self::SNOW_DEFAULTS['count'];
            } elseif ($k === 'snow_count_mobile' && ($map[$k] ?? '') === '') {
                $out[$k] = (string)self::SNOW_DEFAULTS['count_mobile'];
            } elseif ($k === 'snow_speed' && ($map[$k] ?? '') === '') {
                $out[$k] = (string)self::SNOW_DEFAULTS['speed'];
            } elseif ($k === 'snow_size' && ($map[$k] ?? '') === '') {
                $out[$k] = (string)self::SNOW_DEFAULTS['size'];
            } elseif ($k === 'snow_color' && ($map[$k] ?? '') === '') {
                $out[$k] = (string)self::SNOW_DEFAULTS['color'];
            } else {
                $out[$k] = $map[$k] ?? '';
            }
        }

        jsonResponse(['data' => $out]);
    }

    /** GET /api/settings/public — витринные настройки без авторизации */
    public static function publicShow(PDO $pdo): void
    {
        $rows = $pdo->query(
            "SELECT key, value FROM settings WHERE key IN ('hero_image','hero_slider_enabled','hero_slides','product_card_template','snow_enabled','snow_count','snow_count_mobile','snow_speed','snow_size','snow_color','snow_flake') OR key LIKE 'text_%'"
        )->fetchAll();
        $map = [];
        foreach ($rows as $r) {
            $map[$r['key']] = $r['value'];
        }

        $slides = [];
        $rawSlides = (string)($map['hero_slides'] ?? '');
        if ($rawSlides !== '') {
            $decoded = json_decode($rawSlides, true);
            if (is_array($decoded)) {
                foreach ($decoded as $s) {
                    if (is_string($s) && $s !== '') {
                        $slides[] = ['url' => $s];
                    } elseif (is_array($s) && !empty($s['url']) && is_string($s['url'])) {
                        $slides[] = ['url' => $s['url']];
                    }
                }
            }
        }

        $template = $map['product_card_template'] ?? 'classic';
        if (!in_array($template, ['classic', 'new'], true)) {
            $template = 'classic';
        }

        /* Тексты страниц: ключи text_* отдаются без префикса */
        $texts = [];
        foreach ($map as $k => $v) {
            if (str_starts_with($k, 'text_')) {
                $texts[substr($k, strlen('text_'))] = (string)$v;
            }
        }

        jsonResponse(['data' => [
            'hero_image'            => (string)($map['hero_image'] ?? ''),
            'hero_slider_enabled'   => ($map['hero_slider_enabled'] ?? '0') === '1',
            'hero_slides'           => $slides,
            'product_card_template' => $template,
            'snow'                  => self::snowConfig($map),
            'texts'                 => $texts ?: new stdClass(), // пустой объект, не массив
        ]]);
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
        if (isset($data['product_card_template'])
            && !in_array($data['product_card_template'], ['classic', 'new'], true)) {
            jsonResponse(['error' => 'product_card_template: classic | new'], 422);
        }
        if (isset($data['hero_slider_enabled'])
            && !in_array((string)$data['hero_slider_enabled'], ['0', '1'], true)) {
            jsonResponse(['error' => 'hero_slider_enabled: 0 | 1'], 422);
        }
        /* Снегопад */
        if (isset($data['snow_enabled'])
            && !in_array((string)$data['snow_enabled'], ['0', '1'], true)) {
            jsonResponse(['error' => 'snow_enabled: 0 | 1'], 422);
        }
        if (isset($data['snow_count']) && !preg_match('/^\d+$/', (string)$data['snow_count'])) {
            jsonResponse(['error' => 'snow_count: целое число 0–500'], 422);
        }
        if (isset($data['snow_count_mobile']) && !preg_match('/^\d+$/', (string)$data['snow_count_mobile'])) {
            jsonResponse(['error' => 'snow_count_mobile: целое число 0–500'], 422);
        }
        if (isset($data['snow_speed'])
            && !(is_numeric($data['snow_speed']) && (float)$data['snow_speed'] >= 0.1 && (float)$data['snow_speed'] <= 20)) {
            jsonResponse(['error' => 'snow_speed: число 0.1–20'], 422);
        }
        if (isset($data['snow_size']) && !preg_match('/^\d+$/', (string)$data['snow_size'])) {
            jsonResponse(['error' => 'snow_size: целое число 4–120'], 422);
        }
        if (isset($data['snow_color'])
            && (string)$data['snow_color'] !== ''
            && !preg_match('/^#[0-9a-fA-F]{6}$/', (string)$data['snow_color'])) {
            jsonResponse(['error' => 'snow_color: hex вида #rrggbb или пусто'], 422);
        }
        if (isset($data['snow_flake'])) {
            $flake = trim((string)$data['snow_flake']);
            if ($flake !== '' && !preg_match('#^(https?://|/)#i', $flake)) {
                jsonResponse(['error' => 'snow_flake: локальный путь (/…) или URL'], 422);
            }
        }
        if (isset($data['hero_slides']) && (string)$data['hero_slides'] !== '') {
            $decoded = json_decode((string)$data['hero_slides'], true);
            if (!is_array($decoded)) {
                jsonResponse(['error' => 'hero_slides: ожидается JSON-массив'], 422);
            }
            foreach ($decoded as $s) {
                $url = is_string($s) ? $s : (is_array($s) ? ($s['url'] ?? null) : null);
                if (!is_string($url) || $url === '') {
                    jsonResponse(['error' => 'hero_slides: у каждого слайда нужен url'], 422);
                }
            }
        }

        $upd = $pdo->prepare(
            'INSERT INTO settings (key, value) VALUES (?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value'
        );

        foreach (self::KEYS as $k) {
            if (!array_key_exists($k, $data)) continue;

            // Пустой пароль — не перезаписываем (значит не меняли)
            if ($k === 'smtp_pass' && $data[$k] === '') continue;
            // Защита от сохранения «маски»: строка только из буллетов/точек — это
            // скопированные точки из поля пароля (например, «••••••••»), а не пароль.
            // Такой мусор в БД ломает SMTP-авторизацию («Could not authenticate»).
            if ($k === 'smtp_pass' && preg_match('/^[\x{2022}\x{00B7}\x{2027}\x{25CF}\x{2219}\x{002A}\x{002E}\s]+$/u', (string)$data[$k])) {
                jsonResponse(['error' => 'В поле пароля вставлена маска (••••••••), а не пароль. Введите настоящий пароль от почты.'], 422);
            }
            // Пустая снежинка = сброс на стандартную — сохраняем как есть (пусто)

            $value = (string)$data[$k];
            if ($k === 'snow_flake') {
                $value = trim($value);
            }
            $upd->execute([$k, $value]);
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

            // Mailer проглатывает SMTP-ошибки (заказы не должны падать из-за почты),
            // поэтому для теста смотрим lastError и честно сообщаем об отправке
            if ($mailer->lastError !== '') {
                jsonResponse(['error' => 'Письмо НЕ отправлено: ' . $mailer->lastError], 500);
            }

            jsonResponse(['data' => ['ok' => true, 'message' => 'Письмо отправлено (или записано в log)']]);
        } catch (Throwable $e) {
            jsonResponse(['error' => $e->getMessage()], 500);
        }
    }
}