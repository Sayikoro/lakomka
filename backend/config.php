<?php

return [
    'db_path' => __DIR__ . '/storage/database.sqlite',
    'debug'   => true,
    'admin_email' => 'admin@lakomka.local',
    'jwt_secret' => 'd1c64a99756b4513285f1e574873355ea05ae6ed9b5412affe50da64328548d4',
    'jwt_ttl' => 7 * 24 * 3600,

    // Ключ шифрования PII заказов (64 hex-символа = 32 байта)
    // Сгенерируй: php -r "echo bin2hex(random_bytes(32));"
    // ⚠️ СОХРАНИ В МЕНЕДЖЕРЕ ПАРОЛЕЙ — без него заказы не расшифруются
    'encryption_key' => '411c752c0e09573dc8fa4344e9c97b8c5b83980df58f784b0406c6954b2d56e3',
];