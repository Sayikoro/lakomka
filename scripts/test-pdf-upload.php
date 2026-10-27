<?php
// Тестовая загрузка PDF по чанкам через админ-API (проверка end-to-end)
// Использование: php scripts/test-pdf-upload.php <file.pdf> <alias>
require __DIR__ . '/../backend/config.php';

$file = $argv[1] ?? '';
$alias = $argv[2] ?? 'catalog_1';
if (!is_file($file)) { fwrite(STDERR, "нет файла $file\n"); exit(1); }

// Минтим JWT напрямую (супер-админ id=1)
$db = new PDO('sqlite:' . __DIR__ . '/../backend/storage/database.sqlite');
$u = $db->query("SELECT id, email, role FROM users WHERE role='super_admin' LIMIT 1")->fetch(PDO::FETCH_ASSOC);
if (!$u) { fwrite(STDERR, "нет супер-админа\n"); exit(1); }

// issueToken из Auth.php
require __DIR__ . '/../backend/src/Auth.php';
$token = Auth::issueToken((int)$u['id'], $u['email'], $u['role']);

$CHUNK = 2 * 1024 * 1024;
$size = filesize($file);
$total = max(1, (int)ceil($size / $CHUNK));
$uploadId = 'testupload' . time();

echo "Файл: $file (" . round($size / 1024) . " KB), чанков: $total, алиас: $alias\n";

for ($i = 0; $i < $total; $i++) {
    $bytes = file_get_contents($file, false, null, $i * $CHUNK, $CHUNK);
    $body = json_encode([
        'alias' => $alias,
        'upload_id' => $uploadId,
        'chunk_index' => $i,
        'total_chunks' => $total,
        'chunk_base64' => base64_encode($bytes),
        'filename' => basename($file),
    ]);
    $ctx = stream_context_create(['http' => [
        'method' => 'POST',
        'header' => "Content-Type: application/json\r\nAuthorization: Bearer $token\r\n",
        'content' => $body,
        'ignore_errors' => true,
        'timeout' => 60,
    ]]);
    $res = file_get_contents('http://127.0.0.1:8000/api/admin/pdfs/chunk', false, $ctx);
    $code = explode(' ', $http_response_header[0] ?? '')[1] ?? '?';
    echo "чанк $i/" . ($total - 1) . " → HTTP $code " . substr((string)$res, 0, 120) . "\n";
    if ($code !== '200') exit(1);
}

// Проверка публичного списка
$list = json_decode((string)file_get_contents('http://127.0.0.1:8000/api/pdfs'), true);
echo "ПУБЛИЧНЫЙ СПИСОК: " . json_encode($list, JSON_UNESCAPED_UNICODE) . "\n";
