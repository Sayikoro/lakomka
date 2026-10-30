<?php

require_once __DIR__ . '/../Auth.php';
require_once __DIR__ . '/../Paths.php';
require_once __DIR__ . '/../MediaOptimizer.php';

class AdminImagesController
{
    private const MAX_IMAGE = 32 * 1024 * 1024;   // 32 MB (на сервере всё равно сожмётся в WebP)
    private const MAX_VIDEO = 200 * 1024 * 1024;  // 200 MB
    private const IMG_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
    private const VID_MIME = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v'];

    /* ---------- helpers ---------- */
    private static function ensureProductDir(PDO $pdo, int $productId): string
    {
        $stmt = $pdo->prepare('SELECT slug FROM products WHERE id = ?');
        $stmt->execute([$productId]);
        $slug = $stmt->fetchColumn();
        if (!$slug) jsonResponse(['error' => 'Товар не найден'], 404);

        $safeSlug = preg_replace('/[^a-z0-9\-]/', '', strtolower($slug)) ?: "p$productId";
        // Пути к медиа — через Paths (работает и в dev, и в деплой-пакете)
        $dir = Paths::uploadsRoot() . '/products/' . $safeSlug;
        if (!is_dir($dir)) mkdir($dir, 0755, true);

        return $dir;
    }

    private static function nextSort(PDO $pdo, int $productId): int
    {
        $stmt = $pdo->prepare('SELECT COALESCE(MAX(sort_order), -1) FROM product_images WHERE product_id = ?');
        $stmt->execute([$productId]);
        return (int)$stmt->fetchColumn() + 1;
    }

    private static function deleteFile(string $url): void
    {
        if (str_starts_with($url, '/uploads/')) {
            $path = Paths::publicRoot() . $url;
            if (is_file($path)) @unlink($path);
        }
    }

    /* ============================================================
       ЗАГРУЗКА КАРТИНКИ
       POST /api/admin/products/{id}/media/image
       multipart: field `file`
       ============================================================ */
    public static function uploadImage(PDO $pdo, int $productId): void
    {
        Auth::requireAuth();
        $dir = self::ensureProductDir($pdo, $productId);

        if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
            jsonResponse(['error' => 'Файл не загружен'], 422);
        }
        $file = $_FILES['file'];
        if ($file['size'] > self::MAX_IMAGE) {
            jsonResponse(['error' => 'Картинка больше 8 MB'], 422);
        }
        $mime = mime_content_type($file['tmp_name']);
        if (!in_array($mime, self::IMG_MIME, true)) {
            jsonResponse(['error' => "Формат не поддерживается: $mime"], 422);
        }

        $ext = match ($mime) {
            'image/jpeg' => 'jpg',
            'image/png'  => 'png',
            'image/webp' => 'webp',
            'image/gif'  => 'gif',
            'image/avif' => 'avif',
            default      => 'bin',
        };
        $filename = time() . '-' . bin2hex(random_bytes(4)) . '.' . $ext;
        $dest = $dir . '/' . $filename;

        if (!move_uploaded_file($file['tmp_name'], $dest)) {
            jsonResponse(['error' => 'Не удалось сохранить файл'], 500);
        }

        /* ОПТИМИЗАТОР: картинка → WebP (сжатие + уменьшение до 2000px).
           При неудаче файл остаётся как есть — загрузка не падает. */
        $opt = MediaOptimizer::optimizeImageFile($dest);
        if ($opt['converted']) {
            $filename = $opt['name'];
            $dest = $dir . '/' . $filename;
        }

        $relDir = basename($dir);
        $url = '/uploads/products/' . $relDir . '/' . $filename;
        $sort = self::nextSort($pdo, $productId);

        $pdo->prepare(
            "INSERT INTO product_images (product_id, url, alt, media_type, sort_order)
             VALUES (?, ?, NULL, 'image', ?)"
        )->execute([$productId, $url, $sort]);

        jsonResponse([
            'data' => [
                'id'         => (int)$pdo->lastInsertId(),
                'type'       => 'image',
                'url'        => $url,
                'alt'        => null,
                'sort_order' => $sort,
                'optimized'  => $opt['note'],
            ],
        ], 201);
    }

    /* ============================================================
       ЗАГРУЗКА ВИДЕО-ФАЙЛА
       POST /api/admin/products/{id}/media/video-upload
       multipart: field `file`
       ============================================================ */
    public static function uploadVideoFile(PDO $pdo, int $productId): void
    {
        Auth::requireAuth();
        $dir = self::ensureProductDir($pdo, $productId);

        if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
            $code = $_FILES['file']['error'] ?? 'no file';
            jsonResponse(['error' => "Файл не загружен (code: $code). Возможно, превышен лимит PHP."], 422);
        }
        $file = $_FILES['file'];
        if ($file['size'] > self::MAX_VIDEO) {
            jsonResponse(['error' => 'Видео больше 200 MB. Для больших — YouTube/VK.'], 422);
        }
        $mime = mime_content_type($file['tmp_name']);
        if (!in_array($mime, self::VID_MIME, true)) {
            jsonResponse([
                'error' => "Формат не поддерживается: $mime. Можно mp4, webm, mov, m4v.",
            ], 422);
        }
        $ext = match ($mime) {
            'video/mp4'  => 'mp4',
            'video/webm' => 'webm',
            'video/x-m4v' => 'm4v',
            default      => 'mov', // video/quicktime
        };
        $filename = 'video-' . time() . '-' . bin2hex(random_bytes(3)) . '.' . $ext;
        $dest = $dir . '/' . $filename;

        if (!move_uploaded_file($file['tmp_name'], $dest)) {
            jsonResponse(['error' => 'Не удалось сохранить файл'], 500);
        }

        /* ОПТИМИЗАТОР: mov/m4v → mp4 (пересборка контейнера или H.264).
           Без ffmpeg на сервере файл остаётся как есть. */
        $opt = MediaOptimizer::optimizeVideoFile($dest);
        if ($opt['converted']) {
            $filename = $opt['name'];
            $dest = $dir . '/' . $filename;
        }

        $relDir = basename($dir);
        $url = '/uploads/products/' . $relDir . '/' . $filename;
        $sort = self::nextSort($pdo, $productId);

        $pdo->prepare(
            "INSERT INTO product_images (product_id, url, alt, media_type, sort_order)
             VALUES (?, ?, NULL, 'video', ?)"
        )->execute([$productId, $url, $sort]);

        jsonResponse([
            'data' => [
                'id'         => (int)$pdo->lastInsertId(),
                'type'       => 'video',
                'url'        => $url,
                'alt'        => null,
                'sort_order' => $sort,
                'optimized'  => $opt['note'],
            ],
        ], 201);
    }

    /* ============================================================
       ДОБАВИТЬ ВИДЕО ПО ССЫЛКЕ (YouTube/VK/RuTube/прямой URL)
       POST /api/admin/products/{id}/media/video-url
       body: { url: "https://..." }
       ============================================================ */
    public static function addVideoUrl(PDO $pdo, int $productId): void
    {
        Auth::requireAuth();

        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true) ?? [];
        $url = trim((string)($data['url'] ?? ''));

        if ($url === '') {
            jsonResponse(['error' => 'Укажите URL'], 422);
        }
        if (!preg_match('#^https?://#i', $url)) {
            jsonResponse(['error' => 'URL должен начинаться с http:// или https://'], 422);
        }

        $stmt = $pdo->prepare('SELECT id FROM products WHERE id = ?');
        $stmt->execute([$productId]);
        if (!$stmt->fetchColumn()) jsonResponse(['error' => 'Товар не найден'], 404);

        $sort = self::nextSort($pdo, $productId);

        $pdo->prepare(
            "INSERT INTO product_images (product_id, url, alt, media_type, sort_order)
             VALUES (?, ?, NULL, 'video', ?)"
        )->execute([$productId, $url, $sort]);

        jsonResponse([
            'data' => [
                'id'         => (int)$pdo->lastInsertId(),
                'type'       => 'video',
                'url'        => $url,
                'alt'        => null,
                'sort_order' => $sort,
            ],
        ], 201);
    }

    /* ============================================================
       ПРИВЯЗКА ГОТОВОГО ФАЙЛА ИЗ МЕДИА-ГАЛЕРЕИ
       POST /api/admin/products/{id}/media/attach
       body: { url: "/uploads/products/xxx/photo.jpg" }
       Файл уже лежит в public/uploads (выбран в медиа-галерее,
       раздел «media» файлового менеджера) — копирования не требуется,
       создаётся только запись в product_images. Тип определяется
       по расширению; дубли URL у одного товара запрещены.
       ============================================================ */
    public static function attach(PDO $pdo, int $productId): void
    {
        Auth::requireAuth();

        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true) ?? [];
        $url = trim((string)($data['url'] ?? ''));

        if ($url === '') jsonResponse(['error' => 'Укажите URL'], 422);

        // только локальные файлы из /uploads/. Формальных ограничений на
        // символы имён НЕТ: пользовательские папки могут называться как
        // угодно («видео (2026)», «Мои MOV» и т.п.) — раньше здесь был
        // regex по белому списку символов, который отвергал такие пути
        // («Допустимы только файлы из /uploads/»). Безопасность даёт
        // проверка ниже: realpath обязан лежать внутри uploads-корня,
        // а «..» отсекается до него. URL из галереи не кодируется —
        // пробелы и юникод приходят как есть (JSON).
        $rel = str_starts_with($url, '/uploads/') ? substr($url, strlen('/uploads/')) : null;
        if ($rel === null || $rel === '' || str_contains($rel, '..')) {
            jsonResponse(['error' => 'Допустимы только файлы из /uploads/'], 422);
        }

        $uploadsRoot = realpath(Paths::uploadsRoot());
        $realFile = $uploadsRoot === false ? false : realpath(Paths::publicRoot() . $url);
        if ($uploadsRoot === false || $realFile === false || !is_file($realFile)
            || !str_starts_with($realFile, $uploadsRoot . DIRECTORY_SEPARATOR)) {
            jsonResponse(['error' => 'Файл не найден в медиа-галерее'], 404);
        }

        $ext = strtolower(pathinfo($realFile, PATHINFO_EXTENSION));
        $type = in_array($ext, ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'], true) ? 'image'
              : (in_array($ext, ['mp4', 'webm', 'mov', 'm4v'], true) ? 'video' : null);
        if ($type === null) {
            jsonResponse(['error' => "Формат не поддерживается: .$ext"], 422);
        }

        /* ОПТИМИЗАТОР для attach: mov/m4v из медиа-галереи → mp4, тяжёлые
           jpg/png → webp. Только если файл ещё НИКУДА не привязан (иначе
           сменился бы URL у уже подключённых товаров). */
        $inUse = $pdo->prepare('SELECT COUNT(*) FROM product_images WHERE url = ?');
        $inUse->execute([$url]);
        $optNote = '';
        if ((int)$inUse->fetchColumn() === 0 && !str_contains($url, '..')) {
            if ($type === 'video' && in_array($ext, ['mov', 'm4v'], true)) {
                $opt = MediaOptimizer::optimizeVideoFile($realFile);
                if ($opt['converted']) {
                    $url = dirname($url) . '/' . $opt['name']; // имя могло смениться с суффиксом
                    $ext = 'mp4';
                    $optNote = $opt['note'];
                }
            } elseif ($type === 'image' && in_array($ext, ['jpg', 'jpeg', 'png'], true)) {
                $opt = MediaOptimizer::optimizeImageFile($realFile);
                if ($opt['converted']) {
                    $url = dirname($url) . '/' . $opt['name'];
                    $optNote = $opt['note'];
                }
            }
        }

        $stmt = $pdo->prepare('SELECT id FROM products WHERE id = ?');
        $stmt->execute([$productId]);
        if (!$stmt->fetchColumn()) jsonResponse(['error' => 'Товар не найден'], 404);

        $dup = $pdo->prepare('SELECT COUNT(*) FROM product_images WHERE product_id = ? AND url = ?');
        $dup->execute([$productId, $url]);
        if ((int)$dup->fetchColumn() > 0) {
            jsonResponse(['error' => 'Этот файл уже добавлен к товару'], 409);
        }

        $sort = self::nextSort($pdo, $productId);

        $pdo->prepare(
            "INSERT INTO product_images (product_id, url, alt, media_type, sort_order)
             VALUES (?, ?, NULL, ?, ?)"
        )->execute([$productId, $url, $type, $sort]);

        jsonResponse([
            'data' => [
                'id'         => (int)$pdo->lastInsertId(),
                'type'       => $type,
                'url'        => $url,
                'alt'        => null,
                'sort_order' => $sort,
                'optimized'  => $optNote,
            ],
        ], 201);
    }

    /* ============================================================
       УДАЛИТЬ ЛЮБОЙ МЕДИА-ЭЛЕМЕНТ
       DELETE /api/admin/products/{id}/media/{mediaId}
       ============================================================ */
    public static function removeMedia(PDO $pdo, int $productId, int $mediaId): void
    {
        Auth::requireAuth();

        $stmt = $pdo->prepare(
            'SELECT url FROM product_images WHERE id = ? AND product_id = ?'
        );
        $stmt->execute([$mediaId, $productId]);
        $url = $stmt->fetchColumn();
        if (!$url) jsonResponse(['error' => 'Медиа не найдено'], 404);

        // Файл может использоваться несколькими товарами (медиа-галерея
        // позволяет выбирать одни и те же файлы): удаляем с диска только
        // если это последний потребитель этого URL.
        $shared = $pdo->prepare('SELECT COUNT(*) FROM product_images WHERE url = ? AND id != ?');
        $shared->execute([$url, $mediaId]);
        if ((int)$shared->fetchColumn() === 0) {
            self::deleteFile($url);
        }
        $pdo->prepare('DELETE FROM product_images WHERE id = ?')->execute([$mediaId]);

        jsonResponse(['data' => ['ok' => true]]);
    }

    /* ============================================================
       СОРТИРОВКА (drag-n-drop)
       POST /api/admin/products/{id}/media/reorder
       body: { ids: [5, 2, 7, 1] }
       ============================================================ */
    public static function reorder(PDO $pdo, int $productId): void
    {
        Auth::requireAuth();

        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true) ?? [];
        $ids = $data['ids'] ?? [];
        if (!is_array($ids) || count($ids) === 0) {
            jsonResponse(['error' => 'Передайте массив ids'], 422);
        }

        $pdo->exec('BEGIN IMMEDIATE');
        try {
            $upd = $pdo->prepare(
                'UPDATE product_images SET sort_order = ? WHERE id = ? AND product_id = ?'
            );
            foreach (array_values($ids) as $i => $id) {
                $upd->execute([$i, (int)$id, $productId]);
            }
            $pdo->exec('COMMIT');
        } catch (Throwable $e) {
            $pdo->exec('ROLLBACK');
            jsonResponse(['error' => $e->getMessage()], 500);
        }

        jsonResponse(['data' => ['ok' => true]]);
    }
}