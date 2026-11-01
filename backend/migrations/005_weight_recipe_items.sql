-- Task 114: «Свои позиции» в рецептах — ингредиенты состава, которых нет
-- в справочнике товаров (упаковка, открытка, бант…). Хранятся отдельно
-- от weight_recipes (те привязаны к product_id), но живут в тех же
-- граммовках и показываются в одной таблице редактора рецептов.
CREATE TABLE IF NOT EXISTS weight_recipe_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    weight_g INTEGER NOT NULL,
    name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    sort_order INTEGER NOT NULL DEFAULT 100,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_weight_recipe_items_weight ON weight_recipe_items(weight_g);
