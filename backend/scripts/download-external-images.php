<?php
require __DIR__ . '/../src/Database.php';
$pdo = Database::get();

$parallel = 20;      // одновременно качаемых картинок
$timeout = 8;        // секунд на одну
$dryRun = in_array('--dry-run', $argv, true);

echo "Загрузка внешних картинок\n";
echo "Параллельно: $parallel, таймаут: {$timeout}s";
echo $dryRun ? ", режим: DRY-RUN\n\n" : ", режим: APPLY\n\n";

/* ============================================================
   1. Собираем список
   ============================================================ */
$rows = $pdo->query(
    "SELECT i.id, i.url, i.product_id, p.slug AS product_slug, p.name AS product_name
     FROM product_images i
     JOIN products p ON p.id = i.product_id
     WHERE i.url LIKE 'http%'
     ORDER BY i.id"
)->fetchAll();

$total = count($rows);
echo "Найдено внешних картинок: $total\n";
if ($total === 0) {
    echo "Всё уже локально — экспорт будет мгновенным.\n";
    exit(0);
}

if ($dryRun) {
    echo "\nПервые 5 для примера:\n";
    foreach (array_slice($rows, 0, 5) as $r) {
        $host = parse_url($r['url'], PHP_URL_HOST) ?? '?';
        echo "  id={$r['id']}  [{$host}]  {$r['product_name']}\n";
    }
    echo "\nЗапусти с --apply чтобы скачать.\n";
    exit(0);
}

/* ============================================================
   2. Функция: mime → расширение
   ============================================================ */
function extFromContentType(string $ct): string
{
    $ct = strtolower($ct);
    if (str_contains($ct, 'png'))  return 'png';
    if (str_contains($ct, 'webp')) return 'webp';
    if (str_contains($ct, 'gif'))  return 'gif';
    if (str_contains($ct, 'svg'))  return 'svg';
    if (str_contains($ct, 'jpeg') || str_contains($ct, 'jpg')) return 'jpg';
    return 'jpg';
}

/* ============================================================
   3. Готовим папки и счётчики
   ============================================================ */
$okCount = 0;
$failCount = 0;
$skipped = 0;
$updateStmt = $pdo->prepare('UPDATE product_images SET url = ? WHERE id = ?');
$failures = [];
$startTime = microtime(true);

/* ============================================================
   4. Обработка пачками через curl_multi
   ============================================================ */
$chunks = array_chunk($rows, $parallel);
$processed = 0;

foreach ($chunks as $chunk) {
    $mh = curl_multi_init();
    $handles = [];

    foreach ($chunk as $row) {
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => $row['url'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 3,
            CURLOPT_TIMEOUT => $timeout,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_USERAGENT => 'Mozilla/5.0 (compatible; Lakomka-Import/1.0)',
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_SSL_VERIFYHOST => 0,
            CURLOPT_HEADER => true, // чтобы получить content-type из заголовков
        ]);
        curl_multi_add_handle($mh, $ch);
        $handles[] = ['ch' => $ch, 'row' => $row];
    }

    // Запускаем
    do {
        $status = curl_multi_exec($mh, $running);
        if ($running) curl_multi_select($mh, 1.0);
    } while ($running && $status === CURLM_OK);

    // Собираем результаты
    foreach ($handles as $h) {
        $ch = $h['ch'];
        $row = $h['row'];
        $processed++;

        $body = curl_multi_getcontent($ch);
        $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE) ?? '';

        // Отделяем заголовки от тела (мы включили CURLOPT_HEADER)
        if ($body !== null) {
            $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
            $body = substr($body, $headerSize);
        }

        if ($httpCode !== 200 || empty($body)) {
            $failCount++;
            $failures[] = "HTTP $httpCode: {$row['url']}";
            curl_multi_remove_handle($mh, $ch);
            curl_close($ch);
            continue;
        }

        // Куда сохранять
        $slug = $row['product_slug'];
        $safeSlug = preg_replace('/[^a-z0-9\-]/', '', strtolower($slug)) ?: "p{$row['product_id']}";
        $dir = __DIR__ . '/../../public/uploads/products/' . $safeSlug;
        if (!is_dir($dir) && !@mkdir($dir, 0755, true)) {
            $failCount++;
            $failures[] = "нет папки: $dir";
            curl_multi_remove_handle($mh, $ch);
            curl_close($ch);
            continue;
        }

        $ext = extFromContentType($contentType);
        $filename = 'ext-' . $row['id'] . '.' . $ext;
        $dest = $dir . '/' . $filename;

        if (!@file_put_contents($dest, $body)) {
            $failCount++;
            $failures[] = "не записалось: $dest";
            curl_multi_remove_handle($mh, $ch);
            curl_close($ch);
            continue;
        }

        $relUrl = '/uploads/products/' . $safeSlug . '/' . $filename;
        try {
            $updateStmt->execute([$relUrl, $row['id']]);
            $okCount++;
        } catch (Throwable $e) {
            $failCount++;
            $failures[] = "БД: " . $e->getMessage();
        }

        curl_multi_remove_handle($mh, $ch);
        curl_close($ch);
    }

    curl_multi_close($mh);

    // Прогресс
    $elapsed = microtime(true) - $startTime;
    $pct = $total > 0 ? round($processed / $total * 100) : 100;
    $rate = $processed > 0 ? round($processed / $elapsed, 1) : 0;
    echo sprintf(
        "  [%3d%%] %d/%d  ok: %d  fail: %d  (%.1f/s)\n",
        $pct, $processed, $total, $okCount, $failCount, $rate
    );
}

/* ============================================================
   5. Итог
   ============================================================ */
$elapsed = round(microtime(true) - $startTime, 1);

echo "\n===================================\n";
echo "Готово за {$elapsed}s\n";
echo "  Скачано:   $okCount\n";
echo "  Ошибок:    $failCount\n";
echo "===================================\n";

if (!empty($failures)) {
    echo "\nПроблемные (первые 20):\n";
    foreach (array_slice($failures, 0, 20) as $f) {
        echo "  • $f\n";
    }
    if (count($failures) > 20) {
        echo "  ... и ещё " . (count($failures) - 20) . "\n";
    }
    echo "\nМожно перезапустить позже — обработаются только те, что ещё на http\n";
}

// Что осталось
$remaining = (int)$pdo->query(
    "SELECT COUNT(*) FROM product_images WHERE url LIKE 'http%'"
)->fetchColumn();
echo "\nОсталось внешних картинок в БД: $remaining\n";
if ($remaining === 0) {
    echo "✅ Все картинки локальные. Экспорт будет мгновенным.\n";
}