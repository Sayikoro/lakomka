<?php

require_once __DIR__ . '/../Auth.php';
require_once __DIR__ . '/../Crypto.php';

/**
 * Task 152: данные для дашборда админки.
 *
 * daily()  — динамика по дням: заказы, сумма, визиты (люди/боты, просмотры).
 *            Один эндпоинт обслуживает и дашборд, и график в «Аналитике».
 * alerts() — плитки-тревоги: письма клиенту не ушли (email_sent = 0) и
 *            опубликованные товары с остатком ниже порога.
 */
class AdminDashboardController
{
    /** Дефолтный порог «заканчивается», если нет настройки low_stock_threshold. */
    private const DEFAULT_STOCK_THRESHOLD = 5;

    /* ========================= ГРАФИК ПО ДНЯМ ======================= */

    /**
     * GET /api/admin/dashboard/daily?days=14[&from=YYYY-MM-DD&to=YYYY-MM-DD]
     * Ответ: {data: {days: [{date, orders, orders_sum_kopecks, sessions,
     *          humans, bots, views}], from, to}} — пропущенные дни заполнены нулями.
     */
    public static function daily(PDO $pdo): void
    {
        Auth::requireAuth();

        $from = trim($_GET['from'] ?? '');
        $to   = trim($_GET['to'] ?? '');
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $from) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $to) || $from > $to) {
            $days = (int)($_GET['days'] ?? 14);
            if ($days < 1 || $days > 365) $days = 14;
            $to = date('Y-m-d');
            $from = date('Y-m-d', strtotime($to) - ($days - 1) * 86400);
        }

        $fromISO = $from . 'T00:00:00';
        $toISO   = $to . 'T23:59:59';

        /* Заказы по дням: количество и деньги */
        $o = $pdo->prepare(
            "SELECT substr(created_at, 1, 10) d, COUNT(*) n, COALESCE(SUM(total_kopecks), 0) s
             FROM orders WHERE created_at >= ? AND created_at <= ? GROUP BY d"
        );
        $o->execute([$fromISO, $toISO]);
        $ordersByDay = [];
        foreach ($o->fetchAll() as $r) {
            $ordersByDay[$r['d']] = [(int)$r['n'], (int)$r['s']];
        }

        /* Визиты по дням: сессии, люди, боты, просмотры */
        $v = $pdo->prepare(
            "SELECT substr(first_seen, 1, 10) d, COUNT(*) n,
                    SUM(CASE WHEN is_bot = 0 THEN 1 ELSE 0 END) humans,
                    SUM(CASE WHEN is_bot = 1 THEN 1 ELSE 0 END) bots,
                    COALESCE(SUM(views), 0) views
             FROM visit_sessions WHERE first_seen >= ? AND first_seen <= ? GROUP BY d"
        );
        $v->execute([$fromISO, $toISO]);
        $visitsByDay = [];
        foreach ($v->fetchAll() as $r) {
            $visitsByDay[$r['d']] = [(int)$r['n'], (int)$r['humans'], (int)$r['bots'], (int)$r['views']];
        }

        /* Собираем непрерывную шкалу дней с нулями в пропусках */
        $days = [];
        $cur = strtotime($from);
        $end = strtotime($to);
        while ($cur <= $end) {
            $d = date('Y-m-d', $cur);
            [$on, $os] = $ordersByDay[$d] ?? [0, 0];
            [$vn, $vh, $vb, $vw] = $visitsByDay[$d] ?? [0, 0, 0, 0];
            $days[] = [
                'date' => $d,
                'orders' => $on,
                'orders_sum_kopecks' => $os,
                'sessions' => $vn,
                'humans' => $vh,
                'bots' => $vb,
                'views' => $vw,
            ];
            $cur = strtotime('+1 day', $cur);
        }

        jsonResponse(['data' => ['from' => $from, 'to' => $to, 'days' => $days]]);
    }

    /* ======================== ПЛИТКИ-ТРЕВОГИ ======================== */

    /**
     * GET /api/admin/dashboard/alerts
     * Ответ: {data: {
     *   emails_failed: {count, latest: [{id, order_number, customer_name, created_at}]},
     *   low_stock: {count, threshold, items: [{id, name, type, stock_qty}]}
     * }}
     */
    public static function alerts(PDO $pdo): void
    {
        Auth::requireAuth();

        /* Письма клиенту, которые не ушли (email_sent = 0 после создания заказа
         * или повторной попытки). Пять свежих — чтобы сразу видеть какие. */
        $emailCount = (int)$pdo->query(
            'SELECT COUNT(*) FROM orders WHERE email_sent = 0'
        )->fetchColumn();
        $latest = $pdo->query(
            'SELECT id, order_number, customer_name, created_at FROM orders
             WHERE email_sent = 0 ORDER BY id DESC LIMIT 5'
        )->fetchAll();
        foreach ($latest as &$row) {
            $row['customer_name'] = Crypto::decrypt($row['customer_name']);
        }
        unset($row);

        /* Порог «заканчивается» — настройка low_stock_threshold (default 5) */
        $threshold = self::DEFAULT_STOCK_THRESHOLD;
        $st = $pdo->prepare("SELECT value FROM settings WHERE key = 'low_stock_threshold'");
        $st->execute();
        if ($row = $st->fetch()) {
            $custom = (int)$row['value'];
            if ($custom >= 0 && $custom <= 1000) $threshold = $custom;
        }

        $lowStmt = $pdo->prepare(
            'SELECT id, name, type, stock_qty FROM products
             WHERE is_published = 1 AND stock_qty <= ?
             ORDER BY stock_qty ASC, id ASC LIMIT 8'
        );
        $lowStmt->execute([$threshold]);
        $lowItems = [];
        foreach ($lowStmt->fetchAll() as $r) {
            $lowItems[] = [
                'id' => (int)$r['id'],
                'name' => $r['name'],
                'type' => $r['type'],
                'stock_qty' => (int)$r['stock_qty'],
            ];
        }
        $lowCountStmt = $pdo->prepare(
            'SELECT COUNT(*) FROM products WHERE is_published = 1 AND stock_qty <= ?'
        );
        $lowCountStmt->execute([$threshold]);

        jsonResponse(['data' => [
            'emails_failed' => ['count' => $emailCount, 'latest' => $latest],
            'low_stock' => ['count' => (int)$lowCountStmt->fetchColumn(), 'threshold' => $threshold, 'items' => $lowItems],
        ]]);
    }
}
