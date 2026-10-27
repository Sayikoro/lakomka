<?php

class Crypto
{
    private const PREFIX = 'v1:';
    private const CIPHER = 'aes-256-gcm';

    private static ?string $key = null;

    private static function key(): string
    {
        if (self::$key !== null) return self::$key;

        $cfg = require __DIR__ . '/../config.php';
        $raw = $cfg['encryption_key'] ?? '';

        if (!is_string($raw) || strlen($raw) < 32) {
            throw new RuntimeException(
                'encryption_key не задан в config.php. Сгенерируй: php -r "echo bin2hex(random_bytes(32));"'
            );
        }

        // Если это hex (64 символа) — декодируем в бинарные 32 байта
        if (preg_match('/^[0-9a-f]{64}$/i', $raw)) {
            self::$key = hex2bin($raw);
        } else {
            // иначе берём sha256 от строки (на случай если вписали фразу)
            self::$key = hash('sha256', $raw, true);
        }

        return self::$key;
    }

    /**
     * Зашифровать строку. Возвращает строку с префиксом "v1:...".
     * null и "" возвращаются как есть (null не шифруем, чтобы не терять смысл).
     */
    public static function encrypt(?string $plaintext): ?string
    {
        if ($plaintext === null || $plaintext === '') return $plaintext;

        $ivLen = openssl_cipher_iv_length(self::CIPHER);
        $iv = random_bytes($ivLen);
        $tag = '';

        $ciphertext = openssl_encrypt(
            $plaintext,
            self::CIPHER,
            self::key(),
            OPENSSL_RAW_DATA,
            $iv,
            $tag,
            '',
            16
        );

        if ($ciphertext === false) {
            throw new RuntimeException('Не удалось зашифровать данные: ' . openssl_error_string());
        }

        $payload = $iv . $ciphertext . $tag;
        return self::PREFIX . base64_encode($payload);
    }

    /**
     * Расшифровать. Если данные не зашифрованы (не начинаются с "v1:") —
     * возвращает как есть (обратная совместимость со старыми записями).
     */
    public static function decrypt(?string $stored): ?string
    {
        if ($stored === null || $stored === '') return $stored;

        if (!str_starts_with($stored, self::PREFIX)) {
            return $stored; // legacy plaintext
        }

        $b64 = substr($stored, strlen(self::PREFIX));
        $payload = base64_decode($b64, true);
        if ($payload === false) return null;

        $ivLen = openssl_cipher_iv_length(self::CIPHER);
        if (strlen($payload) < $ivLen + 16) return null;

        $iv = substr($payload, 0, $ivLen);
        $tag = substr($payload, -16);
        $ciphertext = substr($payload, $ivLen, -16);

        $plaintext = openssl_decrypt(
            $ciphertext,
            self::CIPHER,
            self::key(),
            OPENSSL_RAW_DATA,
            $iv,
            $tag
        );

        return $plaintext === false ? null : $plaintext;
    }

    /**
     * Хеш телефона для поиска (blind index).
     * Всегда детерминированный (одинаковый для одного и того же номера).
     * Поиск по частичному номеру НЕ работает — только точное совпадение.
     */
    public static function phoneHash(?string $phone): ?string
    {
        if ($phone === null || $phone === '') return null;

        $normalized = self::normalizePhone($phone);
        if ($normalized === '') return null;

        return hash_hmac('sha256', $normalized, self::key());
    }

    /** Только цифры, для нормализации при хешировании */
    private static function normalizePhone(string $phone): string
    {
        return preg_replace('/\D/', '', $phone);
    }

    /**
     * Безопасное сравнение двух хешей телефона (constant-time).
     */
    public static function phoneHashEquals(string $a, string $b): bool
    {
        return hash_equals($a, $b);
    }
}