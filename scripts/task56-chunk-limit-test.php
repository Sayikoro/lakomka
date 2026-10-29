<?php
/* Task 56: тест лимита ChunkedUpload — 210 МБ (раньше лимит 200 МБ рвал такую загрузку). */
require_once __DIR__ . '/../backend/src/ChunkedUpload.php';

const CHUNK = 512 * 1024;
const TOTAL = 210 * 1024 * 1024; // 210 MB
$chunks = (int) ceil(TOTAL / CHUNK);
$id = 'up-test56-' . substr(md5((string) mt_rand()), 0, 8);
$payload = str_repeat('x', CHUNK);

echo "загружаем " . round(TOTAL / 1024 / 1024) . " МБ в $chunks чанков...\n";
$t0 = microtime(true);
$last = null;
for ($i = 0; $i < $chunks; $i++) {
    // последний чанк — обрезанный (как реальный файл)
    $data = ($i === $chunks - 1) ? substr($payload, 0, TOTAL - ($chunks - 1) * CHUNK) : $payload;
    $last = ChunkedUpload::receiveChunk($id, $i, $chunks, 'test56.zip', base64_encode($data));
    if ($i % 100 === 0) echo "  чанк $i/" . $chunks . "\n";
}
$dt = round(microtime(true) - $t0, 1);
$ok = ($last['done'] ?? false) && ($last['size'] ?? 0) === TOTAL;
echo $ok ? "OK: собран " : "FAIL: ";
echo ($last['file_name'] ?? '?') . " size=" . ($last['size'] ?? 0) . " за {$dt}с\n";

// убираем за собой
if (!empty($last['file_name'])) ChunkedUpload::removeFile($last['file_name']);
echo "остаток в storage/chunked-uploads: " . count(glob(__DIR__ . '/../backend/storage/chunked-uploads/*') ?: []) . " файлов\n";
exit($ok ? 0 : 1);
