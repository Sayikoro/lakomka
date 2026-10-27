<?php
/**
 * Шаблон локального конфига. Скопируйте в backend/config.local.php
 * и подставьте свои значения. config.local.php в git НЕ попадает.
 *
 * cp config.example.php config.local.php
 * php -r "echo bin2hex(random_bytes(32));"   → jwt_secret
 * php -r "echo bin2hex(random_bytes(32));"   → encryption_key
 */

return [
    // HMAC-ключ для подписи JWT админ-панели
    'jwt_secret' => 'ВСТАВЬТЕ_64_HEX_СИМВОЛА',

    // Ключ шифрования PII заказов (AES-256-GCM, 32 байта = 64 hex-символа).
    // ⚠️ СОХРАНИТЕ В МЕНЕДЖЕРЕ ПАРОЛЕЙ — без него заказы не расшифруются!
    'encryption_key' => 'ВСТАВЬТЕ_64_HEX_СИМВОЛА',

    // Уведомления о заказах приходят сюда (или настраивается в админке → Настройки)
    'admin_email' => 'admin@lakomka.local',

    'debug' => false,
];
