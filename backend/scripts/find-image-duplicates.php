<?php
require __DIR__ . '/../src/Database.php';
$pdo = Database::get();

$apply = in_array('--apply', $argv, true);

echo "Поиск дубликатов картинок (по MD5 содержимого)\n";
echo "Режим: " . ($apply ? "APPLY (удаляем дубли)" : "DRY-RUN (только показываем)") . "\n\n";

/* ============================================================
   1. Все товары с картинками, сгруппированные
   ============================================================ */
$rows = $pdo->query(
    "SELECT i.id, i.product_id, i.url, i.media_type, i.sort_order,
            p.name AS product_name, p.slug AS product_slug
     FROM product_images i
     JOIN products p ON p.id = i.product_id
     WHERE i.media_type = 'image'
     ORDER BY i.product_id, i.sort_order, i.id"
)->fetchAll();

$byProduct = [];
foreach ($rows as $r) {
    $byProduct[(int)$r['product_id']][] = $r;
}

$totalDupes = 0;
$totalProducts = 0;
$toDelete = [];
$fileErrorCount = 0;
$missingFiles = [];

foreach ($byProduct as $productId => $media) {
    if (count($media) < 2) continue;

    $hashes = [];   // hash => first item
    $dupes = [];    // items to delete

    foreach ($media as $m) {
        $url = $m['url'];
        // Только локальные файлы — внешние не трогаем (они сами по себе дубли друг друга не создают)
        if (!str_starts_with($url, '/uploads/')) continue;
        $path = __DIR__ . '/../../public' . $url;
        if (!is_file($path)) {
            $missingFiles[] = $url;
            continue;
        }
        $hash = md5_file($path);
        if ($hash === false) {
            $fileErrorCount++;
            continue;
        }

        if (isset($hashes[$hash])) {
            $dupes[] = $m;
        } else {
            $hashes[$hash] = $m;
        }
    }

    if (!empty($dupes)) {
        $totalDupes += count($dupes);
        $totalProducts++;
        echo "Товар #{$productId} «{$media[0]['product_name']}»:\n";
        echo "  Оставляем: {$hashes[array_key_first($hashes)]['url']}\n";
        foreach ($dupes as $d) {
            echo "  Дубль:    {$d['url']} (image_id={$d['id']})\n";
            $toDelete[] = $d;
        }
        echo "\n";
    }
}

echo "===================================\n";
echo "Товаров с дублями: $totalProducts\n";
echo "Всего дублей:      $totalDupes\n";
if ($fileErrorCount > 0) echo "Ошибок чтения файлов: $fileErrorCount\n";
if (!empty($missingFiles)) {
    echo "Файлов не найдено (битые ссылки в БД): " . count($missingFiles) . "\n";
    foreach (array_slice($missingFiles, 0, 5) as $f) echo "  $f\n";
}
echo "===================================\n\n";

if ($totalDupes === 0) {
    echo "✅ Дублей не найдено\n";
    exit(0);
}

if (!$apply) {
    echo "Запусти с --apply чтобы удалить дубли (файлы и записи в БД)\n";
    exit(0);
}

/* ============================================================
   2. Удаление
   ============================================================ */
echo "Удаляем дубли...\n\n";

$pdo->exec('BEGIN IMMEDIATE');
try {
    $delRow = $pdo->prepare('DELETE FROM product_images WHERE id = ?');
    $removedRows = 0;
    $removedFiles = 0;

    foreach ($toDelete as $d) {
        // Удаляем файл
        if (str_starts_with($d['url'], '/uploads/')) {
            $path = __DIR__ . '/../../public' . $d['url'];
            if (is_file($path) && @unlink($path)) {
                $removedFiles++;
            }
        }
        // Удаляем запись
        $delRow->execute([(int)$d['id']]);
        $removedRows++;
    }

    // Пересчитываем sort_order у оставшихся картинок (чтобы не было дырок)
    $remaining = $pdo->query(
        "SELECT product_id FROM product_images WHERE media_type = 'image' GROUP BY product_id"
    )->fetchAll();
    $renum = $pdo->prepare(
        "UPDATE product_images SET sort_order = ? WHERE id = ?"
    );
    foreach ($remaining as $r) {
        $pid = (int)$r['product_id'];
        $imgs = $pdo->prepare(
            "SELECT id FROM product_images
             WHERE product_id = ? AND media_type = 'image'
             ORDER BY sort_order, id"
        );
        $imgs->execute([$pid]);
        $idx = 0;
        foreach ($imgs->fetchAll() as $row) {
            $renum->execute([$idx, (int)$row['id']]);
            $idx++;
        }
    }

    $pdo->exec('COMMIT');
    echo "✅ Удалено записей:  $removedRows\n";
    echo "✅ Удалено файлов:   $removedFiles\n";
} catch (Throwable $e) {
    $pdo->exec('ROLLBACK');
    echo "❌ Ошибка: " . $e->getMessage() . "\n";
    exit(1);
}

/* ============================================================
   3. Проверка после
   ============================================================ */
echo "\n=== После чистки ===\n";
$check = $pdo->query(
    "SELECT COUNT(*) FROM product_images WHERE media_type = 'image'"
)->fetchColumn();
echo "Картинок в БД: $check\n";