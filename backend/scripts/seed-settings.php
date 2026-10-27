<?php
require __DIR__ . '/../src/Database.php';

$pdo = Database::get();

$defaults = [
    'admin_email'  => 'admin@lakomka.local',
    'from_email'   => 'noreply@lakomka.ru',
    'from_name'    => 'Лакомка',
    'site_url'     => 'http://localhost:3000',
    'mail_driver'  => 'log',        // log | smtp
    'smtp_host'    => '',
    'smtp_port'    => '587',
    'smtp_user'    => '',
    'smtp_pass'    => '',
    'smtp_secure'  => 'tls',        // tls | ssl | ''
];

$stmt = $pdo->prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO NOTHING'
);

foreach ($defaults as $k => $v) {
    $stmt->execute([$k, $v]);
}

echo "OK settings: " . count($defaults) . "`n";