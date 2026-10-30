-- 001: индекс по product_images.url
-- Зачем: проверка «файл уже привязан» (attach) и «файл используют другие
-- товары» (удаление медиа) каждый раз ищут по url — на выросшей базе
-- без индекса это полный перебор таблицы.
CREATE INDEX IF NOT EXISTS idx_product_images_url ON product_images(url);
