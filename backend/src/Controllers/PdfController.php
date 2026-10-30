<?php

require_once __DIR__ . '/../Auth.php';
require_once __DIR__ . '/../Paths.php';

/**
 * Печатные PDF-документы сайта: каталоги и сертификат соответствия.
 * Алиас — фиксированный «адрес назначения», при загрузке файл кладётся
 * в public/uploads/pdfs/{alias}.pdf (перезаписывая предыдущий).
 *
 *  catalog_1   — Каталог №1 (флипбук «Посмотреть каталоги»)
 *  catalog_2   — Каталог №2
 *  certificate — Сертификат соответствия
 *
 * Дополнительно у каждого документа есть:
 *  — описание (хранится в settings под ключом pdf_description_{alias}),
 *    редактируется в админке → PDF;
 *  — обложка public/uploads/pdfs/{alias}.jpg — картинка первой страницы,
 *    генерируется браузером (pdf.js) при загрузке PDF, показывается
 *    в «квадратике» на странице «Скачать каталоги».
 */
class PdfController
{
    /** Алиас => человекочитаемое название (для админки и витрины) */
    public const ALIASES = [
        'catalog_1'   => 'Каталог №1',
        'catalog_2'   => 'Каталог №2',
        'certificate' => 'Сертификат соответствия',
    ];

    private const MAX_PDF_BYTES = 200 * 1024 * 1024; // 200 MB
    private const MAX_CHUNK_B64 = 8 * 1024 * 1024;   // чанк base64 ≤ 8 MB
    private const MAX_COVER_BYTES = 6 * 1024 * 1024; // обложка ≤ 6 MB

    public static function dir(): string
    {
        return Paths::ensureDir(Paths::uploadsRoot() . '/pdfs');
    }

    /* ============================================================
       GET /api/pdfs — публичный список: какие документы загружены
       (с описаниями из настроек и путями обложек)
       ============================================================ */
    public static function list(PDO $pdo): void
    {
        $desc = self::descriptions($pdo);
        $out = [];
        foreach (self::ALIASES as $alias => $title) {
            $out[$alias] = self::info($alias, $title, $desc[$alias] ?? '');
        }
        jsonResponse(['data' => $out]);
    }

    /** Описания документов из settings (pdf_description_{alias}) */
    public static function descriptions(PDO $pdo): array
    {
        $rows = $pdo->query(
            "SELECT key, value FROM settings WHERE key LIKE 'pdf_description%'"
        )->fetchAll();
        $out = [];
        foreach ($rows as $r) {
            $alias = substr((string)$r['key'], strlen('pdf_description_'));
            $out[$alias] = (string)$r['value'];
        }
        return $out;
    }

    /** Информация по одному документу или null */
    public static function info(string $alias, string $title, string $description = ''): ?array
    {
        $file = self::dir() . '/' . $alias . '.pdf';
        if (!is_file($file)) return null;
        $cover = self::dir() . '/' . $alias . '.jpg';
        return [
            'alias'      => $alias,
            'title'      => $title,
            'url'        => '/uploads/pdfs/' . $alias . '.pdf',
            'size'       => filesize($file),
            'updated_at' => date('c', (int)filemtime($file)),
            'description' => $description,
            'cover'      => is_file($cover) ? '/uploads/pdfs/' . $alias . '.jpg' : null,
        ];
    }

    /* ============================================================
       POST /api/admin/pdfs/{alias}/meta — сохранить описание
       JSON: { description: string }
       ============================================================ */
    public static function saveMeta(PDO $pdo, string $alias): void
    {
        Auth::requireEditor();

        if (!isset(self::ALIASES[$alias])) {
            jsonResponse(['error' => 'Неизвестный алиас: ' . $alias], 422);
        }
        $data = json_decode((string)file_get_contents('php://input'), true);
        if (!is_array($data) || !array_key_exists('description', $data)) {
            jsonResponse(['error' => 'Нужно поле description'], 422);
        }
        $description = trim((string)$data['description']);
        if (mb_strlen($description) > 2000) {
            jsonResponse(['error' => 'Описание слишком длинное (максимум 2000 символов)'], 422);
        }

        $upd = $pdo->prepare(
            'INSERT INTO settings (key, value) VALUES (?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value'
        );
        $upd->execute(['pdf_description_' . $alias, $description]);

        jsonResponse(['data' => ['ok' => true, 'alias' => $alias, 'description' => $description]]);
    }

    /* ============================================================
       POST /api/admin/pdfs/{alias}/cover — обложка (multipart, JPEG)
       Картинка первой страницы PDF (генерируется pdf.js в браузере)
       или своя обложка. Сохраняется в public/uploads/pdfs/{alias}.jpg
       ============================================================ */
    public static function uploadCover(string $alias): void
    {
        Auth::requireEditor();

        if (!isset(self::ALIASES[$alias])) {
            jsonResponse(['error' => 'Неизвестный алиас: ' . $alias], 422);
        }
        if (empty($_FILES['file']) || !is_uploaded_file($_FILES['file']['tmp_name'] ?? '')) {
            jsonResponse(['error' => 'Файл не передан'], 422);
        }
        $f = $_FILES['file'];
        if (($f['error'] ?? UPLOAD_ERR_OK) !== UPLOAD_ERR_OK) {
            jsonResponse(['error' => 'Ошибка загрузки файла'], 422);
        }
        if ($f['size'] > self::MAX_COVER_BYTES) {
            jsonResponse(['error' => 'Обложка больше 6 МБ'], 422);
        }
        // Клиент всегда присылает JPEG (конвертация на canvas.toBlob)
        $mime = mime_content_type($f['tmp_name']);
        if ($mime !== 'image/jpeg') {
            jsonResponse(['error' => 'Ожидается JPEG-картинка'], 422);
        }

        $destDir = self::dir();
        if (!is_dir($destDir)) mkdir($destDir, 0755, true);
        $dest = $destDir . '/' . $alias . '.jpg';
        if (!move_uploaded_file($f['tmp_name'], $dest)) {
            jsonResponse(['error' => 'Не удалось сохранить обложку'], 500);
        }
        @chmod($dest, 0644);

        jsonResponse(['data' => [
            'ok' => true,
            'alias' => $alias,
            'cover' => '/uploads/pdfs/' . $alias . '.jpg',
        ]]);
    }

    /* ============================================================
       POST /api/admin/pdfs/chunk
       JSON: { alias, upload_id, chunk_index, total_chunks,
               chunk_base64, filename? }
       Последний чанк склеивает файл в public/uploads/pdfs/{alias}.pdf
       ============================================================ */
    public static function uploadChunk(): void
    {
        Auth::requireEditor();

        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true);
        if (!is_array($data)) jsonResponse(['error' => 'Invalid JSON'], 400);

        $alias = (string)($data['alias'] ?? '');
        if (!isset(self::ALIASES[$alias])) {
            jsonResponse(['error' => 'Неизвестный алиас: ' . $alias], 422);
        }

        $uploadId = preg_replace('/[^a-z0-9\-]/', '', strtolower((string)($data['upload_id'] ?? '')));
        if (strlen((string)$uploadId) < 8) {
            jsonResponse(['error' => 'Некорректный upload_id'], 422);
        }

        $chunkIndex = (int)($data['chunk_index'] ?? -1);
        $totalChunks = (int)($data['total_chunks'] ?? 0);
        if ($chunkIndex < 0 || $totalChunks <= 0 || $chunkIndex >= $totalChunks || $totalChunks > 2000) {
            jsonResponse(['error' => 'Некорректные параметры чанков'], 422);
        }

        $b64 = (string)($data['chunk_base64'] ?? '');
        if ($b64 === '' || strlen($b64) > self::MAX_CHUNK_B64) {
            jsonResponse(['error' => 'Пустой или слишком большой чанк'], 422);
        }
        $bytes = base64_decode($b64, true);
        if ($bytes === false || $bytes === '') {
            jsonResponse(['error' => 'base64 decode failed'], 422);
        }

        $work = self::dir() . '/.tmp-' . $uploadId;
        if (!is_dir($work)) {
            if (!mkdir($work, 0755, true)) {
                jsonResponse(['error' => 'Не удалось создать временную папку'], 500);
            }
            file_put_contents($work . '/meta.json', json_encode([
                'alias' => $alias,
                'total' => $totalChunks,
                'filename' => basename((string)($data['filename'] ?? 'document.pdf')),
                'created' => time(),
            ]));
        }

        $meta = json_decode((string)file_get_contents($work . '/meta.json'), true) ?: [];
        if (($meta['alias'] ?? '') !== $alias) {
            jsonResponse(['error' => 'Алиас не совпадает с началом загрузки'], 422);
        }

        file_put_contents(
            sprintf('%s/chunk-%05d.bin', $work, $chunkIndex),
            $bytes
        );

        // Проверка суммарного размера
        $currentTotal = 0;
        foreach (glob($work . '/chunk-*.bin') ?: [] as $f) {
            $currentTotal += (int)filesize($f);
        }
        if ($currentTotal > self::MAX_PDF_BYTES) {
            self::rrmdir($work);
            jsonResponse(['error' => 'Файл больше 200 MB'], 422);
        }

        $received = glob($work . '/chunk-*.bin') ?: [];
        if (count($received) < $totalChunks) {
            jsonResponse(['data' => [
                'done' => false,
                'received' => count($received),
                'total' => $totalChunks,
            ]]);
        }

        // Все чанки получены — склеиваем во временный файл и валидируем
        sort($received);
        $tmpPdf = $work . '/assembled.pdf';
        $out = fopen($tmpPdf, 'wb');
        if (!$out) {
            jsonResponse(['error' => 'Не удалось создать файл'], 500);
        }
        foreach ($received as $cp) {
            $in = fopen($cp, 'rb');
            stream_copy_to_stream($in, $out);
            fclose($in);
        }
        fclose($out);

        // Валидация PDF-сигнатуры
        $head = (string)file_get_contents($tmpPdf, false, null, 0, 5);
        if (!str_starts_with($head, '%PDF-')) {
            self::rrmdir($work);
            jsonResponse(['error' => 'Файл не является корректным PDF'], 422);
        }

        $destDir = self::dir();
        if (!is_dir($destDir)) mkdir($destDir, 0755, true);
        $dest = $destDir . '/' . $alias . '.pdf';

        if (!rename($tmpPdf, $dest)) {
            self::rrmdir($work);
            jsonResponse(['error' => 'Не удалось сохранить файл'], 500);
        }
        @chmod($dest, 0644);
        self::rrmdir($work);

        jsonResponse(['data' => [
            'done' => true,
            'received' => $totalChunks,
            'total' => $totalChunks,
            'document' => self::info($alias, self::ALIASES[$alias]),
        ]]);
    }

    /* ============================================================
       DELETE /api/admin/pdfs/{alias} — убрать документ (+ обложку)
       ============================================================ */
    public static function remove(string $alias): void
    {
        Auth::requireEditor();

        if (!isset(self::ALIASES[$alias])) {
            jsonResponse(['error' => 'Неизвестный алиас: ' . $alias], 422);
        }
        $file = self::dir() . '/' . $alias . '.pdf';
        if (is_file($file) && !@unlink($file)) {
            jsonResponse(['error' => 'Не удалось удалить файл'], 500);
        }
        $cover = self::dir() . '/' . $alias . '.jpg';
        if (is_file($cover)) @unlink($cover);
        jsonResponse(['data' => ['ok' => true, 'alias' => $alias]]);
    }

    private static function rrmdir(string $dir): void
    {
        foreach (glob($dir . '/*') ?: [] as $f) @unlink($f);
        @rmdir($dir);
    }
}
