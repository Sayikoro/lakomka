-- ============================================================
--  Лакомка — каноническая схема БД (SQLite).
--  Используется: scripts/migrate.php (ручная миграция) и
--  src/Bootstrap.php (автосоздание при первом запуске на хостинге).
--  Идемпотентна: только CREATE ... IF NOT EXISTS.
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT,
    role TEXT NOT NULL DEFAULT 'viewer'
        CHECK (role IN ('super_admin', 'editor', 'viewer')),
    last_login_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    legacy_wc_id INTEGER UNIQUE,
    sku TEXT,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    manufacturer TEXT,
    type TEXT NOT NULL DEFAULT 'simple'
        CHECK (type IN ('simple', 'bundle', 'recipe')),
    price_kopecks INTEGER NOT NULL DEFAULT 0,
    old_price_kopecks INTEGER,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    packaging_material TEXT,
    video_url TEXT,
    legacy_slug TEXT,
    weight_g INTEGER,
    length_cm REAL,
    width_cm REAL,
    height_cm REAL,
    recipe_weight_g INTEGER,
    show_in_catalog INTEGER NOT NULL DEFAULT 1,
    is_published INTEGER NOT NULL DEFAULT 1,
    stock_qty INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS product_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    alt TEXT,
    media_type TEXT NOT NULL DEFAULT 'image'
        CHECK (media_type IN ('image', 'video')),
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS bundle_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    component_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1,
    UNIQUE(product_id, component_id)
);

CREATE TABLE IF NOT EXISTS weight_recipes (
    weight_g INTEGER NOT NULL,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    PRIMARY KEY (weight_g, product_id)
);

CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT UNIQUE NOT NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_phone_hash TEXT,
    customer_email TEXT,
    delivery_method TEXT NOT NULL
        CHECK (delivery_method IN ('pickup', 'city', 'region', 'tk')),
    address TEXT,
    comment TEXT,
    total_kopecks INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'new'
        CHECK (status IN ('new','confirmed','paid','shipped','done','cancelled')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    qty INTEGER NOT NULL,
    price_kopecks INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS order_status_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    comment TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);

CREATE TABLE IF NOT EXISTS login_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT NOT NULL,
    email TEXT NOT NULL,
    success INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_products_category   ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_catalog    ON products(show_in_catalog, is_published);
CREATE INDEX IF NOT EXISTS idx_products_legacy_slug ON products(legacy_slug);
CREATE INDEX IF NOT EXISTS idx_images_product      ON product_images(product_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_bundle_product      ON bundle_items(product_id);
CREATE INDEX IF NOT EXISTS idx_weight_recipes_weight ON weight_recipes(weight_g);
CREATE INDEX IF NOT EXISTS idx_orders_status       ON orders(status, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_phone_hash   ON orders(customer_phone_hash);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip   ON login_attempts(ip, created_at);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email, created_at);
