-- Task 141: SEO для категорий — мета-теги и текст на странице категории.
-- meta_title/meta_description — для <title>/<meta name=description> страницы
-- /catalog/<slug> (title/description; пусто — автогенерация из названия).
-- seo_text — видимый текст над сеткой товаров (пусто — блока нет).
-- Файл выполняется один раз (schema_migrations), колонки не трогаем, если уже есть.

ALTER TABLE categories ADD COLUMN meta_title TEXT NOT NULL DEFAULT '';
ALTER TABLE categories ADD COLUMN meta_description TEXT NOT NULL DEFAULT '';
ALTER TABLE categories ADD COLUMN seo_text TEXT NOT NULL DEFAULT '';
