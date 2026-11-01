<?php

/* ============================================================
   Telegram-уведомления (Task 108).
   Отправка сообщений ботом в чат админа при новом заказе.

   Настройки берутся из таблицы settings:
     tg_bot_token — токен бота от @BotFather (секрет, маскируется в админке)
     tg_chat_id   — id чата/канала (число, может быть отрицательным
                    для групп, или @username канала)

   Ошибки НИКОГДА не ломают создание заказа: вызывающий код
   (OrderController) ловит Throwable, здесь — только честный отчёт.
   ============================================================ */

class Telegram
{
    /** Таймауты curl: заказ не должен висеть из-за медленного Telegram */
    private const CONNECT_TIMEOUT_MS = 3000;
    private const TIMEOUT_MS = 5000;

    /**
     * Отправить текст текущим ботом в настроенный чат.
     * @return array{0: bool, 1: string} [успех, текст ошибки (пусто при успехе)]
     */
    public static function sendMessage(PDO $pdo, string $text): array
    {
        $map = [];
        try {
            $rows = $pdo->query(
                "SELECT key, value FROM settings WHERE key IN ('tg_bot_token','tg_chat_id')"
            )->fetchAll();
            foreach ($rows as $r) {
                $map[$r['key']] = $r['value'];
            }
        } catch (Throwable $e) {
            return [false, 'Не удалось прочитать настройки: ' . $e->getMessage()];
        }

        $token = trim((string)($map['tg_bot_token'] ?? ''));
        $chat  = trim((string)($map['tg_chat_id'] ?? ''));
        if ($token === '' || $chat === '') {
            return [false, 'Не задан токен бота или chat_id (Настройки → Telegram-уведомления)'];
        }

        $ch = curl_init('https://api.telegram.org/bot' . rawurlencode($token) . '/sendMessage');
        if (!$ch) {
            return [false, 'curl не инициализировался'];
        }
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => http_build_query([
                'chat_id'                  => $chat,
                'text'                     => $text,
                'disable_web_page_preview' => '1',
            ]),
            CURLOPT_CONNECTTIMEOUT_MS => self::CONNECT_TIMEOUT_MS,
            CURLOPT_TIMEOUT_MS        => self::TIMEOUT_MS,
        ]);
        $body   = curl_exec($ch);
        $errno  = curl_errno($ch);
        $err    = curl_error($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);

        if ($body === false || $errno !== 0) {
            return [false, 'Сеть: ' . ($err !== '' ? $err : "errno {$errno}")];
        }

        $json = json_decode((string)$body, true);
        if (!is_array($json)) {
            return [false, "HTTP {$status}: некорректный ответ Telegram"];
        }
        if (empty($json['ok'])) {
            $desc = (string)($json['description'] ?? 'неизвестная ошибка');
            /* 401/404 — частые случаи: неверный токен или бот не запущен */
            return [false, "Telegram (HTTP {$status}): {$desc}"];
        }
        return [true, ''];
    }
}
