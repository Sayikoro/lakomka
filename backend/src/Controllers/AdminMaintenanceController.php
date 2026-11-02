<?php

require_once __DIR__ . '/../Auth.php';
require_once __DIR__ . '/../DbMigrations.php';
require_once __DIR__ . '/../AdminLog.php';

/**
 * Обслуживание (Task 97-106): скачивание бэкапа базы и журнал действий.
 */
class AdminMaintenanceController
{
    /** GET /api/admin/db-backup — скачать снимок базы SQLite.
     *  Снимок «VACUUM INTO» (консистентный, живая база не блокируется),
     *  отдаётся файлом; копия остаётся в storage/backups (ротация 10 шт.). */
    public static function dbBackup(PDO $pdo): void
    {
        $payload = Auth::requireEditor();

        $file = DbMigrations::dump($pdo, 'manual');
        if ($file === '' || !is_file($file)) {
            jsonResponse(['error' => 'Не удалось создать снимок базы'], 500);
        }

        AdminLog::add($pdo, AdminLog::actor($payload), 'db-backup', basename($file));

        header('Content-Type: application/octet-stream');
        header('Content-Disposition: attachment; filename="' . basename($file) . '"');
        header('Content-Length: ' . (string)filesize($file));
        header('X-Content-Type-Options: nosniff');
        header('Cache-Control: no-store');
        readfile($file);
        exit;
    }

    /** GET /api/admin/log?limit=200 — последние записи журнала (super_admin). */
    public static function log(PDO $pdo): void
    {
        Auth::requireSuperAdmin();

        $limit = (int)($_GET['limit'] ?? 200);
        if ($limit < 1 || $limit > 1000) $limit = 200;

        $rows = $pdo->query(
            "SELECT id, created_at, actor, action, details
             FROM admin_log ORDER BY id DESC LIMIT $limit"
        )->fetchAll();

        $total = (int)$pdo->query('SELECT COUNT(*) FROM admin_log')->fetchColumn();

        jsonResponse(['data' => ['total' => $total, 'items' => $rows]]);
    }

    /* ============================================================
       Task 121: ЗДОРОВЬЕ САЙТА (вкладка в Настройках) и ЖУРНАЛ ВХОДОВ
       (страница «Пользователи»). Оба — только для super_admin: health
       раскрывает служебные детали (пути, версии), логины — приватное.
       ============================================================ */

    /** GET /api/admin/health — показатели состояния сайта (super_admin). */
    public static function health(PDO $pdo): void
    {
        Auth::requireSuperAdmin();

        require_once __DIR__ . '/../Health.php';
        jsonResponse(['data' => Health::collect($pdo)]);
    }

    /** GET /api/admin/logins?limit=300 — попытки входа за сутки (super_admin).
     *  Таблица login_attempts сама чистится: записи старше суток удаляются
     *  при каждом успешном логине (AuthController). */
    public static function logins(PDO $pdo): void
    {
        Auth::requireSuperAdmin();

        $limit = (int)($_GET['limit'] ?? 300);
        if ($limit < 1 || $limit > 1000) $limit = 300;

        try {
            $stmt = $pdo->prepare(
                "SELECT id, ip, email, success, created_at
                 FROM login_attempts ORDER BY id DESC LIMIT $limit"
            );
            $stmt->execute();
            $rows = $stmt->fetchAll();
        } catch (Throwable $e) {
            /* Таблицы ещё нет (обновление с совсем старой версии) — пусто */
            $rows = [];
        }

        jsonResponse(['data' => ['items' => $rows]]);
    }
}
