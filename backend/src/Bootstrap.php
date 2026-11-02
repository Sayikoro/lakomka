<?php

/**
 * Первый запуск сайта: каноническая схема БД + дефолтный суперадмин.
 *
 * Зачем: деплой-пакет разворачивается на обычном хостинге, где нет консоли.
 * Чтобы админка заработала сразу после распаковки, при каждом запросе:
 *   1) если БД пуста — создаётся каноническая схема (src/schema.sql);
 *   2) если учётки суперадмина admin@lakomka.local ещё нет — она создаётся
 *      с дефолтным паролем. Это верно и для свежего сайта, и для уже
 *      развёрнутого: пакеты обновлений сознательно не трогают базу
 *      (заказы, SMTP), поэтому дефолтный админ доезжает до работающего
 *      сайта именно через код. Существующий пароль никогда не
 *      перезаписывается; если учётку удалить — она создастся заново
 *      с дефолтным паролем (способ восстановления доступа);
 *   3) секретные ключи (jwt_secret, encryption_key) при пустом конфиге
 *      генерируются автоматически — см. config.php (storage/secret-keys.php).
 *
 * Идемпотентно и дёшево: на размеченной БД — один SELECT по sqlite_master
 * и один SELECT по users.
 */
class Bootstrap
{
    /** Логин дефолтного суперадмина (создаётся при первом запуске) */
    public const DEFAULT_ADMIN_EMAIL = 'admin@lakomka.local';

    /** Дефолтный пароль суперадмина — обязательно сменить после первого входа */
    public const DEFAULT_ADMIN_PASSWORD = 'Lakomka2026!';

    private static bool $done = false;

    public static function ensure(PDO $pdo): void
    {
        if (self::$done) return;
        self::$done = true;

        try {
            self::ensureSchema($pdo);
            self::ensureSuperAdmin($pdo);
            /* Миграции схемы (с автоматическим дампом БД перед ними) —
               см. DbMigrations: пакет обновлений базу не трогает, поэтому
               изменения структуры доезжают до работающих сайтов кодом. */
            require_once __DIR__ . '/DbMigrations.php';
            DbMigrations::run($pdo);
        } catch (Throwable $e) {
            // Первый запуск не должен ломать работу API — ошибки только в лог
            error_log('[bootstrap] ' . $e->getMessage());
        }

        /* Task 120: самовосстановление системных файлов витрины (снежинка,
           логотип, иконки/фон «Как мы работаем»). Быстрый путь — один is_file
           на файл; копирование только если чего-то не хватает. Так файлы,
           утерянные ещё ДО версии с защитой (Task 118), возвращаются сами
           при первом запросе к API после обновления кода. */
        try {
            require_once __DIR__ . '/SystemFiles.php';
            $restored = SystemFiles::ensureHealed();
            if ($restored !== []) {
                error_log('[system-files] восстановлены: ' . implode(', ', $restored));
            }
        } catch (Throwable $e) {
            error_log('[system-files] ' . $e->getMessage());
        }

        /* Task 121: авто-бэкап БД по расписанию. Дёшево: glob + filemtime;
           сам дамп — «VACUUM INTO» в storage/backups (вне веб-корня),
           ротация 10 штук уже в DbMigrations::prune. Интервал — настройка
           backup_interval_days (сутки, 0 = выключено, по умолчанию 3). */
        try {
            $interval = 3;
            $row = $pdo->query(
                "SELECT value FROM settings WHERE key = 'backup_interval_days'"
            )->fetchColumn();
            if ($row !== false && $row !== null && (int)$row >= 0) {
                $interval = (int)$row;
            }
            $dump = DbMigrations::maybeAutoBackup($pdo, $interval);
            if ($dump !== '') {
                error_log('[backup] авто-бэкап базы: ' . basename($dump));
            }
        } catch (Throwable $e) {
            error_log('[backup] ' . $e->getMessage());
        }
    }

    /** Схема БД: если якорных таблиц нет — применяем каноническую схему. */
    private static function ensureSchema(PDO $pdo): void
    {
        $stmt = $pdo->query(
            "SELECT COUNT(*) FROM sqlite_master
             WHERE type = 'table'
               AND name IN ('users','products','orders','settings')"
        );
        if ((int)$stmt->fetchColumn() >= 4) {
            return; // схема уже на месте
        }

        $sql = file_get_contents(__DIR__ . '/schema.sql');
        if ($sql === false) {
            throw new RuntimeException('Не найден src/schema.sql');
        }
        $pdo->exec($sql);
    }

    /**
     * Дефолтный суперадмин: гарантируем его наличие в БД ЛЮБОГО сайта.
     * Проверка по email (дешёвый SELECT по UNIQUE-индексу), а не по пустой
     * таблице users: на давно работающем сайте пользователи уже есть, но
     * дефолтной учётки может не быть (она появилась в новых сборках).
     */
    private static function ensureSuperAdmin(PDO $pdo): void
    {
        $stmt = $pdo->prepare('SELECT id FROM users WHERE email = ?');
        $stmt->execute([self::DEFAULT_ADMIN_EMAIL]);
        if ($stmt->fetchColumn()) {
            return; // учётка есть — её пароль (даже сменённый) не трогаем
        }

        $pdo->prepare(
            'INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)'
        )->execute([
            self::DEFAULT_ADMIN_EMAIL,
            password_hash(self::DEFAULT_ADMIN_PASSWORD, PASSWORD_DEFAULT),
            'Супер-админ',
            'super_admin',
        ]);
    }

    /**
     * Для страницы входа: true, если дефолтный суперадмин существует и
     * всё ещё ходит с дефолтным паролем (покажем подсказку с кредами).
     * Как только пароль сменён — подсказка исчезает.
     */
    public static function isDefaultPassword(PDO $pdo): bool
    {
        try {
            $stmt = $pdo->prepare('SELECT password_hash FROM users WHERE email = ?');
            $stmt->execute([self::DEFAULT_ADMIN_EMAIL]);
            $hash = $stmt->fetchColumn();
            if ($hash === false) {
                return false;
            }
            return password_verify(self::DEFAULT_ADMIN_PASSWORD, (string)$hash);
        } catch (Throwable $e) {
            return false;
        }
    }
}
