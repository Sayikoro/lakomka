<?php
/**
 * Task 152 E2E: сид заказов/товаров/пользователей в БД деплой-пакета
 * (.deploy-package/backend/storage/database.sqlite) С ПАКЕТНЫМИ ключами
 * шифрования — имена/телефоны/письма корректно расшифруются контроллером.
 *
 * Запуск: php scripts/task152-e2e-seed.php
 */
declare(strict_types=1);

$pkg = dirname(__DIR__) . '/.deploy-package/backend';
if (!is_file($pkg . '/storage/database.sqlite')) {
    fwrite(STDERR, "нет .deploy-package — сначала MODE=both bash scripts/build-static.sh\n");
    exit(1);
}

require $pkg . '/src/Database.php';
require $pkg . '/src/Crypto.php';
require $pkg . '/src/Auth.php';

$pdo = Database::get();

/* ── очистка от прошлого прогона и смоук-мусора сборки ──
 * Пакетная БД — расходник сборки: смоук-тест оставляет заказ ЛК-…,
 * наши прошлые прогоны — T152E-*. Чистим всё (orders в пакете не живут). */
$allIds = $pdo->query('SELECT id FROM orders')->fetchAll(PDO::FETCH_COLUMN);
foreach ($allIds as $id) {
    $pdo->prepare('DELETE FROM order_items WHERE order_id = ?')->execute([$id]);
    $pdo->prepare('DELETE FROM order_status_history WHERE order_id = ?')->execute([$id]);
}
$pdo->exec('DELETE FROM orders');
$pdo->prepare("DELETE FROM products WHERE sku LIKE 'T152E-%'")->execute();
$pdo->prepare("DELETE FROM users WHERE email LIKE 't152e-%@lakomka.local'")->execute();

/* ── 25 заказов: 20 «новых» на сегодня + 5 «выполненных» неделю назад ── */
$ins = $pdo->prepare(
    "INSERT INTO orders (order_number, customer_name, customer_phone, customer_phone_hash,
         customer_email, delivery_method, address, comment, total_kopecks, status,
         created_at, email_sent, email_error)
     VALUES (?, ?, ?, ?, ?, 'city', ?, ?, ?, ?, ?, ?, NULL)"
);
$today = date('Y-m-d');
$weekAgo = date('Y-m-d', time() - 7 * 86400);
for ($i = 1; $i <= 20; $i++) {
    $phone = sprintf('+7 914 300-%02d-%02d', intdiv($i, 100) % 100, $i % 100);
    $phone = sprintf('+7 914 300-%04d', $i);
    $num = sprintf('T152E-%03d', $i);
    $ins->execute([
        $num,
        Crypto::encrypt('E2E Клиент ' . $i),
        Crypto::encrypt($phone),
        Crypto::phoneHash($phone),
        Crypto::encrypt('t152e@example.org'),
        Crypto::encrypt('Хабаровск, e2e ' . $i),
        Crypto::encrypt('комментарий ' . $num),
        150000 + $i * 1000,
        'new',
        $today . sprintf('T%02d:%02d:00', 8 + intdiv($i, 4), ($i * 7) % 60),
        $i % 10 === 0 ? 0 : 1, // каждый 10-й — письмо не ушло (для плитки-тревоги)
    ]);
}
for ($i = 21; $i <= 25; $i++) {
    $phone = sprintf('+7 914 300-%04d', $i);
    $num = sprintf('T152E-%03d', $i);
    $ins->execute([
        $num,
        Crypto::encrypt('E2E Клиент ' . $i),
        Crypto::encrypt($phone),
        Crypto::phoneHash($phone),
        Crypto::encrypt('t152e@example.org'),
        Crypto::encrypt('Хабаровск, e2e ' . $i),
        Crypto::encrypt('комментарий ' . $num),
        200000 + $i * 1000,
        'done',
        $weekAgo . 'T12:00:00',
        1,
    ]);
}

/* ── товары с низким остатком (для плитки-тревоги) ── */
$insP = $pdo->prepare(
    "INSERT INTO products (sku, slug, name, type, price_kopecks, stock_qty,
         show_in_catalog, is_published, category_id)
     VALUES (?, ?, ?, 'simple', 100000, ?, 1, 1, NULL)"
);
$insP->execute(['T152E-STOCK-0', 't152e-zero', 'E2E Закончился', 0]);
$insP->execute(['T152E-STOCK-2', 't152e-two', 'E2E Заканчивается', 2]);

/* ── viewer для проверки скрытия меню ── */
$pdo->prepare(
    "INSERT INTO users (email, password_hash, role, token_version)
     VALUES ('t152e-viewer@lakomka.local', ?, 'viewer', 0)"
)->execute([password_hash('T152e-Viewer-2026!', PASSWORD_DEFAULT)]);

/* Тестовый супер-админ с известным паролем (для Playwright-логина) */
$st = $pdo->prepare("SELECT id FROM users WHERE email = 't152e-admin@lakomka.local'");
$st->execute();
if (!$st->fetchColumn()) {
    $pdo->prepare(
        "INSERT INTO users (email, password_hash, role, token_version)
         VALUES ('t152e-admin@lakomka.local', ?, 'super_admin', 0)"
    )->execute([password_hash('T152e-Admin-2026!', PASSWORD_DEFAULT)]);
}

$n = $pdo->query("SELECT COUNT(*) FROM orders WHERE order_number LIKE 'T152E-%'")->fetchColumn();
$big = $pdo->query(
    "SELECT p.slug FROM bundle_items b JOIN products p ON p.id = b.product_id
     GROUP BY b.product_id ORDER BY COUNT(*) DESC LIMIT 1"
)->fetchColumn();
echo "seeded orders=$n" . PHP_EOL;
echo "big_bundle=$big" . PHP_EOL;
