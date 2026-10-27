<?php
/**
 * Конфигурация бэкенда.
 *
 * Секреты (jwt_secret, encryption_key, пароли) НЕ должны храниться здесь —
 * этот файл коммитится в git. Положите их в backend/config.local.php
 * (в .gitignore) — он автоматически перекроет значения ниже.
 *
 * Шаблон: config.example.php
 * Генерация ключей: php -r "echo bin2hex(random_bytes(32));"
 */

$config = [
    'db_path' => __DIR__ . '/storage/database.sqlite',
    'debug'   => false,
    'admin_email' => 'admin@lakomka.local',

    // TTL JWT-токена: 7 дней
    'jwt_ttl' => 7 * 24 * 3600,

    // Разрешённые origin для CORS (для локальной разработки).
    // В проде фронт и API обычно за одним доменом — CORS не нужен.
    'cors_allowed_origins' => [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
    ],

    // ⚠️ Секреты ниже — заглушки. Переопределите в config.local.php:
    'jwt_secret'     => '',   // ОБЯЗАТЕЛЬНО задать в config.local.php
    'encryption_key' => '',   // ОБЯЗАТЕЛЬНО задать в config.local.php
];

$localPath = __DIR__ . '/config.local.php';
if (is_file($localPath)) {
    $local = require $localPath;
    if (is_array($local)) {
        $config = array_merge($config, $local);
    }
}

return $config;
