<?php
/* Переливка внешних картинок товаров в локальные:
 * 1) позиционная пара (как в экспорте): БД (sort_order,id) ↔ файлы папки (natural sort);
 * 2) файл переименовывается в каноническое {i}.{ext};
 * 3) нет файла — докачка с внешнего URL (2 попытки, timeout 10с);
 * 4) url в БД переписывается на /uploads/products/{slug}/{i}.{ext}.
 * Итог: в product_images не остаётся http-ссылок.
 */
require '/home/z/my-project/backend/src/Database.php';

$pdo = Database::get();

$uploadsRoot = '/home/z/my-project/public/uploads/products';
$stats = ['localized' => 0, 'downloaded' => 0, 'failed' => 0, 'renamed' => 0, 'url_updated' => 0, 'orphans' => 0];
$failed = [];
$orphans = [];

$products = $pdo->query('SELECT id, slug FROM products ORDER BY id')->fetchAll();

foreach ($products as $p) {
    $st = $pdo->prepare(
        "SELECT id, url FROM product_images
         WHERE product_id = ? AND media_type = 'image'
         ORDER BY sort_order, id"
    );
    $st->execute([$p['id']]);
    $images = $st->fetchAll();
    if (!$images) continue;

    $safeSlug = preg_replace('/[^a-z0-9\-]/', '', strtolower((string)$p['slug'])) ?: 'p' . $p['id'];
    $dir = $uploadsRoot . '/' . $safeSlug;
    if (!is_dir($dir)) {
        if (!@mkdir($dir, 0755, true)) {
            $failed[] = "#{$p['id']} {$p['slug']}: не создать папку";
            $stats['failed'] += count($images);
            continue;
        }
    }

    // Файлы папки в natural sort (тот же компаратор, что в экспорте)
    $files = glob($dir . '/*.*') ?: [];
    usort($files, static function ($a, $b) {
        $na = (int)preg_replace('/\D/', '', basename($a));
        $nb = (int)preg_replace('/\D/', '', basename($b));
        return $na <=> $nb;
    });

    // Лишние файлы (больше, чем картинок в БД) — только логируем
    if (count($files) > count($images)) {
        $stats['orphans'] += count($files) - count($images);
        foreach (array_slice($files, count($images)) as $o) {
            $orphans[] = "{$p['slug']}/" . basename($o);
        }
    }

    // План переименований: {i}.{ext}; двухфазно, чтобы не убить совпадающие имена
    $renames = []; // [src => dest]
    foreach ($images as $i => $m) {
        if ($i < count($files)) {
            $ext = strtolower(pathinfo($files[$i], PATHINFO_EXTENSION)) ?: 'jpg';
            if ($ext === 'jpeg') $ext = 'jpg';
            $renames[$files[$i]] = $dir . '/' . $i . '.' . $ext;
        }
    }
    $hasConflict = false;
    foreach ($renames as $src => $dest) {
        if (basename($src) !== basename($dest) && isset($renames[$dest])) $hasConflict = true;
    }
    if ($hasConflict) {
        foreach ($renames as $src => $dest) {
            if (basename($src) !== basename($dest)) rename($src, $src . '.tmp');
        }
        foreach ($renames as $src => $dest) {
            if (basename($src) !== basename($dest)) {
                rename($src . '.tmp', $dest);
                $stats['renamed']++;
            }
        }
    } else {
        foreach ($renames as $src => $dest) {
            if (basename($src) !== basename($dest)) {
                rename($src, $dest);
                $stats['renamed']++;
            }
        }
    }

    // Пересобираем список файлов после переименований
    $files = glob($dir . '/*.*') ?: [];
    usort($files, static function ($a, $b) {
        $na = (int)preg_replace('/\D/', '', basename($a));
        $nb = (int)preg_replace('/\D/', '', basename($b));
        return $na <=> $nb;
    });

    foreach ($images as $i => $m) {
        $localFile = null;
        if ($i < count($files)) {
            $ext = strtolower(pathinfo($files[$i], PATHINFO_EXTENSION)) ?: 'jpg';
            if ($ext === 'jpeg') $ext = 'jpg';
            $localFile = $files[$i];
            $newUrl = "/uploads/products/$safeSlug/$i.$ext";
            $stats['localized']++;
        } else {
            // докачка
            $urlPath = parse_url($m['url'], PHP_URL_PATH) ?? '';
            $ext = strtolower(pathinfo($urlPath, PATHINFO_EXTENSION)) ?: 'jpg';
            if ($ext === 'jpeg') $ext = 'jpg';
            if (!in_array($ext, ['jpg', 'png', 'webp', 'gif'], true)) $ext = 'jpg';
            $dest = "$dir/$i.$ext";
            $blob = false;
            for ($try = 0; $try < 2; $try++) {
                $ctx = stream_context_create(['http' => ['timeout' => 10, 'header' => "User-Agent: Mozilla/5.0\r\n"]]);
                $blob = @file_get_contents($m['url'], false, $ctx);
                if ($blob !== false) break;
                sleep(1);
            }
            if ($blob === false) {
                $stats['failed']++;
                $failed[] = "#{$p['id']} {$p['slug']} img$i ← {$m['url']}";
                continue;
            }
            file_put_contents($dest, $blob);
            $newUrl = "/uploads/products/$safeSlug/$i.$ext";
            $stats['downloaded']++;
        }

        if ($m['url'] !== $newUrl) {
            $upd = $pdo->prepare('UPDATE product_images SET url = ? WHERE id = ?');
            $upd->execute([$newUrl, $m['id']]);
            $stats['url_updated']++;
        }
    }
}

echo "ИТОГ: " . json_encode($stats, JSON_UNESCAPED_UNICODE) . "\n";
if ($failed) {
    echo "FAILED (" . count($failed) . "):\n";
    foreach (array_slice($failed, 0, 20) as $f) echo "  $f\n";
}
if ($orphans) {
    echo "ORPHANS (" . count($orphans) . "):\n";
    foreach (array_slice($orphans, 0, 20) as $o) echo "  $o\n";
}

// Контроль: не осталось ли http-URL
$left = (int)$pdo->query("SELECT COUNT(*) FROM product_images WHERE url LIKE 'http%'")->fetchColumn();
echo "Осталось внешних URL в product_images: $left\n";
