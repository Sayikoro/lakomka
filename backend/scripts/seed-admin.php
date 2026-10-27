<?php
require __DIR__ . '/../src/Database.php';

$pdo = Database::get();

$email = 'admin@lakomka.local';
$pass  = 'changeme123';
$hash  = password_hash($pass, PASSWORD_DEFAULT);

$stmt = $pdo->prepare(
    'INSERT INTO users (email, password_hash, name, role)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash'
);
$stmt->execute([$email, $hash, 'Admin', 'admin']);

echo "OK admin: $email / $pass`n";