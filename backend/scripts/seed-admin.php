<?php
/**
 * Создание/обновление супер-админа.
 * Запуск: php scripts/seed-admin.php [email] [password]
 * Без аргументов: admin@lakomka.local / changeme123 (только для локальной разработки!)
 */
require __DIR__ . '/../src/Database.php';

$pdo = Database::get();

$email = $argv[1] ?? 'admin@lakomka.local';
$pass  = $argv[2] ?? 'changeme123';

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    fwrite(STDERR, "Некорректный email\n");
    exit(1);
}
if (strlen($pass) < 6) {
    fwrite(STDERR, "Пароль не короче 6 символов\n");
    exit(1);
}

$hash = password_hash($pass, PASSWORD_DEFAULT);

$stmt = $pdo->prepare(
    'INSERT INTO users (email, password_hash, name, role)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash'
);
$stmt->execute([$email, $hash, 'Admin', 'super_admin']);

echo "OK super_admin: $email\n";
if (!isset($argv[2])) {
    echo "⚠ Пароль по умолчанию: changeme123 — смени его в админке!\n";
}
