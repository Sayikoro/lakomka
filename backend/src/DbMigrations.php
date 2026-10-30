<?php

require_once __DIR__ . '/Paths.php';

/**
 * Миграции схемы БД + автоматический дамп перед ними.
 *
 * Зачем: база дорабатывается вместе с сайтом, и изменения структуры
 * нужно накатывать на УЖЕ РАБОТАЮЩИЕ сайты штатно — пакет обновлений
 * базу не трогает (там заказы), поэтому структуру поднимает код при
 * первом запросе. Перед каждой партией новых миграций автоматически
 * снимается копия базы в backend/storage/backups — если миграция
 * сломает данные, владелец (или мы) разворачивает дамп и ничего не
 * потеряно.
 *
 * Как добавить миграцию: положить файл backend/migrations/NNN_имя.sql
 * (натуральная сортировка по имени). Применится при первом запросе;
 * версия запишется в таблицу schema_migrations. SQL может содержать
 * несколько операторов; каждый файл применяем только если ещё не
 * применён. Индемпотентность внутри файла — на совести автора
 * (используйте IF NOT EXISTS / ADD COLUMN с проверкой).
 */
class DbMigrations
{
    /** Сколько последних дампов хранить */
    private const KEEP_BACKUPS = 10;

    /** @var bool защита от двойного запуска в одном процессе */
    private static bool $done = false;

    /** Каталог с миграциями: backend/migrations */
    public static function migrationsDir(): string
    {
        return dirname(__DIR__) . '/migrations';
    }

    /**
     * Применить все новые миграции. Перед применением — дамп БД.
     * Никогда не бросает исключения наружу: ошибки — в error_log,
     * сайт должен продолжать работать даже при сбойной миграции.
     * @return array{applied: string[], backup: string} для тестов
     */
    public static function run(PDO $pdo): array
    {
        $applied = [];
        $backup = '';
        if (self::$done) {
            return ['applied' => $applied, 'backup' => $backup];
        }
        self::$done = true;

        try {
            $files = self::pending($pdo);
            if ($files === []) {
                return ['applied' => $applied, 'backup' => $backup];
            }

            /* ДАМП ДО МИГРАЦИЙ — главная страховка владельца сайта */
            $backup = self::dump($pdo, 'pre-migrate');

            /* INSERT OR IGNORE: если миграцию параллельно применил другой воркер
               (первый запрос после обновления) — просто не спорим о том,
               кто её записал; сам SQL идемпотентен. */
            $mark = $pdo->prepare(
                'INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)'
            );
            foreach ($files as $version => $sql) {
                try {
                    $pdo->exec($sql);
                    $mark->execute([$version, date('c')]);
                    $applied[] = $version;
                    error_log('[migrations] применена ' . $version);
                } catch (Throwable $e) {
                    // Сбойная миграция не роняет сайт: пишем в лог и идём дальше
                    error_log('[migrations] ОШИБКА ' . $version . ': ' . $e->getMessage());
                }
            }
        } catch (Throwable $e) {
            error_log('[migrations] ' . $e->getMessage());
        }

        return ['applied' => $applied, 'backup' => $backup];
    }

    /** Список неприменённых миграций: version => sql (в порядке имён файлов) */
    private static function pending(PDO $pdo): array
    {
        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS schema_migrations (
                version TEXT PRIMARY KEY,
                applied_at TEXT NOT NULL
            )'
        );
        $known = $pdo->query('SELECT version FROM schema_migrations')->fetchAll(PDO::FETCH_COLUMN);

        $dir = self::migrationsDir();
        if (!is_dir($dir)) return [];

        $pending = [];
        foreach (scandir($dir, SCANDIR_SORT_ASCENDING) ?: [] as $f) {
            if (!str_ends_with($f, '.sql')) continue;
            if (in_array($f, $known, true)) continue;
            $sql = file_get_contents($dir . '/' . $f);
            if ($sql !== false && trim($sql) !== '') {
                $pending[$f] = $sql;
            }
        }
        return $pending;
    }

    /**
     * Дамп базы SQLite в backend/storage/backups.
     * Основной путь — «VACUUM INTO» (снимок на месте, консистентный,
     * работает при любом journal-режиме, SQLite ≥ 3.27) через ОТДЕЛЬНОЕ
     * соединение: у рабочего PDO бывают незакрытые statements (например,
     * после PRAGMA journal_mode) — с ними SQLite отказывается вакуумить
     * («cannot VACUUM - SQL statements in progress»). Фолбэк —
     * wal_checkpoint + копия файла. Возвращает путь дампа или ''.
     */
    public static function dump(PDO $pdo, string $tag = 'manual'): string
    {
        $dir = Paths::backupsDir();
        $db = dirname(__DIR__) . '/storage/database.sqlite';
        if (!is_file($db)) return '';

        $file = $dir . '/' . date('Ymd-His') . '-' . $tag . '.sqlite';
        $i = 1;
        while (is_file($file)) {
            $file = $dir . '/' . date('Ymd-His') . '-' . (++$i) . '-' . $tag . '.sqlite';
        }

        try {
            $fresh = new PDO('sqlite:' . $db);
            $fresh->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            $fresh->setAttribute(PDO::ATTR_TIMEOUT, 5);
            try {
                $fresh->exec('VACUUM INTO ' . $fresh->quote($file));
            } finally {
                $fresh = null; // закрыть соединение до проверок файла
            }
            if (is_file($file) && filesize($file) > 0) {
                self::prune($dir);
                return $file;
            }
        } catch (Throwable $e) {
            error_log('[migrations] VACUUM INTO недоступен (' . $e->getMessage() . '), копирую файл');
        }

        /* Фолбэк: чекпоинт WAL (чтобы весь результат попал в основной файл)
           и обычная копия. */
        try {
            $pdo->exec('PRAGMA wal_checkpoint(TRUNCATE)');
        } catch (Throwable $e) {
            /* не критично */
        }
        if (!@copy($db, $file)) return '';
        foreach ([$db . '-wal', $db . '-shm'] as $side) {
            if (is_file($side)) @copy($side, $file . substr($side, strlen($db)));
        }
        self::prune($dir);
        return is_file($file) ? $file : '';
    }

    /** Оставить только последние KEEP_BACKUPS дампов */
    private static function prune(string $dir): void
    {
        $files = glob($dir . '/*.sqlite') ?: [];
        if (count($files) <= self::KEEP_BACKUPS) return;
        usort($files, static fn (string $a, string $b): int => filemtime($b) <=> filemtime($a));
        foreach (array_slice($files, self::KEEP_BACKUPS) as $old) {
            @unlink($old);
        }
    }
}
