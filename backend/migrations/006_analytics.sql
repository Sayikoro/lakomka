-- Task 133: собственная аналитика посещений + защита от автоматизированных систем.
-- Все таблицы идемпотентны (IF NOT EXISTS).

-- Сессии посетителей витрины. Уникальность по паре (sid, ip_hash):
-- подделанный/переиспользованный sid с чужого IP создаёт отдельную сессию,
-- а не загрязняет чужую.
CREATE TABLE IF NOT EXISTS visit_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sid TEXT NOT NULL,
    ip_hash TEXT NOT NULL DEFAULT '',
    ip_mask TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT '',
    is_bot INTEGER NOT NULL DEFAULT 0,
    bot_reason TEXT NOT NULL DEFAULT '',
    blocked INTEGER NOT NULL DEFAULT 0,
    referrer TEXT NOT NULL DEFAULT '',
    landing TEXT NOT NULL DEFAULT '',
    screen TEXT NOT NULL DEFAULT '',
    views INTEGER NOT NULL DEFAULT 0,
    events INTEGER NOT NULL DEFAULT 0,
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL,
    UNIQUE (sid, ip_hash)
);
CREATE INDEX IF NOT EXISTS idx_vs_last_seen ON visit_sessions (last_seen);
CREATE INDEX IF NOT EXISTS idx_vs_is_bot ON visit_sessions (is_bot);
CREATE INDEX IF NOT EXISTS idx_vs_blocked ON visit_sessions (blocked);

-- События: pageview | click | scroll | gift_view | cart_add | leave.
-- meta — небольшой JSON ({pct}, {sec}, {tag,text,href}).
CREATE TABLE IF NOT EXISTS visit_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    path TEXT NOT NULL DEFAULT '',
    gift_id INTEGER,
    gift_slug TEXT NOT NULL DEFAULT '',
    gift_name TEXT NOT NULL DEFAULT '',
    meta TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ve_session ON visit_events (session_id);
CREATE INDEX IF NOT EXISTS idx_ve_created ON visit_events (created_at);
CREATE INDEX IF NOT EXISTS idx_ve_gift ON visit_events (gift_slug);

-- Блок-лист IP (хеш IP + соль из конфига): заполняется владельцем из админки.
CREATE TABLE IF NOT EXISTS ip_blocks (
    ip_hash TEXT PRIMARY KEY,
    ip_mask TEXT NOT NULL DEFAULT '',
    reason TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);

-- Боты и краулеры на публичных API: агрегат по (IP, UA, маршрут).
CREATE TABLE IF NOT EXISTS bot_hits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip_hash TEXT NOT NULL,
    ip_mask TEXT NOT NULL DEFAULT '',
    ua TEXT NOT NULL DEFAULT '',
    path TEXT NOT NULL DEFAULT '',
    hits INTEGER NOT NULL DEFAULT 1,
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL,
    UNIQUE (ip_hash, ua, path)
);
CREATE INDEX IF NOT EXISTS idx_bh_last_seen ON bot_hits (last_seen);

-- Счётчики rate-limit (окно хранится в updated_at: просроченный бакет
-- обнуляется при следующем попадании).
CREATE TABLE IF NOT EXISTS rate_limits (
    bucket TEXT PRIMARY KEY,
    hits INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rl_updated ON rate_limits (updated_at);
