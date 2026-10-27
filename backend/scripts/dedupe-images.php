<?php
require __DIR__ . '/../src/Database.php';
$pdo = Database::get();

$apply = in_array('--apply', $argv, true);

echo "Дедупликация картинок по товару\n";
echo "Режим: " . ($apply ? "APPLY (удаляем)" : "DRY-RUN (только смотрим)") . "\n\n";

/* ============================================================
   1. Группируем по товарам
   ============================================================ */
$rows = $pdo->query(
    "SELECT i.id, i.product_id, i.url, i.sort_order,
            p.name AS product_name
     FROM product_images i
     JOIN products p ON p.id = i.product_id
     WHERE i.media_type = 'image'
     ORDER BY i.product_id, i.sort_order, i.id"
)->fetchAll();

$byProduct = [];
foreach ($rows as $r) {
    $byProduct[(int)$r['product_id']][] = $r;
}

$totalProducts = 0;
$totalToDelete = 0;
$toDelete = [];
$missing = [];

$extPriority = function (string $url): int {
    $ext = strtolower(pathinfo(parse_url($url, PHP_URL_PATH) ?: $url, PATHINFO_EXTENSION));
    return match ($ext) {
        'webp' => 100,  // самый приоритетный
        'avif' => 90,
        'jpg', 'jpeg' => 80,
        'png'  => 70,
        'gif'  => 60,
        'svg'  => 50,
        default => 10,
    };
};

foreach ($byProduct as $productId => $media) {
    if (count($media) < 2) continue;

    // Сортируем: сначала по приоритету формата (высший), потом по sort_order (первый)
    usort($media, function ($a, $b) use ($extPriority) {
        $pa = $extPriority($a['url']);
        $pb = $extPriority($b['url']);
        if ($pa !== $pb) return $pb <=> $pa;
        return ($a['sort_order'] ?? 0) <=> ($b['sort_order'] ?? 0);
    });

    $keep = $media[0];
    $drop = array_slice($media, 1);

    // Проверяем что файл keep реально существует (иначе будет пустая обложка)
    $keepPath = __DIR__ . '/../../public' . $keep['url'];
    if (!str_starts_with($keep['url'], '/uploads/') || !is_file($keepPath)) {
        // Если keep битый — попробуем следующий
        $found = false;
        foreach ($media as $m) {
            $p = __DIR__ . '/../../public' . $m['url'];
            if (str_starts_with($m['url'], '/uploads/') && is_file($p)) {
                $keep = $m;
                $drop = array_values(array_filter($media, fn($x) => $x['id'] !== $m['id']));
                $found = true;
                break;
            }
        }
        if (!$found) {
            $missing[] = "Товар #$productId — нет ни одного файла на диске";
            continue;
        }
    }

    $totalProducts++;
    $totalToDelete += count($drop);

    echo "Товар #{$productId} «{$media[0]['product_name']}» (" . count($media) . " шт.):\n";
    echo "  → Оставляем: {$keep['url']}\n";
    foreach ($drop as $d) {
        echo "  ✗ Дубль:    {$d['url']} (image_id={$d['id']})\n";
        $toDelete[] = $d;
    }
    echo "\n";
}

echo "===================================\n";
echo "Товаров с дублями: $totalProducts\n";
echo "Всего к удалению:  $totalToDelete\n";
if (!empty($missing)) {
    echo "\nПроблемные товары:\n";
    foreach ($missing as $m) echo "  $m\n";
}
echo "===================================\n\n";

if ($totalToDelete === 0) {
    echo "✅ Дублей нет\n";
    exit(0);
}

if (!$apply) {
    echo "Запусти с --apply чтобы удалить дубли\n";
    exit(0);
}

/* ============================================================
   2. Удаление
   ============================================================ */
echo "Удаляем...\n\n";

$pdo->exec('BEGIN IMMEDIATE');
try {
    $delRow = $pdo->prepare('DELETE FROM product_images WHERE id = ?');
    $removedFiles = 0;
    $removedRows = 0;

    foreach ($toDelete as $d) {
        if (str_starts_with($d['url'], '/uploads/')) {
            $path = __DIR__ . '/../../public' . $d['url'];
            if (is_file($path) && @unlink($path)) {
                $removedFiles++;
            }
        }
        $delRow->execute([(int)$d['id']]);
        $removedRows++;
    }

    // Пересчитываем sort_order у оставшихся
    $renum = $pdo->prepare("UPDATE product_images SET sort_order = ? WHERE id = ?");
    foreach ($byProduct as $pid => $_) {
        $get = $pdo->prepare(
            "SELECT id FROM product_images WHERE product_id = ? AND media_type = 'image'
             ORDER BY sort_order, id"
        );
        $get->execute([$pid]);
        $i = 0;
        foreach ($get->fetchAll() as $row) {
            $renum->execute([$i, (int)$row['id']]);
            $i++;
        }
    }

    $pdo->exec('COMMIT');
    echo "✅ Удалено записей: $removedRows\n";
    echo "✅ Удалено файлов:  $removedFiles\n";
} catch (Throwable $e) {
    $pdo->exec('ROLLBACK');
    echo "❌ Ошибка: " . $e->getMessage() . "\n";
    exit(1);
}

$after = (int)$pdo->query(
    "SELECT COUNT(*) FROM product_images WHERE media_type = 'image'"
)->fetchColumn();
echo "\nОсталось картинок в БД: $after\n";
