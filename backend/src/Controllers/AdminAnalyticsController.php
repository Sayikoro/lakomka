<?php

require_once __DIR__ . '/../Auth.php';
require_once __DIR__ . '/../AdminLog.php';
require_once __DIR__ . '/../VisitGuard.php';

/**
 * Task 133: аналитика посещений в админке (вкладка «Аналитика»).
 *
 * Читает visit_sessions / visit_events / bot_hits, которые наполняет
 * VisitGuard (сбор с витрины + щит публичных API). Просмотр — всем
 * авторизованным ролям; блокировка IP и очистка — операции изменения
 * (редактор и супер-админ; очистка — только супер-админ).
 */
class AdminAnalyticsController
{
    /** Разрешённые окна периода (сутки). */
    private const DAYS = [1, 3, 7, 30];

    /* ============================ СВОДКА ============================ */

    /** GET /api/admin/analytics/summary?days=7 */
    public static function summary(PDO $pdo): void
    {
        Auth::requireAuth();
        $days = self::daysParam();
        $cutoff = date('c', time() - $days * 86400);
        $today = date('c', strtotime('today'));

        /* Сессии и события за период */
        $s = $pdo->prepare(
            "SELECT COUNT(*) total,
                    SUM(CASE WHEN is_bot = 0 THEN 1 ELSE 0 END) humans,
                    SUM(CASE WHEN is_bot = 1 THEN 1 ELSE 0 END) bots,
                    SUM(views) views
             FROM visit_sessions WHERE first_seen >= ?"
        );
        $s->execute([$cutoff]);
        $sess = $s->fetch() ?: [];

        $e = $pdo->prepare(
            "SELECT COUNT(*) events,
                    SUM(CASE WHEN type = 'pageview' THEN 1 ELSE 0 END) pageviews,
                    SUM(CASE WHEN type = 'click' THEN 1 ELSE 0 END) clicks,
                    SUM(CASE WHEN type = 'gift_view' THEN 1 ELSE 0 END) gift_views,
                    SUM(CASE WHEN type = 'cart_add' THEN 1 ELSE 0 END) cart_adds
             FROM visit_events WHERE created_at >= ?"
        );
        $e->execute([$cutoff]);
        $ev = $e->fetch() ?: [];

        $s2 = $pdo->prepare(
            "SELECT COUNT(*) sessions, SUM(views) views FROM visit_sessions WHERE first_seen >= ?"
        );
        $s2->execute([$today]);
        $todayRow = $s2->fetch() ?: [];

        $e2 = $pdo->prepare(
            "SELECT COUNT(*) events FROM visit_events WHERE created_at >= ?"
        );
        $e2->execute([$today]);

        $blocked = (int)$pdo->query('SELECT COUNT(*) FROM ip_blocks')->fetchColumn();

        /* Task 134: люди с высоким баллом «похожести на бота» (30…59) —
           например ИИ-агент, замазавший webdriver. Владелец видит их
           с бейджем «Подозрение» и может разобрать таймлайн. */
        try {
            $sp = $pdo->prepare(
                "SELECT COUNT(*) FROM visit_sessions
                 WHERE first_seen >= ? AND is_bot = 0 AND bot_score >= ?"
            );
            $sp->execute([$cutoff, VisitGuard::SUSPICION_THRESHOLD]);
            $suspected = (int)$sp->fetchColumn();
        } catch (Throwable $err) {
            error_log('[analytics suspected] ' . $err->getMessage());
            $suspected = 0;
        }

        jsonResponse(['data' => [
            'days' => $days,
            'period' => [
                'sessions' => (int)($sess['total'] ?? 0),
                'humans' => (int)($sess['humans'] ?? 0),
                'bots' => (int)($sess['bots'] ?? 0),
                'suspected' => $suspected,
                'views' => (int)($sess['views'] ?? 0),
                'events' => (int)($ev['events'] ?? 0),
                'pageviews' => (int)($ev['pageviews'] ?? 0),
                'clicks' => (int)($ev['clicks'] ?? 0),
                'gift_views' => (int)($ev['gift_views'] ?? 0),
                'cart_adds' => (int)($ev['cart_adds'] ?? 0),
            ],
            'today' => [
                'sessions' => (int)($todayRow['sessions'] ?? 0),
                'views' => (int)($todayRow['views'] ?? 0),
                'events' => (int)$e2->fetchColumn(),
            ],
            'blocked_ips' => $blocked,
            'gifts' => self::topGifts($pdo, $cutoff),
            'pages' => self::topPages($pdo, $cutoff),
            'sources' => self::sources($pdo, $cutoff),
        ]]);
    }

    /* ========================== ПОДАРКИ ============================= */

    /** Популярность подарков: просмотры карточки, уникальные сессии, «в корзину». */
    private static function topGifts(PDO $pdo, string $cutoff): array
    {
        $views = [];
        try {
            $stmt = $pdo->prepare(
                "SELECT gift_slug slug, MAX(gift_name) name,
                        SUM(CASE WHEN type = 'gift_view' THEN 1 ELSE 0 END) views,
                        SUM(CASE WHEN type = 'cart_add' THEN 1 ELSE 0 END) cart_adds,
                        COUNT(DISTINCT CASE WHEN type = 'gift_view' THEN session_id END) sessions
                 FROM visit_events
                 WHERE gift_slug != '' AND created_at >= ?
                 GROUP BY gift_slug ORDER BY views DESC LIMIT 20"
            );
            $stmt->execute([$cutoff]);
            $views = $stmt->fetchAll() ?: [];
        } catch (Throwable $err) {
            error_log('[analytics gifts] ' . $err->getMessage());
        }
        if ($views === []) {
            return [];
        }

        /* Обложка и цена: из товаров по slug (одним запросом). */
        $slugs = array_map(static fn ($r) => (string)$r['slug'], $views);
        $ph = implode(',', array_fill(0, count($slugs), '?'));
        $prodStmt = $pdo->prepare(
            "SELECT id, slug, price_kopecks FROM products WHERE slug IN ($ph) AND deleted_at IS NULL"
        );
        $prodStmt->execute($slugs);
        $prodBySlug = [];
        foreach ($prodStmt->fetchAll() as $p) {
            $prodBySlug[$p['slug']] = $p;
        }
        $coverStmt = $pdo->prepare(
            "SELECT product_id, url FROM product_images
             WHERE media_type = 'image' AND product_id IN (
                 SELECT id FROM products WHERE slug IN ($ph)
             )
             ORDER BY product_id, sort_order, id"
        );
        $coverStmt->execute($slugs);
        $coverByPid = [];
        foreach ($coverStmt->fetchAll() as $img) {
            $pid = (int)$img['product_id'];
            if (!isset($coverByPid[$pid])) {
                $coverByPid[$pid] = $img['url'];
            }
        }

        $out = [];
        foreach ($views as $r) {
            $slug = (string)$r['slug'];
            $p = $prodBySlug[$slug] ?? null;
            $out[] = [
                'slug' => $slug,
                'name' => $p['name'] ?? (string)$r['name'] ?: $slug,
                'views' => (int)$r['views'],
                'cart_adds' => (int)$r['cart_adds'],
                'sessions' => (int)$r['sessions'],
                'price_kopecks' => $p !== null ? (int)$p['price_kopecks'] : null,
                'cover' => $p !== null ? ($coverByPid[(int)$p['id']] ?? null) : null,
            ];
        }
        return $out;
    }

    /* ========================== СТРАНИЦЫ ============================ */

    /** Страницы: просмотры, средний доскролл, среднее время. */
    private static function topPages(PDO $pdo, string $cutoff): array
    {
        $map = [];
        try {
            $stmt = $pdo->prepare(
                "SELECT path, COUNT(*) v FROM visit_events
                 WHERE type = 'pageview' AND created_at >= ?
                 GROUP BY path ORDER BY v DESC LIMIT 15"
            );
            $stmt->execute([$cutoff]);
            foreach ($stmt->fetchAll() as $r) {
                $map[$r['path']] = ['path' => $r['path'], 'views' => (int)$r['v'], 'scroll' => null, 'time' => null];
            }
        } catch (Throwable $err) {
            error_log('[analytics pages] ' . $err->getMessage());
        }
        if ($map === []) {
            return [];
        }

        /* Доскролл (meta.pct) и время (meta.sec) — через json_extract.
           Если в сборке SQLite нет JSON1 — колонки останутся null, сводка жива. */
        try {
            $stmt = $pdo->prepare(
                "SELECT path, ROUND(AVG(CAST(json_extract(meta, '$.pct') AS REAL))) s
                 FROM visit_events WHERE type = 'scroll' AND created_at >= ? GROUP BY path"
            );
            $stmt->execute([$cutoff]);
            foreach ($stmt->fetchAll() as $r) {
                if (isset($map[$r['path']])) {
                    $map[$r['path']]['scroll'] = $r['s'] !== null ? (int)$r['s'] : null;
                }
            }
            $stmt = $pdo->prepare(
                "SELECT path, ROUND(AVG(CAST(json_extract(meta, '$.sec') AS REAL))) t
                 FROM visit_events WHERE type = 'leave' AND created_at >= ? GROUP BY path"
            );
            $stmt->execute([$cutoff]);
            foreach ($stmt->fetchAll() as $r) {
                if (isset($map[$r['path']])) {
                    $map[$r['path']]['time'] = $r['t'] !== null ? (int)$r['t'] : null;
                }
            }
        } catch (Throwable $err) {
            error_log('[analytics json1] ' . $err->getMessage());
        }

        $out = array_values($map);
        usort($out, static fn ($a, $b) => $b['views'] <=> $a['views']);
        return $out;
    }

    /** Откуда приходят: группировка referrer по домену (в PHP). */
    private static function sources(PDO $pdo, string $cutoff): array
    {
        $stmt = $pdo->prepare(
            "SELECT referrer, COUNT(*) c FROM visit_sessions
             WHERE first_seen >= ? GROUP BY referrer ORDER BY c DESC LIMIT 200"
        );
        $stmt->execute([$cutoff]);

        $hosts = [];
        foreach ($stmt->fetchAll() as $r) {
            $ref = trim((string)$r['referrer']);
            $host = $ref === '' ? '' : ((string)(parse_url($ref, PHP_URL_HOST) ?? ''));
            if ($host === '') {
                $host = $ref === '' ? '' : mb_substr($ref, 0, 60);
            }
            if ($host === '') {
                $host = 'Прямые заходы';
            }
            $hosts[$host] = ($hosts[$host] ?? 0) + (int)$r['c'];
        }
        arsort($hosts);

        $out = [];
        foreach (array_slice($hosts, 0, 10, true) as $host => $c) {
            $out[] = ['source' => $host, 'sessions' => $c];
        }
        return $out;
    }

    /* ========================== СЕССИИ ============================== */

    /** GET /api/admin/analytics/sessions?days=7&bot=all|bot|human|blocked&limit=60 */
    public static function sessions(PDO $pdo): void
    {
        Auth::requireAuth();
        $days = self::daysParam();
        $cutoff = date('c', time() - $days * 86400);
        $bot = (string)($_GET['bot'] ?? 'all');
        $limit = (int)($_GET['limit'] ?? 60);
        if ($limit < 1 || $limit > 200) {
            $limit = 60;
        }

        $where = ['last_seen >= ?'];
        $params = [$cutoff];
        if ($bot === 'bot') {
            $where[] = 'is_bot = 1';
        } elseif ($bot === 'human') {
            $where[] = 'is_bot = 0';
        } elseif ($bot === 'blocked') {
            $where[] = 'blocked = 1';
        }

        $stmt = $pdo->prepare(
            "SELECT id, sid, ip_hash, ip_mask, user_agent, is_bot, bot_reason, blocked,
                    referrer, landing, screen, views, events, first_seen, last_seen,
                    bot_score, webdriver, mouse_moves, touches, key_downs, no_input,
                    accept_lang, fp
             FROM visit_sessions WHERE " . implode(' AND ', $where) . '
             ORDER BY last_seen DESC LIMIT ' . $limit
        );
        $stmt->execute($params);

        jsonResponse(['data' => ['items' => $stmt->fetchAll() ?: []]]);
    }

    /** GET /api/admin/analytics/sessions/{id}/events?limit=300 — таймлайн визита. */
    public static function sessionEvents(PDO $pdo, int $id): void
    {
        Auth::requireAuth();
        $limit = (int)($_GET['limit'] ?? 300);
        if ($limit < 1 || $limit > 500) {
            $limit = 300;
        }

        $stmt = $pdo->prepare(
            "SELECT type, path, gift_slug, gift_name, meta, created_at
             FROM visit_events WHERE session_id = ? ORDER BY id ASC LIMIT $limit"
        );
        $stmt->execute([$id]);
        $items = [];
        foreach ($stmt->fetchAll() ?: [] as $r) {
            $meta = json_decode((string)$r['meta'], true);
            $r['meta'] = is_array($meta) ? $meta : [];
            $items[] = $r;
        }

        $s = $pdo->prepare('SELECT id, sid, ip_hash, ip_mask, user_agent, is_bot, bot_reason, blocked, referrer, landing, screen, views, events, first_seen, last_seen, bot_score, webdriver, mouse_moves, touches, key_downs, no_input, accept_lang, fp FROM visit_sessions WHERE id = ?');
        $s->execute([$id]);
        $session = $s->fetch();

        jsonResponse(['data' => ['session' => $session ?: null, 'items' => $items]]);
    }

    /* ============================ БОТЫ ============================== */

    /** GET /api/admin/analytics/bots?days=7 — краулеры на публичных API. */
    public static function bots(PDO $pdo): void
    {
        Auth::requireAuth();
        $days = self::daysParam();
        $cutoff = date('c', time() - $days * 86400);

        /* Группируем по ip_hash (а не по маске): маска обобщает соседние
           адреса, а блокировка должна работать по точному хешу. */
        $stmt = $pdo->prepare(
            "SELECT ua, ip_hash, MAX(ip_mask) ip_mask, SUM(hits) hits, MAX(last_seen) last_seen,
                    COUNT(DISTINCT path) paths
             FROM bot_hits WHERE last_seen >= ?
             GROUP BY ua, ip_hash ORDER BY hits DESC LIMIT 60"
        );
        $stmt->execute([$cutoff]);

        jsonResponse(['data' => ['items' => $stmt->fetchAll() ?: []]]);
    }

    /* ====================== БЛОКИРОВКА IP =========================== */

    /** POST /api/admin/analytics/block {ip_hash, reason?} — редактор+. */
    public static function block(PDO $pdo): void
    {
        $payload = Auth::requireEditor();
        $body = self::jsonBody();

        $ipHash = (string)($body['ip_hash'] ?? '');
        if (!preg_match('/^[a-f0-9]{64}$/', $ipHash)) {
            jsonResponse(['error' => 'Некорректный ip_hash'], 422);
        }
        $reason = self::str($body['reason'] ?? '', 200);

        $pdo->prepare(
            'INSERT INTO ip_blocks (ip_hash, ip_mask, reason, created_at) VALUES (?, ?, ?, ?)
             ON CONFLICT(ip_hash) DO NOTHING'
        )->execute([$ipHash, self::str($body['ip_mask'] ?? '', 64), $reason, date('c')]);

        /* Пометить существующие сессии этого IP */
        $pdo->prepare('UPDATE visit_sessions SET blocked = 1 WHERE ip_hash = ?')
            ->execute([$ipHash]);

        AdminLog::add($pdo, AdminLog::actor($payload), 'analytics.block', 'IP ' . self::str($body['ip_mask'] ?? '', 32) . ' ' . $reason);
        jsonResponse(['ok' => true]);
    }

    /** POST /api/admin/analytics/unblock {ip_hash} — редактор+. */
    public static function unblock(PDO $pdo): void
    {
        $payload = Auth::requireEditor();
        $body = self::jsonBody();

        $ipHash = (string)($body['ip_hash'] ?? '');
        if (!preg_match('/^[a-f0-9]{64}$/', $ipHash)) {
            jsonResponse(['error' => 'Некорректный ip_hash'], 422);
        }

        $pdo->prepare('DELETE FROM ip_blocks WHERE ip_hash = ?')->execute([$ipHash]);
        $pdo->prepare('UPDATE visit_sessions SET blocked = 0 WHERE ip_hash = ?')
            ->execute([$ipHash]);

        AdminLog::add($pdo, AdminLog::actor($payload), 'analytics.unblock', 'hash ' . substr($ipHash, 0, 12) . '…');
        jsonResponse(['ok' => true]);
    }

    /** GET /api/admin/analytics/blocks — текущий блок-лист. */
    public static function blocks(PDO $pdo): void
    {
        Auth::requireAuth();
        $rows = $pdo->query(
            'SELECT ip_hash, ip_mask, reason, created_at FROM ip_blocks ORDER BY created_at DESC LIMIT 200'
        )->fetchAll() ?: [];
        jsonResponse(['data' => ['items' => $rows]]);
    }

    /* ========================== ОЧИСТКА ============================= */

    /** POST /api/admin/analytics/wipe — удалить всю аналитику (super_admin). */
    public static function wipe(PDO $pdo): void
    {
        $payload = Auth::requireSuperAdmin();

        $events = (int)$pdo->query('SELECT COUNT(*) FROM visit_events')->fetchColumn();
        $sessions = (int)$pdo->query('SELECT COUNT(*) FROM visit_sessions')->fetchColumn();
        $bots = (int)$pdo->query('SELECT COUNT(*) FROM bot_hits')->fetchColumn();

        $pdo->beginTransaction();
        $pdo->exec('DELETE FROM visit_events');
        $pdo->exec('DELETE FROM visit_sessions');
        $pdo->exec('DELETE FROM bot_hits');
        $pdo->commit();

        AdminLog::add(
            $pdo,
            AdminLog::actor($payload),
            'analytics.wipe',
            "события: $events, сессии: $sessions, боты: $bots"
        );
        jsonResponse(['ok' => true, 'removed' => ['events' => $events, 'sessions' => $sessions, 'bot_hits' => $bots]]);
    }

    /* ========================= ХЕЛПЕРЫ ============================== */

    private static function daysParam(): int
    {
        $days = (int)($_GET['days'] ?? 7);
        return in_array($days, self::DAYS, true) ? $days : 7;
    }

    private static function jsonBody(): array
    {
        $raw = (string)(file_get_contents('php://input') ?: '');
        $body = json_decode($raw, true);
        return is_array($body) ? $body : [];
    }

    private static function str(mixed $v, int $max): string
    {
        if (!is_string($v)) {
            return '';
        }
        return mb_substr(trim($v), 0, $max);
    }
}
