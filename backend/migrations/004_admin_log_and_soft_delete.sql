-- Task 97-106: журнал действий админов + мягкое удаление товаров (корзина).
-- admin_log — кто/когда/что делал (аудит ключевых операций админки).
-- products.deleted_at — мягкое удаление: NULL = товар живой; непустая дата =
-- лежит в «Корзине» админки (витрина и списки его не показывают).
-- Пишется 004: пакет миграций Task 97-106. Перед применением DbMigrations
-- автоматически снимает дамп базы.

CREATE TABLE IF NOT EXISTS admin_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    actor TEXT NOT NULL DEFAULT '',
    action TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT ''
);

ALTER TABLE products ADD COLUMN deleted_at TEXT;

CREATE INDEX IF NOT EXISTS idx_products_deleted ON products(deleted_at);
CREATE INDEX IF NOT EXISTS idx_admin_log_created ON admin_log(created_at);
