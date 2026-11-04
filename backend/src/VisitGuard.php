<?php

/**
 * Task 133: собственная аналитика посещений витрины + защита от
 * автоматизированных систем (ботов, скреперов, спамеров заказов).
 *
 * Из чего состоит:
 *  - identify: IP (с учётом прокси), хеш IP с солью из конфига (сам IP
 *    нигде не хранится — только необратимый хеш для блокировки и маска
 *    для показа владельцу), разбор User-Agent;
 *  - guard(): щит публичных маршрутов — блок-лист IP, rate-limit по окнам
 *    (таблица rate_limits), учёт ботов в bot_hits. Никогда не роняет сайт:
 *    любая внутренняя ошибка уходит в error_log, запрос продолжается;
 *  - collect(): приём событий с витрины (POST /api/analytics/collect,
 *    без авторизации). Боты по UA не режутся — их посещения и есть
 *    аналитика; режутся только заблокированные IP и агрессивный поток.
 *
 * Поведенческий бот-детект: сессия, в которой ≥ 25 pageview за 2 минуты,
 * помечается is_bot=1 (reason «behavior») — браузерный человек столько
 * страниц за две минуты не открывает, а скрипт-обходчик — да.
 *
 * Task 134: бот-детект v2 — отпечаток браузера и человеческий ввод.
 * ИИ-агенты (DeepSeek и подобные) ходят с обычным Chrome-UA, неспешно,
 * поэтому детект по UA/флуду их пропускал. Трекер витрины теперь присылает
 * env (navigator.webdriver, window.chrome, плагины, языки, тач) и sig
 * (счётчики движений мыши, касаний, нажатий клавиш); сервер плюс к этому
 * проверяет Accept-Language. Взвешенный балл botScore(): ≥60 — бот
 * (reason «fp:…»), 30…59 — «Подозрение» в списке посетителей.
 */
class VisitGuard
{
    /** Типы событий, принимаемые от витрины (белый список).
     *  Task 141: gift_share — нажатие «Поделиться» в карточке товара
     *  (meta.channel = native | telegram | whatsapp | vk | copy). */
    private const EVENT_TYPES = ['pageview', 'click', 'scroll', 'gift_view', 'cart_add', 'leave', 'gift_share'];

    /** Классические сигнатуры ботов в User-Agent. */
    private const BOT_UA_RE =
        '/(bot|crawl|spider|slurp|curl|wget|python|java\/|go-http|libwww|httpclient|scrapy|' .
        'headless|puppeteer|playwright|phantomjs|selenium|axios|node-fetch|okhttp|undici|' .
        'facebookexternalhit|semrush|ahrefs|mj12bot|dotbot|petalbot|bytespider|googlebot|' .
        'bingbot|yandexbot|yandeximages|yandexmetrika|baiduspider|duckduckbot|gptbot|' .
        'oai-searchbot|claudebot|ccbot|applebot|megaindex|serpstat|mauibot|linkdex|' .
        'perplexity|chatgpt-user|meta-externalagent|amazonbot|diffbot|youbot|deepseek|' .
        'pingdom|uptimerobot|lighthouse|pagespeed|gtmetrix|http_request|guzzle|monit)/i';

    /** Балл, с которого сессия считается ботом (reason «fp:…»). */
    public const BOT_SCORE_THRESHOLD = 60;
    /** Балл, с которого в списке посетителей появляется бейдж «Подозрение». */
    public const SUSPICION_THRESHOLD = 30;

    /* ============================================================
       ИДЕНТИФИКАЦИЯ ЗАПРОСА
       ============================================================ */

    /** Реальный IP клиента: за локальным прокси берём X-Forwarded-For. */
    public static function clientIp(): string
    {
        $remote = (string)($_SERVER['REMOTE_ADDR'] ?? '');
        $xff = (string)($_SERVER['HTTP_X_FORWARDED_FOR'] ?? '');
        if ($xff !== '' && self::ipIsLocal($remote)) {
            $first = trim(explode(',', $xff)[0]);
            if ($first !== '' && filter_var($first, FILTER_VALIDATE_IP) !== false) {
                return $first;
            }
        }
        return $remote;
    }

    /** true, если IP — локальный/приватный (значит, перед нами прокси). */
    private static function ipIsLocal(string $ip): bool
    {
        if ($ip === '') {
            return true;
        }
        return filter_var(
            $ip,
            FILTER_VALIDATE_IP,
            FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE
        ) === false;
    }

    /** Соль для хеша IP: jwt_secret из конфига (Bootstrap гарантирует наличие). */
    public static function salt(): string
    {
        static $salt = null;
        if ($salt === null) {
            $salt = '';
            try {
                $cfg = require __DIR__ . '/../config.php';
                $salt = (string)($cfg['jwt_secret'] ?? '');
            } catch (Throwable $e) {
                $salt = '';
            }
            if ($salt === '') {
                $salt = 'lakomka-visit-salt';
            }
        }
        return $salt;
    }

    /** Необратимый хеш IP: по нему работают блокировки, сам IP не хранится. */
    public static function ipHash(?string $ip = null): string
    {
        return hash('sha256', ($ip ?? self::clientIp()) . '|' . self::salt());
    }

    /** Маска IP для показа владельцу: 203.0.xxx.xxx / 2606:4700:… */
    public static function ipMask(?string $ip = null): string
    {
        $ip = $ip ?? self::clientIp();
        if ($ip === '') {
            return '';
        }
        if (str_contains($ip, ':')) {
            $parts = explode(':', $ip);
            return implode(':', array_slice($parts, 0, 3)) . ':…';
        }
        $o = explode('.', $ip);
        if (count($o) === 4) {
            return $o[0] . '.' . $o[1] . '.xxx.xxx';
        }
        return mb_substr($ip, 0, 12);
    }

    /** User-Agent запроса, обрезанный до разумной длины. */
    public static function userAgent(): string
    {
        return mb_substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 300);
    }

    /** Бот ли по User-Agent (пустой UA тоже бот). */
    public static function uaIsBot(?string $ua = null): bool
    {
        $ua = $ua ?? self::userAgent();
        if (trim($ua) === '') {
            return true;
        }
        return preg_match(self::BOT_UA_RE, $ua) === 1;
    }

    /* ============================================================
       БОТ-ДЕТЕКТ V2: ОТПЕЧАТОК + ЧЕЛОВЕЧЕСКИЙ ВВОД (Task 134)
       ============================================================ */

    /**
     * Взвешенный балл «похожести на бота» (0…100) и список флагов.
     *
     * $env — почищенные данные от трекера: wd (navigator.webdriver),
     * chrome (есть window.chrome), plugins, langs, touch, mm/ts/kd
     * (движения мыши / касания / нажатия клавиш). $envSent — присылал ли
     * клиент отпечаток вообще (старые клиенты не штрафуем). $alPresent —
     * был ли в HTTP-запросе заголовок Accept-Language.
     *
     * Веса подобраны так, чтобы ни один одиночный «мягкий» признак не
     * делал человека ботом: webdriver (70) — канонический флаг автоматизации,
     * он один достаточен; остальные срабатывают только в сочетаниях.
     *
     * @return array{score: int, flags: string[], no_input: int}
     */
    public static function botScore(
        array $env,
        bool $envSent,
        bool $alPresent,
        int $clicks,
        int $views,
        int $ageSec
    ): array {
        $score = 0;
        $flags = [];
        $noInput = 0;

        $wd = (int)($env['wd'] ?? 0) === 1;
        $chrome = (int)($env['chrome'] ?? 0) === 1;
        $touch = (int)($env['touch'] ?? 0) === 1;
        $plugins = (int)($env['plugins'] ?? -1);
        $langs = (int)($env['langs'] ?? -1);

        // 1) navigator.webdriver — честный флаг Selenium/Puppeteer/Playwright
        if ($wd) {
            $score += 70;
            $flags[] = 'webdriver';
        }

        // 2) UA обещает Chrome/Chromium, а window.chrome отсутствует —
        //    переименованный headless-клиент или подделка. Только когда
        //    отпечаток реально прислан: у старого клиента chrome=0 —
        //    это «нет данных», а не «объекта нет».
        $ua = (string)($env['ua'] ?? self::userAgent());
        if ($envSent && stripos($ua, 'chrome/') !== false && !$chrome) {
            $score += 35;
            $flags[] = 'no-chrome';
        }

        // 3) Нет Accept-Language: браузеры человека отправляют его всегда
        if (!$alPresent) {
            $score += 30;
            $flags[] = 'no-lang';
        }

        // 4) Пустые плагины И языки — «голый» клиент (только когда отпечаток
        //    реально прислан; у мобильных Safari plugins=0, но языки есть)
        if ($envSent && $plugins === 0 && $langs === 0) {
            $score += 20;
            $flags[] = 'bare';
        }

        // 5) Ноль человеческого ввода за всю сессию: ни движения мыши,
        //    ни касания, ни клавиатуры, ни клика. Тач-устройства не штрафуем
        //    (человек может просто читать); быстрый отказ (<8с, 1 страница)
        //    — слабый сигнал, долгое листание без ввода — сильный.
        $hasInput = (int)($env['mm'] ?? 0) > 0
            || (int)($env['ts'] ?? 0) > 0
            || (int)($env['kd'] ?? 0) > 0
            || $clicks > 0;
        if ($envSent && !$touch && !$hasInput) {
            $noInput = 1;
            if ($views >= 3) {
                $score += 45;
                $flags[] = 'no-input';
            } elseif ($ageSec >= 8) {
                $score += 35;
                $flags[] = 'no-input';
            } else {
                $score += 10;
                $flags[] = 'quiet';
            }
        }

        // 6) Task 139: клики есть, а движений мыши/касаний/клавиатуры нет —
        //    программа жмёт element.click() из DOM (ИИ-агенты и скрипты):
        //    человек перед кликом хотя бы шевелит мышью или печатает.
        //    Тач-пользователи исключены (ts > 0), клавиатурные — kd > 0.
        //    Одиночный признак мягкий (+25): сам по себе даёт только
        //    «Подозрение», бот — в сочетании с другими флагами.
        if ($envSent && $clicks >= 3
            && (int)($env['mm'] ?? 0) === 0
            && (int)($env['ts'] ?? 0) === 0
            && (int)($env['kd'] ?? 0) === 0) {
            $score += 25;
            $flags[] = 'click-no-move';
        }

        return ['score' => min($score, 100), 'flags' => $flags, 'no_input' => $noInput];
    }

    /**
     * Почистить env/sig от трекера: только числовые поля в разумных
     * пределах, tz — строка без управляющих символов.
     */
    public static function cleanEnv(array $envIn, array $sigIn): array
    {
        $clamp = static function (mixed $v, int $max): int {
            if (!is_numeric($v)) {
                return 0;
            }
            $n = (int)$v;
            return max(0, min($n, $max));
        };
        $bool = static function (mixed $v): int {
            return (int)(is_bool($v) ? $v : in_array($v, [1, '1', true], true));
        };

        return [
            'wd'      => $bool($envIn['wd'] ?? 0),
            'chrome'  => $bool($envIn['chrome'] ?? 0),
            'plugins' => $clamp($envIn['plugins'] ?? 0, 99),
            'langs'   => $clamp($envIn['langs'] ?? 0, 99),
            'touch'   => $bool($envIn['touch'] ?? 0),
            'tz'      => self::cleanString((string)($envIn['tz'] ?? ''), 40),
            'mm'      => $clamp($sigIn['mm'] ?? 0, 100_000),
            'ts'      => $clamp($sigIn['ts'] ?? 0, 100_000),
            'kd'      => $clamp($sigIn['kd'] ?? 0, 100_000),
        ];
    }

    /* ============================================================
       ЗАЩИТА ПУБЛИЧНЫХ МАРШРУТОВ
       ============================================================ */

    /**
     * Щит публичного маршрута: блок-лист → rate-limit по окнам →
     * учёт ботов. $windows — пары [секунд, максимум запросов].
     */
    public static function guard(PDO $pdo, string $route, array $windows = [[60, 90]]): void
    {
        try {
            $ipHash = self::ipHash();

            if (self::isBlocked($pdo, $ipHash)) {
                self::deny(403, 'Доступ для вашего адреса заблокирован');
            }

            foreach ($windows as [$windowSec, $maxHits]) {
                if (!self::hitLimit($pdo, $route, (int)$windowSec, (int)$maxHits)) {
                    header('Retry-After: 60');
                    self::deny(429, 'Слишком много запросов. Попробуйте чуть позже.');
                }
            }

            if (self::uaIsBot()) {
                self::recordBotHit($pdo, $ipHash, self::ipMask(), self::userAgent(), $route);
            }
        } catch (Throwable $e) {
            // Защита не должна ломать магазин: ошибка — в лог, запрос идёт дальше
            error_log('[visit-guard] ' . $e->getMessage());
        }
    }

    /** true, если IP в блок-листе владельца. */
    public static function isBlocked(PDO $pdo, string $ipHash): bool
    {
        $stmt = $pdo->prepare('SELECT 1 FROM ip_blocks WHERE ip_hash = ?');
        $stmt->execute([$ipHash]);
        return (bool)$stmt->fetchColumn();
    }

    /**
     * Счётчик в скользящем окне. true = пропустить, false = лимит превышен.
     * Бакет включает окно (route|окно|ip_hash) — разные окна не делят счётчик.
     * Просроченный бакет (updated_at старше окна) обнуляется при попадании.
     */
    public static function hitLimit(PDO $pdo, string $route, int $windowSec, int $maxHits): bool
    {
        $bucket = $route . '|' . $windowSec . '|' . self::ipHash();
        $now = date('c');
        $floor = date('c', time() - $windowSec);

        $stmt = $pdo->prepare(
            "INSERT INTO rate_limits (bucket, hits, updated_at) VALUES (?, 1, ?)
             ON CONFLICT(bucket) DO UPDATE SET
               hits = CASE WHEN rate_limits.updated_at < ? THEN 1 ELSE rate_limits.hits + 1 END,
               updated_at = excluded.updated_at"
        );
        $stmt->execute([$bucket, $now, $floor]);

        $sel = $pdo->prepare('SELECT hits FROM rate_limits WHERE bucket = ?');
        $sel->execute([$bucket]);
        $hits = (int)$sel->fetchColumn();

        if (random_int(1, 50) === 1) { // лёгкая уборка просроченных бакетов
            $pdo->prepare('DELETE FROM rate_limits WHERE updated_at < ?')
                ->execute([date('c', time() - 86400)]);
        }

        return $hits <= $maxHits;
    }

    /** Агрегированная запись бота: (IP, UA, маршрут) → hits + 1. */
    public static function recordBotHit(PDO $pdo, string $ipHash, string $ipMask, string $ua, string $route): void
    {
        $now = date('c');
        $pdo->prepare(
            "INSERT INTO bot_hits (ip_hash, ip_mask, ua, path, hits, first_seen, last_seen)
             VALUES (?, ?, ?, ?, 1, ?, ?)
             ON CONFLICT(ip_hash, ua, path) DO UPDATE SET
               hits = hits + 1, last_seen = excluded.last_seen"
        )->execute([$ipHash, $ipMask, mb_substr($ua, 0, 300), mb_substr($route, 0, 300), $now, $now]);
    }

    /** Отказ с JSON-ошибкой (защищённые маршруты отвечают без деталей). */
    private static function deny(int $code, string $message): void
    {
        http_response_code($code);
        echo json_encode(['error' => $message], JSON_UNESCAPED_UNICODE);
        exit;
    }

    /* ============================================================
       ПРИЁМ АНАЛИТИКИ С ВИТРИНЫ
       ============================================================ */

    /** POST /api/analytics/collect — батч событий с витрины. */
    public static function collect(PDO $pdo): void
    {
        /* Щит: блок-лист и поток батчей. Ботов по UA НЕ режем — их
           посещения и есть аналитика (помечаются is_bot в сессии). */
        try {
            $ipHash = self::ipHash();
            if (self::isBlocked($pdo, $ipHash)) {
                self::deny(403, 'Доступ для вашего адреса заблокирован');
            }
            if (!self::hitLimit($pdo, 'analytics-collect', 60, 60)) {
                header('Retry-After: 60');
                self::deny(429, 'Слишком много запросов.');
            }
        } catch (Throwable $e) {
            error_log('[visit-guard] ' . $e->getMessage());
        }

        $raw = (string)(file_get_contents('php://input') ?: '');
        if (mb_strlen($raw) > 100_000) {
            http_response_code(413);
            echo json_encode(['error' => 'Payload too large']);
            exit;
        }
        $body = json_decode($raw, true);
        if (!is_array($body)) {
            http_response_code(400);
            echo json_encode(['error' => 'Bad JSON']);
            exit;
        }

        $sid = (string)($body['sid'] ?? '');
        if (!preg_match('/^[A-Za-z0-9_-]{8,64}$/', $sid)) {
            http_response_code(422);
            echo json_encode(['error' => 'Bad sid']);
            exit;
        }

        $events = $body['events'] ?? [];
        if (!is_array($events)) {
            $events = [];
        }
        if (count($events) > 200) {
            $events = array_slice($events, 0, 200);
        }

        $ua = self::userAgent();
        $isBot = self::uaIsBot($ua) ? 1 : 0;
        $ipMask = self::ipMask();
        $now = date('c');

        $screen = self::cleanString($body['screen'] ?? '', 40);
        $ref = self::cleanString($body['ref'] ?? '', 300);
        $land = self::cleanString($body['land'] ?? '', 300);

        /* Task 134: отпечаток браузера и счётчики человеческого ввода. */
        $envIn = is_array($body['env'] ?? null) ? $body['env'] : [];
        $sigIn = is_array($body['sig'] ?? null) ? $body['sig'] : [];
        $envSent = $envIn !== [] || $sigIn !== [];
        $env = self::cleanEnv($envIn, $sigIn);
        $alPresent = trim((string)($_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? '')) !== '';
        $env['ua'] = $ua; // botScore сверяет window.chrome с настоящим UA запроса
        $fpJson = json_encode(
            ['wd' => $env['wd'], 'chrome' => $env['chrome'], 'plugins' => $env['plugins'],
             'langs' => $env['langs'], 'tz' => $env['tz'], 'touch' => $env['touch'], 'al' => $alPresent ? 1 : 0],
            JSON_UNESCAPED_UNICODE
        ) ?: '';

        $prepared = [];
        foreach ($events as $ev) {
            $e = self::cleanEvent($ev);
            if ($e !== null) {
                $prepared[] = $e;
            }
        }

        /* Сессия: ключ (sid, ip_hash) — подмена sid с чужого IP создаёт
           отдельную строку, чужую аналитику не загрязняет. */
        $stmt = $pdo->prepare('SELECT * FROM visit_sessions WHERE sid = ? AND ip_hash = ?');
        $stmt->execute([$sid, $ipHash]);
        $row = $stmt->fetch();
        if ($row) {
            $sessionId = (int)$row['id'];
        } else {
            try {
                $pdo->prepare(
                    "INSERT INTO visit_sessions
                       (sid, ip_hash, ip_mask, user_agent, is_bot, bot_reason,
                        referrer, landing, screen, views, events, first_seen, last_seen,
                        webdriver, mouse_moves, touches, key_downs, accept_lang, fp)
                     VALUES (?, ?, ?, ?, ?, '', ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?)"
                )->execute([
                    $sid, $ipHash, $ipMask, $ua, $isBot, $ref, $land, $screen, $now, $now,
                    $env['wd'], $env['mm'], $env['ts'], $env['kd'], $alPresent ? 1 : 0, $fpJson,
                ]);
                $sessionId = (int)$pdo->lastInsertId();
                /* $row нужен ниже (views/webdriver/first_seen) — перечитываем */
                $stmt->execute([$sid, $ipHash]);
                $row = $stmt->fetch() ?: $row;
            } catch (Throwable $e) {
                /* Гонка воркеров на один и тот же (sid, ip_hash) —
                   повторно читаем уже созданную строку. */
                $stmt->execute([$sid, $ipHash]);
                $row = $stmt->fetch();
                if (!$row) {
                    throw $e;
                }
                $sessionId = (int)$row['id'];
            }
        }

        $views = 0;
        if ($prepared !== []) {
            $ins = $pdo->prepare(
                "INSERT INTO visit_events
                   (session_id, type, path, gift_id, gift_slug, gift_name, meta, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
            );
            foreach ($prepared as $e) {
                $ins->execute([
                    $sessionId,
                    $e['t'],
                    $e['path'],
                    $e['gift_id'],
                    $e['gs'],
                    $e['gn'],
                    $e['m'],
                    $now,
                ]);
                if ($e['t'] === 'pageview') {
                    $views++;
                }
            }
        }

        /* ── Бот-детект v2 (Task 134): балл по отпечатку и вводу. ──
           Считается на каждом батче по накопленному состоянию сессии:
           ни один «мягкий» признак сам по себе человека ботом не делает,
           но сочетания (webdriver / нет Chrome-объекта + нет языка +
           нет ввода) уверенно ловят ИИ-агентов с обычным Chrome-UA. */
        $sessionViews = (int)$row['views'] + $views;
        $clickStmt = $pdo->prepare(
            "SELECT COUNT(*) FROM visit_events WHERE session_id = ? AND type = 'click'"
        );
        $clickStmt->execute([$sessionId]);
        $clicks = (int)$clickStmt->fetchColumn();
        $ageSec = max(0, time() - (strtotime((string)$row['first_seen']) ?: time()));
        $fp = self::botScore($env, $envSent, $alPresent, $clicks, $sessionViews, $ageSec);

        $webdriver = ((int)($row['webdriver'] ?? 0) === 1 || $env['wd'] === 1) ? 1 : 0;
        $newScore = max((int)($row['bot_score'] ?? 0), $fp['score']);
        $upd = $pdo->prepare(
            'UPDATE visit_sessions
             SET last_seen = ?, views = views + ?, events = events + ?,
                 webdriver = ?, mouse_moves = MAX(mouse_moves, ?),
                 touches = MAX(touches, ?), key_downs = MAX(key_downs, ?),
                 bot_score = ?, no_input = ?, accept_lang = ?, fp = ?
             WHERE id = ?'
        );
        $upd->execute([
            $now, $views, count($prepared),
            $webdriver, $env['mm'], $env['ts'], $env['kd'],
            $newScore, $fp['no_input'], $alPresent ? 1 : 0, $fpJson,
            $sessionId,
        ]);

        if (!$isBot && $fp['score'] >= self::BOT_SCORE_THRESHOLD) {
            $pdo->prepare('UPDATE visit_sessions SET is_bot = 1, bot_reason = ? WHERE id = ?')
                ->execute(['fp:' . implode(',', $fp['flags']), $sessionId]);
        }

        /* Поведенческий бот-детект: ≥ 25 pageview за 2 минуты у сессии,
           которая не бот по UA. Проверяется ПОСЛЕ отпечатка и перекрывает
           его причину — флуд страниц сильнее «мягких» признаков. */
        $behaviorMarked = false;
        if (!$isBot && $views > 0) {
            $recent = $pdo->prepare(
                "SELECT COUNT(*) FROM visit_events
                 WHERE session_id = ? AND type = 'pageview' AND created_at >= ?"
            );
            $recent->execute([$sessionId, date('c', time() - 120)]);
            if ((int)$recent->fetchColumn() >= 25) {
                $pdo->prepare(
                    "UPDATE visit_sessions SET is_bot = 1, bot_reason = 'behavior' WHERE id = ?"
                )->execute([$sessionId]);
                $behaviorMarked = true;
            }
        }

        /* Task 139: всплеск страниц в одном батче — человек за окно флэша
           (6 с) открывает 1–3 страницы, скрипт прогоняет десятки переходов
           из очереди. ≥ 8 pageview в одном батче — бот. Причина флуда
           (behavior) сильнее — не перетираем её всплеском. */
        if (!$isBot && !$behaviorMarked && $views >= 8) {
            $pdo->prepare(
                "UPDATE visit_sessions SET is_bot = 1, bot_reason = 'behavior-burst' WHERE id = ?"
            )->execute([$sessionId]);
        }

        /* Периодическая чистка: события 90 дней, сессии и боты — 180. */
        if (random_int(1, 40) === 1) {
            try {
                $pdo->prepare('DELETE FROM visit_events WHERE created_at < ?')
                    ->execute([date('c', time() - 90 * 86400)]);
                $pdo->prepare('DELETE FROM visit_sessions WHERE last_seen < ?')
                    ->execute([date('c', time() - 180 * 86400)]);
                $pdo->prepare('DELETE FROM bot_hits WHERE last_seen < ?')
                    ->execute([date('c', time() - 180 * 86400)]);
            } catch (Throwable $e) {
                error_log('[visit-guard gc] ' . $e->getMessage());
            }
        }

        jsonResponse(['ok' => true]);
    }

    /** Строка из запроса: обрезать и убрать управляющие символы. */
    private static function cleanString(mixed $value, int $max): string
    {
        if (!is_string($value)) {
            return '';
        }
        $v = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/u', '', $value) ?? '';
        return mb_substr(trim($v), 0, $max);
    }

    /** Событие из запроса → безопасный массив или null (мусор выбрасываем). */
    private static function cleanEvent(mixed $ev): ?array
    {
        if (!is_array($ev)) {
            return null;
        }
        $type = (string)($ev['t'] ?? '');
        if (!in_array($type, self::EVENT_TYPES, true)) {
            return null;
        }
        $meta = $ev['m'] ?? [];
        if (!is_array($meta)) {
            $meta = [];
        }
        $meta = array_slice($meta, 0, 8);
        $metaJson = json_encode($meta, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($metaJson === false || mb_strlen($metaJson) > 500) {
            $metaJson = '';
        }

        $giftId = $ev['g'] ?? null;
        if (!is_numeric($giftId) || (int)$giftId < 1) {
            $giftId = null;
        }

        return [
            't'    => $type,
            'path' => self::cleanString($ev['path'] ?? '', 300),
            'gift_id' => $giftId !== null ? (int)$giftId : null,
            'gs'   => self::cleanString($ev['gs'] ?? '', 200),
            'gn'   => self::cleanString($ev['gn'] ?? '', 200),
            'm'    => $metaJson,
        ];
    }
}
