<?php

class ChunkedUpload
{
    /* Task 56: было 200 MB — блоб-экспорт старого каталога (335 МБ) не проходил
       («Превышен лимит 200 MB» в админке). Клиент (chunked-upload.ts) ограничен
       1000 чанков × 512 КБ = 500 МБ — серверный лимит держим с запасом над ним. */
    private const MAX_TOTAL = 512 * 1024 * 1024; // 512 MB
    private const MAX_AGE_HOURS = 24;

    private static function root(): string
    {
        $dir = __DIR__ . '/../storage/chunked-uploads';
        if (!is_dir($dir)) mkdir($dir, 0755, true);
        return $dir;
    }

    /** Убираем старые файлы (старше 24 часов) */
    public static function cleanupOld(): void
    {
        $root = self::root();
        $threshold = time() - self::MAX_AGE_HOURS * 3600;

        foreach (glob($root . '/*.zip') as $f) {
            if (is_file($f) && filemtime($f) < $threshold) @unlink($f);
        }
        foreach (glob($root . '/*', GLOB_ONLYDIR) as $d) {
            if (is_dir($d) && filemtime($d) < $threshold) {
                foreach (glob($d . '/*') as $sub) @unlink($sub);
                @rmdir($d);
            }
        }
    }

    /**
     * Принимает один чанк.
     * Возвращает ['done' => bool, 'file_name' => ?string, 'size' => ?int, 'received' => int, 'total' => int]
     */
    public static function receiveChunk(
        string $uploadId,
        int $chunkIndex,
        int $totalChunks,
        string $filename,
        string $chunkBase64
    ): array {
        $uploadId = preg_replace('/[^a-z0-9\-]/', '', strtolower($uploadId));
        if (strlen($uploadId) < 8) {
            throw new InvalidArgumentException('Некорректный upload_id');
        }
        if ($chunkIndex < 0 || $totalChunks <= 0 || $chunkIndex >= $totalChunks) {
            throw new InvalidArgumentException('Некорректный chunk_index');
        }
        if ($totalChunks > 1000) {
            throw new InvalidArgumentException('Слишком много чанков');
        }

        $root = self::root();
self::cleanupOld();

$dir = $root . '/' . $uploadId;
if (!is_dir($dir)) mkdir($dir, 0755, true);

        // Метаданные
        $metaPath = $dir . '/meta.json';
        if (!is_file($metaPath)) {
            file_put_contents($metaPath, json_encode([
                'filename' => preg_replace('/[^a-zA-Z0-9._\-]/', '_', basename($filename)),
                'total' => $totalChunks,
                'created' => time(),
            ]));
        }

        // Декодируем
        $bytes = base64_decode($chunkBase64, true);
        if ($bytes === false) {
            throw new InvalidArgumentException('base64 decode failed');
        }

        // Проверка суммарного размера (грубо)
        $currentTotal = 0;
        foreach (glob($dir . '/chunk-*.bin') as $f) {
            $currentTotal += filesize($f);
        }
        if ($currentTotal + strlen($bytes) > self::MAX_TOTAL) {
            throw new RuntimeException(
                'Превышен лимит ' . (int) (self::MAX_TOTAL / 1024 / 1024) . ' MB'
            );
        }

        // Пишем чанк
        $chunkPath = $dir . '/chunk-' . str_pad((string)$chunkIndex, 5, '0', STR_PAD_LEFT) . '.bin';
        file_put_contents($chunkPath, $bytes);

        // Проверяем все ли чанки получены
        $received = glob($dir . '/chunk-*.bin');
        if (count($received) < $totalChunks) {
            return [
                'done' => false,
                'file_name' => null,
                'size' => null,
                'received' => count($received),
                'total' => $totalChunks,
            ];
        }

        // Склеиваем
        sort($received);
        $finalName = $uploadId . '.zip';
        $finalPath = $root . '/' . $finalName;

        $out = fopen($finalPath, 'wb');
        if (!$out) throw new RuntimeException('Не удалось создать файл');
        foreach ($received as $cp) {
            $in = fopen($cp, 'rb');
            stream_copy_to_stream($in, $out);
            fclose($in);
            @unlink($cp);
        }
        fclose($out);
        @unlink($metaPath);
        @rmdir($dir);

        return [
            'done' => true,
            'file_name' => $finalName,
            'size' => filesize($finalPath),
            'received' => $totalChunks,
            'total' => $totalChunks,
        ];
    }

    /** Проверка и получение пути к финальному файлу */
    public static function resolveFile(string $fileName): ?string
    {
        $fileName = basename($fileName);
        if (!preg_match('/^[a-z0-9\-]+\.zip$/i', $fileName)) return null;
        $path = self::root() . '/' . $fileName;
        return is_file($path) ? $path : null;
    }

    /** Удалить после обработки */
    public static function removeFile(string $fileName): void
    {
        $path = self::resolveFile($fileName);
        if ($path) @unlink($path);
    }
}
