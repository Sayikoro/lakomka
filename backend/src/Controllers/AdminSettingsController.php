<?php

require_once __DIR__ . '/../Auth.php';
require_once __DIR__ . '/../AdminLog.php';

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
        /* витрина: видео в карточке каталога (выключено = карточки легче) */
        'card_video_enabled',
        /* медиа-галерея: папка поиска видео (пусто = искать везде) */
        'gallery_video_folder',
        /* витрина: Яндекс.Метрика (номер счётчика, пусто = счётчика нет) */
        'ym_id',
        /* витрина: Яндекс.Метрика — встраиваемый блок целиком (Task 114).
           Задан → используется вместо ym_id; хранится как есть (HTML+script). */
        'metrika_code',
        /* Telegram-уведомления о заказах (Task 108): токен — секрет,
           маскируется как smtp_pass; chat_id — число или @username канала */
        'tg_bot_token',
        'tg_chat_id',
        /* Task 121: дублировать заказы админу на email ("1"/"0", по умолчанию "1") */
        'notify_admin_email',
        /* Task 121: интервал авто-бэкапа БД, суток (0 = выключено, по умолчанию 3) */
        'backup_interval_days',
        /* Task 132: генеративный PDF по подаркам — обложка (первая страница)
           и последняя страница. Только локальные пути внутри /uploads:
           внешний URL в PDF не встроить, а загрузка по ссылке — лишний
           SSRF-риск. Задаются кнопкой загрузки в Настройках. */
        'pdf_cover_first',
        'pdf_cover_last',
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
        'card_video_enabled',
        'metrika_code',
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
            } elseif ($k === 'tg_bot_token') {
                /* Токен бота — такой же секрет, как smtp_pass: наружу только
                   маска + флаг «задан», пустое поле = не менять (см. update) */
                $out[$k] = ($map[$k] ?? '') !== '' ? '••••••••' : '';
                $out['tg_bot_token_set'] = ($map[$k] ?? '') !== '';
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
            } elseif ($k === 'card_video_enabled' && ($map[$k] ?? '') === '') {
                /* Ключа нет в БД (обновление со старой версии) — в админке
                   честно показываем фактическое поведение витрины: видео включено */
                $out[$k] = '1';
            } elseif ($k === 'notify_admin_email' && ($map[$k] ?? '') === '') {
                /* Task 121: по умолчанию дубли админу включены */
                $out[$k] = '1';
            } elseif ($k === 'backup_interval_days' && ($map[$k] ?? '') === '') {
                /* Task 121: авто-бэкап по умолчанию раз в 3 суток */
                $out[$k] = '3';
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
            "SELECT key, value FROM settings WHERE key IN ('hero_image','hero_slider_enabled','hero_slides','product_card_template','card_video_enabled','ym_id','metrika_code','snow_enabled','snow_count','snow_count_mobile','snow_speed','snow_size','snow_color','snow_flake') OR key LIKE 'text_%'"
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

        /* Дефолт «new» — карточка с кнопками «Перейти»+«В корзину» (предпочтение
           владельца). Если ключ в settings потерялся (восстановление БД и т.п.),
           витрина не деградирует до классики. */
        $template = $map['product_card_template'] ?? 'new';
        if (!in_array($template, ['classic', 'new'], true)) {
            $template = 'new';
        }

        /* Видео в карточке каталога: по умолчанию показываем (историческое
           поведение). Выключается галочкой в админке, когда товаров с видео
           много и страница каталога грузится тяжело. */
        $cardVideo = ($map['card_video_enabled'] ?? '1') === '0' ? false : true;

        /* Яндекс.Метрика: счётчик вшивается в страницы витрины только
           когда номер задан. tg_* наружу НЕ отдаётся — токен секрет. */
        $ymId = preg_match('/^\d{4,}$/', trim((string)($map['ym_id'] ?? '')))
            ? trim((string)$map['ym_id'])
            : '';

        /* Встраиваемый блок Метрики (Task 114): отдаётся как есть —
           витрина рендерит его на страницах. Ограничение по длине —
           страховка от мусора; пусто = блока нет. */
        $metrikaCode = (string)($map['metrika_code'] ?? '');
        if (mb_strlen($metrikaCode) > 20000) {
            $metrikaCode = '';
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
            'card_video_enabled'    => $cardVideo,
            'ym_id'                 => $ymId,
            'metrika_code'          => $metrikaCode,
            'snow'                  => self::snowConfig($map),
            'texts'                 => $texts ?: new stdClass(), // пустой объект, не массив
        ]]);
    }

    public static function update(PDO $pdo): void
    {
        $payload = Auth::requireAuth();

        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true);
        if (!is_array($data)) {
            jsonResponse(['error' => 'Invalid JSON'], 400);
        }

        // Валидация
        /* Булеаны (hero_slider_enabled, snow_enabled, notify_admin_email) принимаем в любом виде:
           true/false, "true"/"false", "on"/"off", "да"/"нет" — иначе старый
           кэш браузера или другой клиент ловит 422 «…: 0 | 1» и настройки
           не сохраняются вовсе. null = ключ не менять. */
        foreach (['hero_slider_enabled', 'snow_enabled', 'card_video_enabled', 'notify_admin_email'] as $bk) {
            if (!array_key_exists($bk, $data)) continue;
            $v = $data[$bk];
            if (is_bool($v)) {
                $data[$bk] = $v ? '1' : '0';
            } elseif (is_null($v)) {
                unset($data[$bk]);
            } else {
                $s = strtolower(trim((string)$v));
                if (in_array($s, ['true', 'on', 'yes', 'да', 'вкл'], true)) $data[$bk] = '1';
                elseif (in_array($s, ['false', 'off', 'no', '', 'нет', 'выкл'], true)) $data[$bk] = '0';
            }
        }
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
        if (isset($data['card_video_enabled'])
            && !in_array((string)$data['card_video_enabled'], ['0', '1'], true)) {
            jsonResponse(['error' => 'card_video_enabled: 0 | 1'], 422);
        }
        if (isset($data['notify_admin_email'])
            && !in_array((string)$data['notify_admin_email'], ['0', '1'], true)) {
            jsonResponse(['error' => 'notify_admin_email: 0 | 1'], 422);
        }
        /* Интервал авто-бэкапа: целые сутки 0–30 (0 = выключено) */
        if (isset($data['backup_interval_days'])) {
            $bid = (string)$data['backup_interval_days'];
            if (!preg_match('/^\d+$/', $bid) || (int)$bid > 30) {
                jsonResponse(['error' => 'backup_interval_days: целое число 0–30 суток (0 = выключено)'], 422);
            }
            $data['backup_interval_days'] = (string)(int)$bid;
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
        /* Яндекс.Метрика: только цифры (номер счётчика) или пусто.
           Метка «счётчик появляется после F5» — на фронте. */
        if (isset($data['ym_id'])) {
            $ymId = trim((string)$data['ym_id']);
            if ($ymId !== '' && !preg_match('/^\d{4,}$/', $ymId)) {
                jsonResponse(['error' => 'ym_id: номер счётчика — только цифры (например 12345678) или пусто'], 422);
            }
            $data['ym_id'] = $ymId;
        }
        /* Встраиваемый блок Метрики (Task 114): строка-HTML. Проверяем мягко —
           длина (страховка от мусора) и что это похоже на счётчик Яндекса,
           если блок непустой; иначе опечатка в поле навсегда выключит
           аналитику без единой ошибки на витрине. */
        if (isset($data['metrika_code'])) {
            $code = (string)$data['metrika_code'];
            if (mb_strlen($code) > 20000) {
                jsonResponse(['error' => 'metrika_code: блок слишком длинный (максимум 20 000 символов)'], 422);
            }
            if ($code !== '' && !str_contains($code, 'mc.yandex.ru')) {
                jsonResponse(['error' => 'metrika_code: в блоке не найдено mc.yandex.ru — вставьте код счётчика целиком, как его даёт Яндекс.Метрика'], 422);
            }
            $data['metrika_code'] = $code;
        }
        /* Telegram (Task 108): пустой токен = не менять (как smtp_pass);
           вставленная маска — честная ошибка; формат 123456789:AA… проверяем
           мягко (цифры, двоеточие, минимум 20 символов хвоста), чтобы не
           душить новые форматы токенов. chat_id: число (для групп —
           отрицательное, для каналов с префиксом -100) или @username. */
        if (isset($data['tg_bot_token'])) {
            $tok = trim((string)$data['tg_bot_token']);
            if ($tok !== '') {
                if (preg_match('/^[\x{2022}\x{00B7}\x{2027}\x{25CF}\x{2219}\x{002A}\x{002E}\s]+$/u', $tok)) {
                    jsonResponse(['error' => 'В поле токена вставлена маска (••••••••), а не токен. Вставьте токен от @BotFather.'], 422);
                }
                if (!preg_match('#^\d{6,}:[A-Za-z0-9_-]{20,}$#', $tok)) {
                    jsonResponse(['error' => 'Похоже, это не токен бота. Ожидается вид 123456789:AAEl… — скопируйте его у @BotFather.'], 422);
                }
            }
            $data['tg_bot_token'] = $tok;
        }
        if (isset($data['tg_chat_id'])) {
            $chat = trim((string)$data['tg_chat_id']);
            if ($chat !== '' && !preg_match('/^-?\d{3,}$|^@[A-Za-z][A-Za-z0-9_]{3,63}$/', $chat)) {
                jsonResponse(['error' => 'tg_chat_id: число (для групп/каналов может быть отрицательным, напр. -1001234567890) или @username канала'], 422);
            }
            $data['tg_chat_id'] = $chat;
        }
        /* Папка видео для медиа-галереи: относительный путь внутри /uploads.
           Пользователь вводит имя папки руками — не душим символами (скобки,
           тире и т.п. допустимы), запрещаем только «..» (traversal): реальную
           защиту даёт realpath-проверка в AdminFilesController::videos. */
        if (isset($data['gallery_video_folder'])) {
            $gvf = trim(str_replace('\\', '/', (string)$data['gallery_video_folder']), " /\t\n\r\0\x0B");
            if ($gvf !== '' && preg_match('#(^|/)\.\.(/|$)#', $gvf)) {
                jsonResponse(['error' => 'gallery_video_folder: путь внутри /uploads, без «..»'], 422);
            }
            $data['gallery_video_folder'] = preg_replace('#/+#', '/', $gvf);
        }
        /* Task 132: обложки генеративного PDF — ТОЛЬКО локальные пути внутри
           /uploads (в идеале /uploads/pdf/… с кнопки загрузки). Внешний URL
           запрещаем сразу: в PDF его всё равно не встроить, а тянуть файл
           по ссылке из настроек — не та поверхность, которую стоит открывать. */
        foreach (['pdf_cover_first', 'pdf_cover_last'] as $pk) {
            if (!array_key_exists($pk, $data)) continue;
            $u = trim((string)$data[$pk]);
            if (mb_strlen($u) > 500) {
                jsonResponse(['error' => "$pk: путь слишком длинный — загрузите картинку кнопкой"], 422);
            }
            if ($u !== '' && !preg_match('#^/uploads/#', $u)) {
                jsonResponse(['error' => "$pk: загрузите картинку кнопкой (путь вида /uploads/pdf/…) или оставьте поле пустым"], 422);
            }
            if ($u !== '' && str_contains($u, '..')) {
                jsonResponse(['error' => "$pk: путь не должен содержать «..»"], 422);
            }
            $data[$pk] = $u;
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
            // Пустой токен Telegram — не перезаписываем (значит не меняли)
            if ($k === 'tg_bot_token' && $data[$k] === '') continue;
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

        /* Журнал действий (Task 104): какие ключи менялись */
        $changed = array_values(array_intersect(self::KEYS, array_keys($data)));
        if ($changed !== []) {
            AdminLog::add($pdo, AdminLog::actor($payload), 'settings.update', implode(', ', $changed));
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

    /** POST /api/admin/settings/test-telegram — проверка бота и chat_id (Task 108).
        Берёт СОХРАНЁННЫЕ настройки (не из payload) — сначала «Сохранить». */
    public static function testTelegram(PDO $pdo): void
    {
        Auth::requireAuth();

        require_once __DIR__ . '/../Telegram.php';

        try {
            [$ok, $err] = Telegram::sendMessage(
                $pdo,
                '✅ Тестовое сообщение из админки Лакомки. Уведомления о заказах работают!'
            );
            if (!$ok) {
                jsonResponse(['error' => 'Сообщение НЕ отправлено: ' . $err], 500);
            }
            jsonResponse(['data' => ['ok' => true, 'message' => 'Сообщение отправлено в чат — проверьте Telegram']]);
        } catch (Throwable $e) {
            jsonResponse(['error' => $e->getMessage()], 500);
        }
    }
}