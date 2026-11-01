<?php

/**
 * Журнал действий админов (Task 97-106).
 *
 * Аудит ключевых операций: товары (создание/правка/удаление/дублирование/
 * массовые операции), настройки, файлы (переименование/удаление/сжатие),
 * статусы заказов. Пишется тихо: сбой журнала НЕ должен ломать операцию —
 * ошибки уходят в error_log.
 *
 * Просмотр: GET /api/admin/log (только super_admin), вкладка «Журнал»
 * в настройках админки.
 */
class AdminLog
{
    /** Добавить запись. $details — короткая человекочитаемая строка. */
    public static function add(PDO $pdo, string $actor, string $action, string $details = ''): void
    {
        try {
            $pdo->prepare(
                'INSERT INTO admin_log (actor, action, details) VALUES (?, ?, ?)'
            )->execute([
                $actor !== '' ? $actor : 'unknown',
                mb_substr($action, 0, 64),
                mb_substr($details, 0, 500),
            ]);
        } catch (Throwable $e) {
            error_log('[admin_log] ' . $e->getMessage());
        }
    }

    /** Кто выполняет запрос: email из requireAuth/requireEditor payload. */
    public static function actor(array $payload): string
    {
        return (string)($payload['email'] ?? 'unknown');
    }
}
