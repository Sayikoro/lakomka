-- Task 152: SEO-поля товара и отзыв токенов («выйти на всех устройствах»).
-- Файл выполняется один раз (schema_migrations), как 001-007.

-- SEO для витрины: generateMetadata использует meta_title/meta_description,
-- при NULL — fallback на name/description (поведение по умолчанию не меняется).
ALTER TABLE products ADD COLUMN meta_title TEXT;
ALTER TABLE products ADD COLUMN meta_description TEXT;

-- Счётчик отзыва токенов: инкремент = мгновенная инвалидация всех ранее
-- выданных JWT этого пользователя (payload.tv сверяется с БД в requireAuth).
ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;
