<?php

require_once __DIR__ . '/../Auth.php';
require_once __DIR__ . '/../ProductCsvParser.php';
require_once __DIR__ . '/../ChunkedUpload.php';

class AdminProductsImportExportController
{
    private const COVER_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
    private const VIDEO_EXT = ['mp4', 'webm', 'mov'];

    /* ============================================================
       ИМПОРТ
       POST /api/admin/products/import-zip
       body: { file_path: "xxx.zip" }
       ============================================================ */
    public static function importZip(PDO $pdo): void
    {
        Auth::requireEditor();

        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true) ?? [];
        $fileName = (string)($data['file_path'] ?? '');

        $zipPath = ChunkedUpload::resolveFile($fileName);
        if (!$zipPath) jsonResponse(['error' => 'ZIP не найден. Загрузите заново.'], 404);

        if (!class_exists('ZipArchive')) {
            jsonResponse(['error' => 'Расширение zip не установлено в PHP'], 500);
        }

        $zip = new ZipArchive();
        $openResult = @$zip->open($zipPath);
        if ($openResult !== true) {
            ChunkedUpload::removeFile($fileName);
            jsonResponse(['error' => "Не удалось открыть ZIP (код: $openResult)"], 422);
        }

        // CSV
        $csvContent = null;
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $n = $zip->getNameIndex($i);
            if (preg_match('/\.csv$/i', $n) && !str_ends_with($n, '/')) {
                $csvContent = $zip->getFromIndex($i);
                break;
            }
        }
        if ($csvContent === null) {
            $zip->close();
            ChunkedUpload::removeFile($fileName);
            jsonResponse(['error' => 'В ZIP нет CSV'], 422);
        }

        // Распаковка во временные папки
        $tmpDir = sys_get_temp_dir() . '/products-import-' . bin2hex(random_bytes(4));
        @mkdir($tmpDir, 0755, true);
        @mkdir($tmpDir . '/videos', 0755, true);

        $imageFiles = [];  // lowercase basename => path
        $videoFiles = [];  // lowercase basename => path

        for ($i = 0; $i < $zip->numFiles; $i++) {
            $n = $zip->getNameIndex($i);
            if (str_ends_with($n, '/')) continue;

            if (preg_match('#(^|/)images/(.+)$#i', $n, $m)) {
                $base = basename($m[2]);
                $base = preg_replace('/[^\p{L}\p{N}._\- ]/u', '_', $base);
                $target = $tmpDir . '/' . $base;
                file_put_contents($target, $zip->getFromIndex($i));
                $imageFiles[strtolower($base)] = $target;
            } elseif (preg_match('#(^|/)videos/(.+)$#i', $n, $m)) {
                $base = basename($m[2]);
                $base = preg_replace('/[^\p{L}\p{N}._\- ]/u', '_', $base);
                $target = $tmpDir . '/videos/' . $base;
                file_put_contents($target, $zip->getFromIndex($i));
                $videoFiles[strtolower($base)] = $target;
            }
        }
        $zip->close();

        $csvPath = $tmpDir . '/__data.csv';
        file_put_contents($csvPath, $csvContent);

        try {
            $parsed = ProductCsvParser::parse($csvPath);
        } catch (Throwable $e) {
            self::cleanupTmp($tmpDir);
            ChunkedUpload::removeFile($fileName);
            jsonResponse(['error' => $e->getMessage()], 422);
        }

        if (empty($parsed['rows'])) {
            self::cleanupTmp($tmpDir);
            ChunkedUpload::removeFile($fileName);
            jsonResponse([
                'error' => 'Нет валидных строк для импорта',
                'parse_errors' => $parsed['errors'],
            ], 422);
        }

        $stats = self::applyImport($pdo, $parsed, $imageFiles, $videoFiles);

        self::cleanupTmp($tmpDir);
        ChunkedUpload::removeFile($fileName);

        jsonResponse([
            'data' => [
                'rows_processed' => $parsed['rows_processed'],
                'created' => $stats['created'],
                'updated' => $stats['updated'],
                'images_copied' => $stats['images_copied'],
                'videos_copied' => $stats['videos_copied'],
                'videos_external' => $stats['videos_external'],
                'parse_errors' => $parsed['errors'],
                'import_errors' => $stats['errors'],
                'images_missing' => array_values(array_unique($stats['images_missing'])),
                'videos_missing' => array_values(array_unique($stats['videos_missing'])),
            ],
        ]);
    }

    /* ============================================================
       ЭКСПОРТ — как у файловых свалок: один POST целиком готовит архив
       и в ответе отдаёт готовую статическую ссылку. Браузер НЕ участвует
       в подготовке (никаких NDJSON-стримов, которые рвал прокси с 502):
       сначала файл собирается на сервере, потом просто скачивается GET-ом.
       ============================================================ */
    public static function exportZip(PDO $pdo): void
    {
        Auth::requireEditor();
        set_time_limit(0);

        if (!class_exists('ZipArchive')) {
            jsonResponse(['error' => 'Расширение zip не установлено'], 500);
        }

        $exportsDir = __DIR__ . '/../../../public/exports'; // внутри public/ — ZIP отдаётся статикой
        if (!is_dir($exportsDir) && !@mkdir($exportsDir, 0755, true)) {
            jsonResponse(['error' => 'Не удалось создать папку для экспорта'], 500);
        }
        foreach (glob($exportsDir . '/*.zip') as $old) {
            if (is_file($old) && filemtime($old) < time() - 7200) @unlink($old);
        }

        $ts = date('Y-m-d-H-i-s');
        $filename = "lakomka-products-$ts.zip";
        $finalPath = $exportsDir . '/' . $filename;
        $tmpPath = tempnam(sys_get_temp_dir(), 'lakomka-exp-');
        if ($tmpPath === false) {
            jsonResponse(['error' => 'Не удалось создать temp'], 500);
        }

        $zip = new ZipArchive();
        if ($zip->open($tmpPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            @unlink($tmpPath);
            jsonResponse(['error' => 'Не удалось открыть ZIP'], 500);
        }

        try {
            $catMap = [];
            foreach ($pdo->query('SELECT id, slug FROM categories')->fetchAll() as $c) {
                $catMap[(int)$c['id']] = $c['slug'];
            }

            $products = $pdo->query('SELECT * FROM products ORDER BY id')->fetchAll();
            $totalProducts = count($products);

            $totalImages = (int)$pdo->query(
                "SELECT COUNT(*) FROM product_images WHERE media_type = 'image'"
            )->fetchColumn();
            $totalVideos = (int)$pdo->query(
                "SELECT COUNT(*) FROM product_images WHERE media_type = 'video'"
            )->fetchColumn();
            $totalItems = $totalProducts + $totalImages + $totalVideos;

            $imgStmt = $pdo->prepare(
                "SELECT id, url, alt, media_type, sort_order
                 FROM product_images
                 WHERE product_id = ?
                 ORDER BY media_type DESC, sort_order, id"
            );

            /* Локальные копии картинок из импорта: public/uploads/products/{slug}/.
               Если копия есть на диске — берём её мгновенно, сеть не трогаем. */
            $productsRoot = __DIR__ . '/../../../public/uploads/products';
            $localImagesFor = function (array $prod) use ($productsRoot): array {
                $dir = $productsRoot . '/' . (preg_replace('/[^a-z0-9\-]/', '', strtolower((string)$prod['slug'])) ?: 'p' . $prod['id']);
                if (!is_dir($dir)) return [];
                $found = glob($dir . '/*.*') ?: [];
                usort($found, static function ($a, $b) {
                    $na = (int)preg_replace('/\D/', '', basename($a));
                    $nb = (int)preg_replace('/\D/', '', basename($b));
                    return $na <=> $nb;
                });
                return $found;
            };

            $headers = [
                'ID', 'НАЗВАНИЕ', 'ТИП', 'SLUG', 'SKU',
                'ЦЕНА', 'СТАРАЯ_ЦЕНА', 'ОСТАТОК',
                'ВЕС', 'ДЛИНА', 'ШИРИНА', 'ВЫСОТА',
                'ПРОИЗВОДИТЕЛЬ', 'КАТЕГОРИЯ', 'ОПИСАНИЕ',
                'КАРТИНКИ', 'ВИДЕО', 'РЕЦЕПТ_ВЕС', 'УПАКОВКА',
                'ПОКАЗЫВАТЬ', 'ОПУБЛИКОВАН', 'LEGACY_SLUG',
            ];

            $csv = "\xEF\xBB\xBF";
            $csv .= implode(';', array_map([self::class, 'csvEscape'], $headers)) . "\n";

            $stats = [
                'images_packed' => 0,
                'images_downloaded' => 0,
                'images_skipped' => 0,
                'videos_packed' => 0,
                'videos_skipped' => 0,
            ];
            $counter = 0;

            foreach ($products as $idx => $p) {
                $imgStmt->execute([$p['id']]);
                $media = $imgStmt->fetchAll();
                $localImages = $localImagesFor($p);

                $imageNames = [];
                $videoNames = [];
                $imageCounter = 0;
                $videoCounter = 0;

                foreach ($media as $m) {
                    $url = $m['url'];

                    if ($m['media_type'] === 'video') {
                        if (str_starts_with($url, '/uploads/')) {
                            // локальное — упаковать файл в videos/
                            $srcPath = __DIR__ . '/../../../public' . $url;
                            if (!is_file($srcPath)) {
                                // Файл пропал — всё равно перечисляем ссылку в CSV,
                                // чтобы экспорт учитывал все медиа товара
                                $videoNames[] = $url;
                                $videoCounter++;
                                $stats['videos_skipped']++;
                                $counter++;
                                continue;
                            }
                            $ext = strtolower(pathinfo($srcPath, PATHINFO_EXTENSION)) ?: 'mp4';
                            $zipName = $p['id'] . '-v' . $videoCounter . '.' . $ext;
                            $zip->addFile($srcPath, 'videos/' . $zipName);
                            $zip->setCompressionName('videos/' . $zipName, ZipArchive::CM_STORE); // mp4 уже сжат, STORE — в разы быстрее
                            $videoNames[] = $zipName;
                            $videoCounter++;
                            $stats['videos_packed']++;
                            $counter++;
                        } elseif (str_starts_with($url, 'http')) {
                            // YouTube/VK/RuTube/внешний URL — как есть в CSV
                            $videoNames[] = $url;
                            $counter++;
                        }
                        continue;
                    }

                    // картинка
                    if (str_starts_with($url, '/uploads/')) {
                        $srcPath = __DIR__ . '/../../../public' . $url;
                        if (!is_file($srcPath)) { $stats['images_skipped']++; $counter++; continue; }
                        $ext = strtolower(pathinfo($srcPath, PATHINFO_EXTENSION)) ?: 'jpg';
                        if ($ext === 'jpeg') $ext = 'jpg';
                        $zipName = $p['id'] . '-' . $imageCounter . '.' . $ext;
                        $zip->addFile($srcPath, 'images/' . $zipName);
                        $zip->setCompressionName('images/' . $zipName, ZipArchive::CM_STORE); // jpg/png не сжимаются повторно — скорость
                        $imageNames[] = $zipName;
                        $imageCounter++;
                        $stats['images_packed']++;
                        $counter++;
                    } elseif (str_starts_with($url, 'http')) {
                        // 1) Локальная копия из импорта — если есть, сеть не трогаем
                        $localFile = $localImages[$imageCounter] ?? null;
                        if ($localFile !== null && is_file($localFile)) {
                            $ext = strtolower(pathinfo($localFile, PATHINFO_EXTENSION)) ?: 'jpg';
                            if ($ext === 'jpeg') $ext = 'jpg';
                            $zipName = $p['id'] . '-' . $imageCounter . '.' . $ext;
                            $zip->addFile($localFile, 'images/' . $zipName);
                            $zip->setCompressionName('images/' . $zipName, ZipArchive::CM_STORE);
                            $imageNames[] = $zipName;
                            $imageCounter++;
                            $stats['images_packed']++;
                            $counter++;
                            continue;
                        }
                        // 2) Локальной нет — качаем с внешнего хоста (timeout 4 с); при неудаче
                        //    картинка всё равно попадает в CSV своим URL (см. ниже)
                        $ctx = stream_context_create(['http' => ['timeout' => 4]]);
                        $blob = @file_get_contents($url, false, $ctx);
                        if ($blob === false) {
                            // Ни локальной копии, ни сети — всё равно перечисляем картинку в CSV (её URL),
                            // чтобы экспорт учитывал ВСЕ доп. картинки товара
                            $imageNames[] = $url;
                            $imageCounter++;
                            $stats['images_skipped']++;
                            $counter++;
                            continue;
                        }
                        $urlPath = parse_url($url, PHP_URL_PATH) ?? '';
                        $ext = strtolower(pathinfo($urlPath, PATHINFO_EXTENSION)) ?: 'jpg';
                        if ($ext === 'jpeg') $ext = 'jpg';
                        if (!in_array($ext, self::COVER_EXT, true)) $ext = 'jpg';
                        $zipName = $p['id'] . '-' . $imageCounter . '.' . $ext;
                        $zip->addFromString('images/' . $zipName, $blob);
                        $imageNames[] = $zipName;
                        $imageCounter++;
                        $stats['images_downloaded']++;
                        $counter++;
                    }
                }

                $catSlug = $p['category_id'] ? ($catMap[(int)$p['category_id']] ?? '') : '';

                $row = [
                    $p['id'], $p['name'], $p['type'], $p['slug'], $p['sku'] ?? '',
                    $p['price_kopecks'] > 0 ? number_format($p['price_kopecks'] / 100, 2, '.', '') : '0',
                    $p['old_price_kopecks'] ? number_format($p['old_price_kopecks'] / 100, 2, '.', '') : '',
                    $p['stock_qty'], $p['weight_g'] ?? '', $p['length_cm'] ?? '',
                    $p['width_cm'] ?? '', $p['height_cm'] ?? '',
                    $p['manufacturer'] ?? '', $catSlug, $p['description'] ?? '',
                    implode(',', $imageNames),
                    implode(',', $videoNames),
                    $p['recipe_weight_g'] ?? '', $p['packaging_material'] ?? '',
                    $p['show_in_catalog'], $p['is_published'], $p['legacy_slug'] ?? '',
                ];
                $csv .= implode(';', array_map([self::class, 'csvEscape'], $row)) . "\n";
            }

            $zip->addFromString('products.csv', $csv);

            // Task 51: офлайн-редактор каталога внутри архива.
            // Пользователь открывает editor.html, перетаскивает ZIP (или products.csv),
            // правит таблицу и сохраняет готовый ZIP обратно — всё на стороне клиента.
            // __DIR__ = backend/src/Controllers → ../../resources = backend/resources
            $editorPath = __DIR__ . '/../../resources/product-editor.html';
            if (is_file($editorPath)) {
                $zip->addFromString('editor.html', (string)file_get_contents($editorPath));
            }

            $zip->close();

            if (!@rename($tmpPath, $finalPath)) {
                if (!@copy($tmpPath, $finalPath)) {
                    @unlink($tmpPath);
                    jsonResponse(['error' => 'Не удалось сохранить ZIP'], 500);
                }
                @unlink($tmpPath);
            }

            jsonResponse([
                'data' => [
                    'file' => 'exports/' . $filename,
                    'public_url' => '/exports/' . $filename, // готовая статическая ссылка — браузер просто скачивает файл
                    'size' => filesize($finalPath),
                    'stats' => $stats,
                ],
            ]);
        } catch (Throwable $e) {
            @$zip->close();
            @unlink($tmpPath);
            jsonResponse(['error' => $e->getMessage()], 500);
        }
    }

    public static function exportZipDownload(string $fileName): void
    {
        Auth::requireEditor();

        $fileName = basename($fileName);
        if (!preg_match('/^[a-z0-9\-]+\.zip$/i', $fileName)) {
            jsonResponse(['error' => 'Некорректное имя файла'], 400);
        }

        $path = __DIR__ . '/../../../public/exports/' . $fileName;
        if (!is_file($path)) {
            jsonResponse(['error' => 'Файл не найден (возможно истёк срок хранения)'], 404);
        }

        header_remove('Content-Type');
        header('Content-Type: application/zip');
        header("Content-Disposition: attachment; filename=\"$fileName\"");
        header('Content-Length: ' . filesize($path));
        header('Cache-Control: no-store');

        readfile($path);
        exit;
    }

    /* ============================================================
       ВНУТРЕННЕЕ
       ============================================================ */
    /* $uploadsRoot — корень файловой системы для медиа. По умолчанию — реальный
       public/. Тесты с копией БД ОБЯЗАНЫ передавать песочницу (напр. /tmp/fs),
       иначе импорт удалит/перезапишет файлы живого сайта (урок Task 51:
       no-op-тест на копии БД вытер 432 файла в public/uploads/products). */
    private static function applyImport(PDO $pdo, array $parsed, array $imageFiles, array $videoFiles, ?string $uploadsRoot = null): array
    {
        $stats = [
            'created' => 0,
            'updated' => 0,
            'images_copied' => 0,
            'videos_copied' => 0,
            'videos_external' => 0,
            'images_external' => 0,
            'images_missing' => [],
            'videos_missing' => [],
            'errors' => [],
        ];

        $pdo->exec('BEGIN IMMEDIATE');
        try {
            $findById    = $pdo->prepare('SELECT id, slug FROM products WHERE id = ?');
            $findBySlug  = $pdo->prepare('SELECT id, slug FROM products WHERE slug = ?');
            $catStmt     = $pdo->prepare('SELECT id FROM categories WHERE slug = ?');
            $recipeStmt  = $pdo->prepare('SELECT product_id, quantity FROM weight_recipes WHERE weight_g = ?');
            $clearBundle = $pdo->prepare('DELETE FROM bundle_items WHERE product_id = ?');
            $insertBundle = $pdo->prepare(
                'INSERT INTO bundle_items (product_id, component_id, quantity) VALUES (?, ?, ?)'
            );
            $clearMedia  = $pdo->prepare('DELETE FROM product_images WHERE product_id = ?');
            $insertMedia = $pdo->prepare(
                "INSERT INTO product_images (product_id, url, alt, media_type, sort_order)
                 VALUES (?, ?, ?, ?, ?)"
            );

            foreach ($parsed['rows'] as $r) {
                try {
                    $existing = null;
                    if ($r['id'] !== null) {
                        $findById->execute([$r['id']]);
                        $existing = $findById->fetch() ?: null;
                    }
                    if (!$existing && $r['slug'] !== null) {
                        $findBySlug->execute([$r['slug']]);
                        $existing = $findBySlug->fetch() ?: null;
                    }

                    $categoryId = null;
                    if ($r['category_slug'] !== null) {
                        $catStmt->execute([$r['category_slug']]);
                        $categoryId = $catStmt->fetchColumn() ?: null;
                    }

                    $showInCatalog = $r['type'] === 'recipe' ? 0 : $r['show_in_catalog'];

                    $slug = $r['slug'];
                    if ($slug === null) {
                        $slug = self::slugify($r['name']);
                    }
                    if ($existing) {
                        $checkSlug = $pdo->prepare('SELECT id FROM products WHERE slug = ? AND id <> ?');
                        $checkSlug->execute([$slug, $existing['id']]);
                        if ($checkSlug->fetchColumn()) $slug .= '-' . $existing['id'];
                    } else {
                        $checkSlug = $pdo->prepare('SELECT id FROM products WHERE slug = ?');
                        $checkSlug->execute([$slug]);
                        if ($checkSlug->fetchColumn()) $slug .= '-' . substr((string)time(), -5);
                    }

                    if ($existing) {
                        $upd = $pdo->prepare(
                            'UPDATE products SET
                                name = ?, type = ?, slug = ?, sku = ?,
                                price_kopecks = ?, old_price_kopecks = ?, stock_qty = ?,
                                weight_g = ?, length_cm = ?, width_cm = ?, height_cm = ?,
                                manufacturer = ?, category_id = ?, description = ?,
                                recipe_weight_g = ?, packaging_material = ?,
                                show_in_catalog = ?, is_published = ?, legacy_slug = ?
                             WHERE id = ?'
                        );
                        $upd->execute([
                            $r['name'], $r['type'], $slug, $r['sku'],
                            $r['price_kopecks'], $r['old_price_kopecks'], $r['stock_qty'],
                            $r['weight_g'], $r['length_cm'], $r['width_cm'], $r['height_cm'],
                            $r['manufacturer'], $categoryId, $r['description'],
                            $r['recipe_weight_g'], $r['packaging_material'],
                            $showInCatalog, $r['is_published'], $r['legacy_slug'],
                            $existing['id'],
                        ]);
                        $productId = (int)$existing['id'];
                        $stats['updated']++;
                    } else {
                        $ins = $pdo->prepare(
                            'INSERT INTO products
                                (name, type, slug, sku,
                                 price_kopecks, old_price_kopecks, stock_qty,
                                 weight_g, length_cm, width_cm, height_cm,
                                 manufacturer, category_id, description,
                                 recipe_weight_g, packaging_material,
                                 show_in_catalog, is_published, legacy_slug)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
                        );
                        $ins->execute([
                            $r['name'], $r['type'], $slug, $r['sku'],
                            $r['price_kopecks'], $r['old_price_kopecks'], $r['stock_qty'],
                            $r['weight_g'], $r['length_cm'], $r['width_cm'], $r['height_cm'],
                            $r['manufacturer'], $categoryId, $r['description'],
                            $r['recipe_weight_g'], $r['packaging_material'],
                            $showInCatalog, $r['is_published'], $r['legacy_slug'],
                        ]);
                        $productId = (int)$pdo->lastInsertId();
                        $stats['created']++;
                    }

                    if ($r['type'] === 'bundle' && $r['recipe_weight_g'] !== null) {
                        $clearBundle->execute([$productId]);
                        $recipeStmt->execute([$r['recipe_weight_g']]);
                        foreach ($recipeStmt->fetchAll() as $rec) {
                            $insertBundle->execute([$productId, (int)$rec['product_id'], (int)$rec['quantity']]);
                        }
                    }

                    // Медиа: чистим и вставляем заново.
                    // Порядок канонический, как в экспорте (media_type DESC, sort_order):
                    // сначала видео (sort 0..v-1), потом картинки (sort v..v+i-1) —
                    // так round-trip экспорт→импорт не меняет порядок на сайте.
                    $clearMedia->execute([$productId]);
                    $safeSlug = preg_replace('/[^a-z0-9\-]/', '', strtolower($slug)) ?: "p$productId";
                    $fsRoot = $uploadsRoot ?? (__DIR__ . '/../../../public');
                    $dir = $fsRoot . '/uploads/products/' . $safeSlug;
                    if (!is_dir($dir) && !@mkdir($dir, 0755, true)) {
                        $stats['errors'][] = "Строка {$r['_row_number']}: не удалось создать папку";
                        continue;
                    }
                    // Удаляем старые файлы
                    foreach (glob($dir . '/cover.*') as $old) @unlink($old);
                    foreach (glob($dir . '/[0-9]*.*') as $old) @unlink($old);
                    foreach (glob($dir . '/ext-*.*') as $old) @unlink($old);
                    foreach (glob($dir . '/video-*.*') as $old) @unlink($old);

                    // Видео (через запятую: URL или имена файлов из ZIP)
                    $vidSort = 0;
                    foreach ($r['video_items'] as $item) {
                        if (str_starts_with($item, 'http://') || str_starts_with($item, 'https://')) {
                            // внешний URL
                            $insertMedia->execute([$productId, $item, 'Видео', 'video', $vidSort]);
                            $vidSort++;
                            $stats['videos_external']++;
                        } else {
                            // файл из ZIP
                            $key = strtolower(basename($item));
                            if (!isset($videoFiles[$key])) {
                                $stats['videos_missing'][] = $item;
                                continue;
                            }
                            $src = $videoFiles[$key];
                            $ext = strtolower(pathinfo($src, PATHINFO_EXTENSION)) ?: 'mp4';
                            if (!in_array($ext, self::VIDEO_EXT, true)) continue;

                            $destName = 'video-' . $vidSort . '.' . $ext;
                            $dest = $dir . '/' . $destName;
                            if (!@copy($src, $dest)) continue;

                            $relUrl = '/uploads/products/' . $safeSlug . '/' . $destName;
                            $insertMedia->execute([$productId, $relUrl, 'Видео', 'video', $vidSort]);
                            $vidSort++;
                            $stats['videos_copied']++;
                        }
                    }

                    // Картинки (через запятую: имена файлов из ZIP или полные URL)
                    $imgSort = $vidSort; // продолжаем сортировку после видео
                    foreach ($r['image_files'] as $fileName) {
                        if (preg_match('#^https?://#i', $fileName)) {
                            // внешний URL — регистрируем как есть
                            $insertMedia->execute([$productId, $fileName, $r['name'], 'image', $imgSort]);
                            $imgSort++;
                            $stats['images_external']++;
                            continue;
                        }
                        $key = strtolower(basename($fileName));
                        if (!isset($imageFiles[$key])) {
                            $stats['images_missing'][] = $fileName;
                            continue;
                        }
                        $src = $imageFiles[$key];
                        $ext = strtolower(pathinfo($src, PATHINFO_EXTENSION));
                        if ($ext === 'jpeg') $ext = 'jpg';
                        if (!in_array($ext, self::COVER_EXT, true)) continue;

                        $destName = $imgSort . '.' . $ext;
                        $dest = $dir . '/' . $destName;
                        if (!@copy($src, $dest)) continue;

                        $relUrl = '/uploads/products/' . $safeSlug . '/' . $destName;
                        $insertMedia->execute([$productId, $relUrl, $r['name'], 'image', $imgSort]);
                        $imgSort++;
                        $stats['images_copied']++;
                    }
                } catch (Throwable $e) {
                    $stats['errors'][] = "Строка {$r['_row_number']}: " . $e->getMessage();
                }
            }

            $pdo->exec('COMMIT');
        } catch (Throwable $e) {
            $pdo->exec('ROLLBACK');
            throw $e;
        }

        return $stats;
    }

    private static function csvEscape(string|int|float|null $v): string
    {
        if ($v === null) return '';
        $s = (string)$v;
        if ($s === '') return '';
        if (strpbrk($s, ";,\"\n\r") !== false) {
            return '"' . str_replace('"', '""', $s) . '"';
        }
        return $s;
    }

    private static function cleanupTmp(string $dir): void
    {
        if (!is_dir($dir)) return;
        foreach (glob($dir . '/*') as $f) {
            if (is_dir($f)) {
                foreach (glob($f . '/*') as $sub) @unlink($sub);
                @rmdir($f);
            } else {
                @unlink($f);
            }
        }
        @rmdir($dir);
    }

    private static function slugify(string $s): string
    {
        $map = [
            'а'=>'a','б'=>'b','в'=>'v','г'=>'g','д'=>'d','е'=>'e','ё'=>'yo','ж'=>'zh',
            'з'=>'z','и'=>'i','й'=>'y','к'=>'k','л'=>'l','м'=>'m','н'=>'n','о'=>'o',
            'п'=>'p','р'=>'r','с'=>'s','т'=>'t','у'=>'u','ф'=>'f','х'=>'h','ц'=>'ts',
            'ч'=>'ch','ш'=>'sh','щ'=>'sch','ъ'=>'','ы'=>'y','ь'=>'','э'=>'e','ю'=>'yu','я'=>'ya',
        ];
        $s = mb_strtolower($s, 'UTF-8');
        $s = strtr($s, $map);
        $s = preg_replace('/[^a-z0-9]+/', '-', $s);
        $s = trim($s, '-');
        return ($s !== '' ? $s : 'product') . '-' . substr((string)time(), -5);
    }
}