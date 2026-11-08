<?php
/**
 * Task 152: функциональный тест новых контроллеров админки на dev-БД.
 *
 * Модель выполнения: контроллеры завершают процесс через jsonResponse()
 * (echo + exit), поэтому каждый кейс — отдельный процесс:
 *   - кейсы-«ожидания» (expect-*) печатают SQL-эталон "key=value;..." ДО
 *     вызова контроллера;
 *   - кейсы-контроллеры печатают JSON/CSV контроллера как есть.
 * Bash-скрипт task152-tests.sh сравнивает их через python.
 *
 * Все тестовые записи помечены префиксом T152 и удаляются кейсом cleanup.
 * Запуск: php scripts/task152-func.php <case>
 */
declare(strict_types=1);

$case = $argv[1] ?? '';
$ROOT = dirname(__DIR__);

require $ROOT . '/backend/src/Database.php';
require $ROOT . '/backend/src/Crypto.php';
require $ROOT . '/backend/src/Auth.php';
require $ROOT . '/backend/src/AdminLog.php';
require $ROOT . '/backend/src/OrderStatuses.php';
require $ROOT . '/backend/src/Controllers/AdminOrdersController.php';
require $ROOT . '/backend/src/Controllers/AdminDashboardController.php';
require $ROOT . '/backend/src/Controllers/AuthController.php';

$pdo = Database::get();

if (!function_exists('jsonResponse')) {
    function jsonResponse(mixed $data, int $status = 200): void
    {
        http_response_code($status);
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }
}

function kv(array $pairs): void
{
    $items = [];
    foreach ($pairs as $k => $v) {
        $items[] = $k . '=' . $v;
    }
    echo implode(';', $items) . PHP_EOL;
    exit;
}

function ensureTestUser(PDO $pdo): int
{
    $email = 't152-e2e@lakomka.local';
    $st = $pdo->prepare('SELECT id FROM users WHERE email = ?');
    $st->execute([$email]);
    $id = $st->fetchColumn();
    if ($id) return (int)$id;
    $pdo->prepare(
        "INSERT INTO users (email, password_hash, role, token_version)
         VALUES (?, ?, 'super_admin', 0)"
    )->execute([$email, password_hash('T152-Test!' . bin2hex(random_bytes(4)), PASSWORD_DEFAULT)]);
    return (int)$pdo->lastInsertId();
}

function tokenFor(PDO $pdo, int $userId, ?int $forceTv = null): string
{
    $st = $pdo->prepare('SELECT id, email, role, token_version FROM users WHERE id = ?');
    $st->execute([$userId]);
    $u = $st->fetch();
    return Auth::issueToken(
        (int)$u['id'],
        $u['email'],
        $u['role'],
        $forceTv ?? (int)$u['token_version'],
    );
}

function authAs(PDO $pdo, ?int $forceTv = null): int
{
    $id = ensureTestUser($pdo);
    $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . tokenFor($pdo, $id, $forceTv);
    return $id;
}

function cleanOrders(PDO $pdo): void
{
    $ids = $pdo->query("SELECT id FROM orders WHERE order_number LIKE 'T152-%'")
        ->fetchAll(PDO::FETCH_COLUMN);
    foreach ($ids as $id) {
        $pdo->prepare('DELETE FROM order_items WHERE order_id = ?')->execute([$id]);
        $pdo->prepare('DELETE FROM order_status_history WHERE order_id = ?')->execute([$id]);
    }
    $pdo->prepare("DELETE FROM orders WHERE order_number LIKE 'T152-%'")->execute();
}

/* Эталон одного фильтра: SQL-счётчик по T152-заказам. Фильтр — $argv[2] (URL-строка). */
function expectedForFilter(PDO $pdo, string $qs): int
{
    $like = "order_number LIKE 'T152-%'";
    if ($qs === 'status=done') {
        return (int)$pdo->query("SELECT COUNT(*) FROM orders WHERE $like AND status = 'done'")->fetchColumn();
    }
    if (str_starts_with($qs, 'phone=')) {
        $phone = urldecode(substr($qs, strlen('phone=')));
        return (int)$pdo->query(
            "SELECT COUNT(*) FROM orders WHERE $like AND customer_phone_hash = '"
            . Crypto::phoneHash($phone) . "'"
        )->fetchColumn();
    }
    if ($qs === 'number=002') {
        return (int)$pdo->query("SELECT COUNT(*) FROM orders WHERE $like AND order_number LIKE '%002%'")->fetchColumn();
    }
    if ($qs === 'email=0') {
        return (int)$pdo->query("SELECT COUNT(*) FROM orders WHERE $like AND email_sent = 0")->fetchColumn();
    }
    if ($qs === 'email=1') {
        return (int)$pdo->query("SELECT COUNT(*) FROM orders WHERE $like AND email_sent = 1")->fetchColumn();
    }
    if (str_starts_with($qs, 'from=') && !str_contains($qs, 'status=')) {
        return (int)$pdo->query(
            "SELECT COUNT(*) FROM orders WHERE $like AND substr(created_at, 1, 10) >= date('now', '-5 days')"
        )->fetchColumn();
    }
    if (str_starts_with($qs, 'status=cancelled&from=')) {
        return (int)$pdo->query(
            "SELECT COUNT(*) FROM orders WHERE $like AND status = 'cancelled'
                AND substr(created_at, 1, 10) >= date('now', '-50 days')
                AND substr(created_at, 1, 10) <= date('now', '-30 days')"
        )->fetchColumn();
    }
    return -1;
}

function seedOrders(PDO $pdo): void
{
    cleanOrders($pdo);
    $rows = [
        // [номер, статус, дата, сумма, email_sent, телефон, доставка]
        ['T152-001', 'new',       date('Y-m-d') . 'T10:00:00', 150000, 0, '+7 914 111-11-11', 'city'],
        ['T152-002', 'paid',      date('Y-m-d') . 'T11:30:00', 250000, 1, '+7 914 222-22-22', 'pickup'],
        ['T152-003', 'done',      date('Y-m-d', time() - 3 * 86400) . 'T09:00:00', 100000, 1, '+7 914 333-33-33', 'tk'],
        ['T152-004', 'cancelled', date('Y-m-d', time() - 40 * 86400) . 'T12:00:00', 50000, 0, '+7 914 111-11-11', 'city'],
        ['T152-005', 'shipped',   date('Y-m-d', time() - 400 * 86400) . 'T12:00:00', 200000, 1, '+7 914 555-55-55', 'region'],
    ];
    $ins = $pdo->prepare(
        "INSERT INTO orders (order_number, customer_name, customer_phone, customer_phone_hash,
             customer_email, delivery_method, address, comment, total_kopecks, status,
             created_at, email_sent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    foreach ($rows as [$num, $status, $createdAt, $sum, $emailSent, $phone, $delivery]) {
        $ins->execute([
            $num,
            Crypto::encrypt('Тестовый Клиент ' . substr($num, -3)),
            Crypto::encrypt($phone),
            Crypto::phoneHash($phone),
            Crypto::encrypt('t152@example.org'),
            $delivery,
            Crypto::encrypt('Хабаровск, тестовая 1'),
            Crypto::encrypt('комментарий ' . $num),
            $sum,
            $status,
            $createdAt,
            $emailSent,
        ]);
    }
}

/* 12 заказов на сегодняшнюю дату — для пагинации (per_page=10 → 2 страницы) */
function seedOrders12(PDO $pdo): void
{
    cleanOrders($pdo);
    $ins = $pdo->prepare(
        "INSERT INTO orders (order_number, customer_name, customer_phone, customer_phone_hash,
             customer_email, delivery_method, total_kopecks, status, created_at, email_sent)
         VALUES (?, ?, ?, ?, ?, 'city', ?, 'new', ?, 1)"
    );
    for ($i = 1; $i <= 12; $i++) {
        $num = sprintf('T152-P%02d', $i);
        $phone = sprintf('+7 914 900-%02d-%02d', $i, $i);
        $ins->execute([
            $num,
            Crypto::encrypt('Пагинация ' . $i),
            Crypto::encrypt($phone),
            Crypto::phoneHash($phone),
            Crypto::encrypt('t152@example.org'),
            $i * 1000,
            date('Y-m-d') . sprintf('T%02d:00:00', $i),
        ]);
    }
}

function seedLowStock(PDO $pdo): void
{
    $pdo->prepare("DELETE FROM products WHERE sku LIKE 'T152-STOCK-%'")->execute();
    $ins = $pdo->prepare(
        "INSERT INTO products (sku, slug, name, type, price_kopecks, stock_qty,
             show_in_catalog, is_published, category_id)
         VALUES (?, ?, ?, 'simple', 100000, ?, 1, 1, NULL)"
    );
    $ins->execute(['T152-STOCK-0', 't152-zero', 'T152 Кончился совсем', 0]);
    $ins->execute(['T152-STOCK-3', 't152-three', 'T152 Кончается', 3]);
    $ins->execute(['T152-STOCK-9', 't152-nine', 'T152 Достаточно', 9]);
    $ins->execute(['T152-STOCK-2H', 't152-hidden', 'T152 Скрытый с нулём', 0]);
    $pdo->prepare("UPDATE products SET is_published = 0 WHERE sku = 'T152-STOCK-2H'")->execute();
}

switch ($case) {
    case 'seed': {
        seedOrders($pdo);
        seedLowStock($pdo);
        kv(['ok' => 1]);
    }

    /* Эталон для list-basic (без фильтров) */
    case 'expect-basic': {
        seedOrders($pdo);
        $exp = $pdo->query(
            "SELECT COUNT(*), COALESCE(SUM(total_kopecks),0) FROM orders WHERE order_number LIKE 'T152-%'"
        )->fetch(PDO::FETCH_NUM);
        kv(['total' => (int)$exp[0], 'sum' => (int)$exp[1]]);
    }

    case 'list-basic': {
        authAs($pdo);
        $_GET = [];
        AdminOrdersController::list($pdo); // печатает JSON и exit
    }

    /* Эталон пагинации: 12 заказов, per_page=10, страница 2 */
    case 'expect-pagination': {
        seedOrders12($pdo);
        kv(['total' => 12, 'pages' => 2, 'rows' => 2]);
    }

    case 'list-pagination': {
        authAs($pdo);
        $_GET = ['per_page' => '10', 'page' => '2', 'number' => 'T152-P'];
        AdminOrdersController::list($pdo);
    }

    case 'expect-one': {
        $qs = $argv[2] ?? '';
        kv(['sql' => expectedForFilter($pdo, $qs)]);
    }

    case 'list-one': {
        authAs($pdo);
        parse_str($argv[2] ?? '', $_GET);
        AdminOrdersController::list($pdo);
    }

    case 'list-bad-phone': {
        authAs($pdo);
        $_GET = ['phone' => 'not-a-phone'];
        AdminOrdersController::list($pdo);
    }

    case 'export': {
        authAs($pdo);
        seedOrders($pdo);
        $_GET = ['number' => 'T152-', 'status' => 'paid'];
        AdminOrdersController::exportCsv($pdo); // печатает CSV и exit
    }

    /* Эталон daily: заказы за сегодня */
    case 'expect-daily': {
        $sum = (int)$pdo->query(
            "SELECT COALESCE(SUM(total_kopecks),0) FROM orders WHERE order_number LIKE 'T152-%' AND date(created_at) = date('now')"
        )->fetchColumn();
        $cnt = (int)$pdo->query(
            "SELECT COUNT(*) FROM orders WHERE order_number LIKE 'T152-%' AND date(created_at) = date('now')"
        )->fetchColumn();
        kv(['cnt' => $cnt, 'sum' => $sum]);
    }

    case 'daily': {
        authAs($pdo);
        $_GET = ['days' => '14'];
        AdminDashboardController::daily($pdo);
    }

    /* Эталон alerts: письма T152 (email_sent=0) */
    case 'expect-alerts': {
        $emails = (int)$pdo->query(
            "SELECT COUNT(*) FROM orders WHERE order_number LIKE 'T152-%' AND email_sent = 0"
        )->fetchColumn();
        kv(['emails' => $emails]);
    }

    case 'alerts': {
        authAs($pdo);
        seedLowStock($pdo);
        $_GET = [];
        AdminDashboardController::alerts($pdo);
    }

    case 'logout-all': {
        authAs($pdo);
        AuthController::logoutAll($pdo);
    }

    /* Текущий token_version тестового пользователя */
    case 'tv': {
        $id = ensureTestUser($pdo);
        $v = (int)$pdo->query("SELECT token_version FROM users WHERE id = $id")->fetchColumn();
        kv(['tv' => $v]);
    }

    case 'require-auth-stale': {
        $id = ensureTestUser($pdo);
        $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer ' . tokenFor($pdo, $id, 0);
        Auth::requireAuth();
        echo 'ACCEPTED' . PHP_EOL;
        exit;
    }

    case 'cleanup': {
        cleanOrders($pdo);
        $pdo->prepare("DELETE FROM products WHERE sku LIKE 'T152-STOCK-%'")->execute();
        $pdo->prepare("DELETE FROM users WHERE email = 't152-e2e@lakomka.local'")->execute();
        $pdo->prepare("DELETE FROM admin_log WHERE actor = 't152-e2e@lakomka.local'")->execute();
        $pdo->prepare("DELETE FROM admin_log WHERE details LIKE '%T152-%'")->execute();
        $left = (int)$pdo->query("SELECT COUNT(*) FROM orders WHERE order_number LIKE 'T152-%'")->fetchColumn();
        kv(['left_orders' => $left, 'left_products' =>
            (int)$pdo->query("SELECT COUNT(*) FROM products WHERE sku LIKE 'T152-%'")->fetchColumn()]);
    }

    default:
        kv(['error' => 'unknown case']);
}
