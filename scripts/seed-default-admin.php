<?php
/**
 * Добавляет дефолтного суперадмина в копию БД деплой-пакета.
 *
 * Вызывается из scripts/build-static.sh: в пакетной базе всегда есть
 * учётка admin@lakomka.local / Lakomka2026! (role=super_admin), чтобы
 * после развёртывания на хостинге админка открывалась сразу. Подсказку
 * с этими кредами показывает страница входа; как только пароль сменён —
 * подсказка исчезает (см. Bootstrap::isDefaultPassword).
 *
 * Запуск: php scripts/seed-default-admin.php <путь-к-database.sqlite>
 */

$dbPath = $argv[1] ?? '';
if ($dbPath === '' || !is_file($dbPath)) {
    fwrite(STDERR, "Укажите путь к database.sqlite\n");
    exit(1);
}

$pdo = new PDO('sqlite:' . $dbPath);
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$email = 'admin@lakomka.local';
$hash = password_hash('Lakomka2026!', PASSWORD_DEFAULT);

$stmt = $pdo->prepare('SELECT id FROM users WHERE email = ?');
$stmt->execute([$email]);

if ($stmt->fetchColumn()) {
    echo "default admin already exists: {$email}\n";
    exit(0);
}

$pdo->prepare(
    'INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)'
)->execute([$email, $hash, 'Супер-админ', 'super_admin']);

echo "seeded default admin: {$email}\n";
