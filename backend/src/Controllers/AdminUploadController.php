<?php

require_once __DIR__ . '/../Auth.php';
require_once __DIR__ . '/../ChunkedUpload.php';

class AdminUploadController
{
    public static function chunk(): void
    {
        Auth::requireEditor();

        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true);
        if (!is_array($data)) jsonResponse(['error' => 'Invalid JSON'], 400);

        try {
            $result = ChunkedUpload::receiveChunk(
                (string)($data['upload_id'] ?? ''),
                (int)($data['chunk_index'] ?? -1),
                (int)($data['total_chunks'] ?? 0),
                (string)($data['filename'] ?? 'upload.zip'),
                (string)($data['chunk_base64'] ?? '')
            );
        } catch (InvalidArgumentException $e) {
            jsonResponse(['error' => $e->getMessage()], 422);
        } catch (RuntimeException $e) {
            jsonResponse(['error' => $e->getMessage()], 500);
        }

        jsonResponse(['data' => $result]);
    }

    /* ============================================================
       ЗАГРУЗКА КАРТИНКИ ДЛЯ HERO (витрина)
       POST /api/admin/uploads/hero   multipart: field `file`
       Файлы складываются в public/uploads/hero (корень Next.js)
       ============================================================ */
    public static function saveHeroImage(): void
    {
        Auth::requireAuth();

        $dir = __DIR__ . '/../../../public/uploads/hero';
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
            jsonResponse(['error' => 'Файл не загружен'], 422);
        }
        $file = $_FILES['file'];
        if ($file['size'] > 8 * 1024 * 1024) {
            jsonResponse(['error' => 'Картинка больше 8 MB'], 422);
        }
        $mime = mime_content_type($file['tmp_name']);
        if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true)) {
            jsonResponse(['error' => "Формат не поддерживается: $mime (нужен JPG/PNG/WebP)"], 422);
        }

        $ext = match ($mime) {
            'image/jpeg' => 'jpg',
            'image/png'  => 'png',
            'image/webp' => 'webp',
            default      => 'bin',
        };
        $filename = time() . '-' . bin2hex(random_bytes(4)) . '.' . $ext;
        $dest = $dir . '/' . $filename;

        if (!move_uploaded_file($file['tmp_name'], $dest)) {
            jsonResponse(['error' => 'Не удалось сохранить файл'], 500);
        }

        jsonResponse(['data' => ['url' => '/uploads/hero/' . $filename]]);
    }

    /* ============================================================
       ЗАГРУЗКА SVG-СНЕЖИНКИ (снегопад на витрине)
       POST /api/admin/uploads/snowflake   multipart: field `file`
       Файлы складываются в public/uploads/snowflake
       ============================================================ */
    public static function saveSnowflakeSvg(): void
    {
        Auth::requireAuth();

        $dir = __DIR__ . '/../../../public/uploads/snowflake';
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
            jsonResponse(['error' => 'Файл не загружен'], 422);
        }
        $file = $_FILES['file'];
        if ($file['size'] > 1024 * 1024) {
            jsonResponse(['error' => 'SVG больше 1 MB'], 422);
        }
        $name = (string)$file['name'];
        $mime = mime_content_type($file['tmp_name']);
        $content = (string)file_get_contents($file['tmp_name']);
        $isSvg = str_ends_with(strtolower($name), '.svg')
            || $mime === 'image/svg+xml'
            || $mime === 'text/plain'
            || $mime === 'text/xml';
        if (!$isSvg || stripos($content, '<svg') === false) {
            jsonResponse(['error' => 'Нужен файл SVG со снежинкой (<svg>…)'], 422);
        }

        /* Лёгкая санитизация: вырезаем script и обработчики событий */
        $content = preg_replace('#<script[\s\S]*?</script>#i', '', $content) ?? $content;
        $content = preg_replace('/\son\w+\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)/i', '', $content) ?? $content;

        $filename = 'flake-' . time() . '-' . bin2hex(random_bytes(4)) . '.svg';
        $dest = $dir . '/' . $filename;

        if (!@file_put_contents($dest, $content)) {
            jsonResponse(['error' => 'Не удалось сохранить файл'], 500);
        }

        jsonResponse(['data' => ['url' => '/uploads/snowflake/' . $filename]]);
    }
}
