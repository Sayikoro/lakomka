<?php

require_once __DIR__ . '/Paths.php';

/**
 * «Здоровье сайта» (Task 121): сборник диагностических показателей
 * для новой вкладки в настройках админки. Ничего не меняет — только
 * честно отвечает: что стоит, что доступно, когда был бэкап.
 *
 * Здесь НЕТ секретов: smtp_pass/tg_bot_token наружу не уходят —
 * только факты «задан / не задан».
 */
class Health
{
    /**
     * Собрать все показатели одним массивом (для jsonResponse).
     * Никогда не бросает исключения наружу: сломанный блок —
     * поле с error-строкой, остальные показатели живут.
     */
    public static function collect(PDO $pdo): array
    {
        $settings = self::settingsMap($pdo);

        $db = dirname(__DIR__) . '/storage/database.sqlite';
        $uploads = Paths::uploadsRoot();
        $backupsDir = Paths::backupsDir();

        /* Бэкапы: последний по времени + сколько всего */
        $lastBackup = null;
        $backupsCount = 0;
        foreach (glob($backupsDir . '/*.sqlite') ?: [] as $f) {
            $backupsCount++;
            $m = @filemtime($f);
            if ($m && ($lastBackup === null || $m > $lastBackup['time'])) {
                $lastBackup = ['file' => basename($f), 'time' => $m];
            }
        }

        /* Попытки входа за сутки (таблица чистится сама — записи младше суток) */
        $loginsTotal = 0;
        $loginsFailed = 0;
        try {
            $loginsTotal = (int)$pdo->query(
                "SELECT COUNT(*) FROM login_attempts WHERE created_at > datetime('now', '-1 day')"
            )->fetchColumn();
            $loginsFailed = (int)$pdo->query(
                "SELECT COUNT(*) FROM login_attempts WHERE success = 0 AND created_at > datetime('now', '-1 day')"
            )->fetchColumn();
        } catch (Throwable $e) {
            /* таблицы может не быть на совсем старых базах */
        }

        /* Счётчики витрины */
        $ordersNew = 0;
        $productsTotal = 0;
        try {
            $ordersNew = (int)$pdo->query(
                "SELECT COUNT(*) FROM orders WHERE status = 'new'"
            )->fetchColumn();
            $productsTotal = (int)$pdo->query(
                'SELECT COUNT(*) FROM products WHERE deleted_at IS NULL'
            )->fetchColumn();
        } catch (Throwable $e) {
            /* не критично */
        }

        return [
            'time' => date('c'),
            'php' => PHP_VERSION . ' · ' . php_sapi_name(),
            'ffmpeg' => self::ffmpegPath(),
            'uploads' => [
                'dir' => str_replace(Paths::siteRoot(), '', $uploads) ?: 'uploads',
                'writable' => is_dir($uploads) && is_writable($uploads),
                'disk_free_bytes' => @disk_free_space($uploads) ?: null,
                'disk_total_bytes' => @disk_total_space($uploads) ?: null,
            ],
            'db' => [
                'size_bytes' => is_file($db) ? (int)filesize($db) : null,
            ],
            'backups' => [
                'interval_days' => max(0, (int)($settings['backup_interval_days'] ?? '3') ?: 3),
                'count' => $backupsCount,
                'last' => $lastBackup,
            ],
            'mail' => [
                'driver' => (string)($settings['mail_driver'] ?? 'log'),
                'smtp_host_set' => trim((string)($settings['smtp_host'] ?? '')) !== '',
                'admin_email_set' => trim((string)($settings['admin_email'] ?? '')) !== '',
                'notify_admin_email' => (($settings['notify_admin_email'] ?? '1') === '1'),
            ],
            'telegram_set' => trim((string)($settings['tg_bot_token'] ?? '')) !== ''
                && trim((string)($settings['tg_chat_id'] ?? '')) !== '',
            'logins_24h' => ['total' => $loginsTotal, 'failed' => $loginsFailed],
            'orders_new' => $ordersNew,
            'products_total' => $productsTotal,
            'version' => self::version(),
        ];
    }

    /** Карта настроек (ключ => значение); пустая карта при сбое */
    private static function settingsMap(PDO $pdo): array
    {
        try {
            $map = [];
            foreach ($pdo->query('SELECT key, value FROM settings')->fetchAll() as $r) {
                $map[$r['key']] = $r['value'];
            }
            return $map;
        } catch (Throwable $e) {
            return [];
        }
    }

    /** Путь к ffmpeg или null — та же логика поиска, что у MediaOptimizer */
    private static function ffmpegPath(): ?string
    {
        if (!function_exists('exec')) return null;
        $candidates = [
            trim((string)@shell_exec('command -v ffmpeg 2>/dev/null')),
            '/usr/bin/ffmpeg',
            '/usr/local/bin/ffmpeg',
            '/bin/ffmpeg',
            '/opt/homebrew/bin/ffmpeg',
        ];
        foreach ($candidates as $bin) {
            if ($bin === '' || !@is_executable($bin)) continue;
            @exec(escapeshellarg($bin) . ' -version 2>&1', $out, $code);
            if ($code === 0) return $bin;
        }
        return null;
    }

    /** Версия установленного пакета из backend/version.json (может не быть) */
    private static function version(): ?string
    {
        $f = dirname(__DIR__) . '/version.json';
        if (!is_file($f)) return null;
        $j = json_decode((string)@file_get_contents($f), true);
        $v = is_array($j) ? ($j['version'] ?? null) : null;
        return is_string($v) && $v !== '' ? $v : null;
    }
}
