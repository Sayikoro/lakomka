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
}
