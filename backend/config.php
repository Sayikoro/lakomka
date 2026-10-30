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

/* ---------------------------------------------------------------------
 * Автогенерация секретов при первом запуске (например, на хостинге после
 * распаковки деплой-пакета). Если jwt_secret / encryption_key не заданы ни
 * в этом файле, ни в config.local.php — они создаются один раз и хранятся
 * в backend/storage/secret-keys.php (в git и деплой-пакеты не попадает).
 * Благодаря этому админка работает сразу после развёртывания: секретные
 * ключи генерируются сами, вручную ничего прописывать не нужно.
 * ------------------------------------------------------------------- */
foreach (['jwt_secret', 'encryption_key'] as $_secretKey) {
    if (!empty($config[$_secretKey])) continue;

    $_secretKeysPath = __DIR__ . '/storage/secret-keys.php';
    $_secretKeys = [];
    if (is_file($_secretKeysPath)) {
        $_secretKeys = require $_secretKeysPath;
        if (!is_array($_secretKeys)) $_secretKeys = [];
    }

    if (empty($_secretKeys[$_secretKey])) {
        if (!is_dir(__DIR__ . '/storage')) {
            @mkdir(__DIR__ . '/storage', 0775, true);
        }
        $_secretKeys[$_secretKey] = bin2hex(random_bytes(32));
        @file_put_contents(
            $_secretKeysPath,
            "<?php\n"
            . "// Автосгенерированные секреты первого запуска (см. config.php).\n"
            . "// НЕ коммитится и не входит в деплой-пакеты. На новом сервере\n"
            . "// создаётся заново; копировать между серверами без необходимости.\n"
            . "return " . var_export($_secretKeys, true) . ";\n",
            LOCK_EX
        );
    }

    $config[$_secretKey] = $_secretKeys[$_secretKey];
}
unset($_secretKey, $_secretKeysPath, $_secretKeys);

return $config;
