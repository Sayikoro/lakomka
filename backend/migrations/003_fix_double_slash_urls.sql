-- 003: чистка унаследованных битых ссылок с двойными слешами.
-- Источник: старые версии кода (до Task 58/85/87) и ручные правки могли
-- записать в базу URL вида «/uploads//файл.mov» или «/uploads/media//x/файл.mp4».
-- На проде это давало «не удалось перекодировать видео (…/uploads//файл.mov:
-- No such file or directory)». Новые записи чистые; этой миграцией лечим
-- уже записанные. LIKE '/uploads/%' отсекает внешние ссылки (https://…),
-- у которых «//» в схеме — их трогать нельзя. Тройные и длиннее схлопывает
-- повтор REPLACE: за один проход '/uploads///x' → '/uploads//x', поэтому
-- оператор продублирован. Идемпотентен: когда битых ссылок нет, все
-- UPDATE затрагивают 0 строк.
UPDATE product_images SET url = REPLACE(url, '//', '/')
WHERE url LIKE '/uploads/%' AND url LIKE '%//%';
UPDATE product_images SET url = REPLACE(url, '//', '/')
WHERE url LIKE '/uploads/%' AND url LIKE '%//%';
UPDATE product_images SET url = REPLACE(url, '//', '/')
WHERE url LIKE '/uploads/%' AND url LIKE '%//%';
UPDATE products SET video_url = REPLACE(video_url, '//', '/')
WHERE video_url LIKE '/uploads/%' AND video_url LIKE '%//%';
UPDATE products SET video_url = REPLACE(video_url, '//', '/')
WHERE video_url LIKE '/uploads/%' AND video_url LIKE '%//%';
UPDATE products SET video_url = REPLACE(video_url, '//', '/')
WHERE video_url LIKE '/uploads/%' AND video_url LIKE '%//%';
