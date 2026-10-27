<?php

require_once __DIR__ . '/../Auth.php';

class AdminImagesController
{
    private const MAX_IMAGE = 8 * 1024 * 1024;   // 8 MB
    private const MAX_VIDEO = 50 * 1024 * 1024;  // 50 MB
    private const IMG_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    private const VID_MIME = ['video/mp4', 'video/webm'];

    /* ---------- helpers ---------- */
    private static function ensureProductDir(PDO $pdo, int $productId): string
    {
        $stmt = $pdo->prepare('SELECT slug FROM products WHERE id = ?');
        $stmt->execute([$productId]);
        $slug = $stmt->fetchColumn();
        if (!$slug) jsonResponse(['error' => 'Товар не найден'], 404);

        $safeSlug = preg_replace('/[^a-z0-9\-]/', '', strtolower($slug)) ?: "p$productId";
        // Правильный путь — в корень Next.js (три уровня вверх от src/Controllers/)
        $dir = __DIR__ . '/../../../public/uploads/products/' . $safeSlug;
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
            $path = __DIR__ . '/../../../public' . $url;
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
            default      => 'bin',
        };
        $filename = time() . '-' . bin2hex(random_bytes(4)) . '.' . $ext;
        $dest = $dir . '/' . $filename;

        if (!move_uploaded_file($file['tmp_name'], $dest)) {
            jsonResponse(['error' => 'Не удалось сохранить файл'], 500);
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
            jsonResponse(['error' => 'Видео больше 50 MB. Для больших — YouTube/VK.'], 422);
        }
        $mime = mime_content_type($file['tmp_name']);
        if (!in_array($mime, self::VID_MIME, true)) {
            jsonResponse([
                'error' => "Формат не поддерживается: $mime. Только .mp4 или .webm (H.264).",
            ], 422);
        }
        $ext = $mime === 'video/mp4' ? 'mp4' : 'webm';
        $filename = 'video-' . time() . '-' . bin2hex(random_bytes(3)) . '.' . $ext;
        $dest = $dir . '/' . $filename;

        if (!move_uploaded_file($file['tmp_name'], $dest)) {
            jsonResponse(['error' => 'Не удалось сохранить файл'], 500);
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

        self::deleteFile($url);
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