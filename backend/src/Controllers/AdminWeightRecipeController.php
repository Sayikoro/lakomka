<?php

require_once __DIR__ . '/../Auth.php';
require_once __DIR__ . '/../RecipeCsvParser.php';
require_once __DIR__ . '/../ChunkedUpload.php';

class AdminWeightRecipeController
{
    private const COVER_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif'];

    public static function list(PDO $pdo): void
    {
        Auth::requireEditor();
        $rows = $pdo->query(<<<SQL
            SELECT weight_g, COUNT(*) AS items_count, SUM(quantity) AS total_qty
            FROM weight_recipes
            GROUP BY weight_g
            ORDER BY weight_g
        SQL)->fetchAll();
        jsonResponse(['data' => $rows]);
    }

    public static function show(PDO $pdo, int $weightG): void
    {
        Auth::requireEditor();
        $stmt = $pdo->prepare(<<<SQL
            SELECT r.weight_g, r.quantity,
                   p.id AS product_id, p.name AS product_name,
                   p.manufacturer AS product_manufacturer,
                   p.sku AS product_sku,
                   (SELECT url FROM product_images
                    WHERE product_id = p.id AND media_type = 'image'
                    ORDER BY sort_order LIMIT 1) AS product_image_url
            FROM weight_recipes r
            JOIN products p ON p.id = r.product_id
            WHERE r.weight_g = ?
            ORDER BY p.name
        SQL);
        $stmt->execute([$weightG]);
        jsonResponse(['data' => $stmt->fetchAll()]);
    }

    public static function upsert(PDO $pdo, int $weightG): void
    {
        Auth::requireEditor();
        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true);
        if (!is_array($data)) jsonResponse(['error' => 'Invalid JSON'], 400);

        $productId = (int)($data['product_id'] ?? 0);
        $qty = (int)($data['quantity'] ?? 0);
        if ($productId <= 0) jsonResponse(['error' => 'product_id обязателен'], 422);
        if ($qty <= 0) jsonResponse(['error' => 'quantity > 0'], 422);

        $exists = $pdo->prepare('SELECT 1 FROM products WHERE id = ?');
        $exists->execute([$productId]);
        if (!$exists->fetchColumn()) jsonResponse(['error' => 'Товар не найден'], 404);

        $pdo->prepare(
            'INSERT INTO weight_recipes (weight_g, product_id, quantity) VALUES (?, ?, ?)
             ON CONFLICT(weight_g, product_id) DO UPDATE SET quantity = excluded.quantity'
        )->execute([$weightG, $productId, $qty]);

        jsonResponse(['data' => ['ok' => true]]);
    }

    public static function remove(PDO $pdo, int $weightG, int $productId): void
    {
        Auth::requireEditor();
        $pdo->prepare('DELETE FROM weight_recipes WHERE weight_g = ? AND product_id = ?')
            ->execute([$weightG, $productId]);
        jsonResponse(['data' => ['ok' => true]]);
    }

    public static function importCsv(PDO $pdo): void
    {
        Auth::requireEditor();
        if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
            jsonResponse(['error' => 'Файл не загружен'], 422);
        }
        try {
            $parsed = RecipeCsvParser::parse($_FILES['file']['tmp_name'], $pdo);
        } catch (Throwable $e) {
            jsonResponse(['error' => $e->getMessage()], 422);
        }
        self::applyParsed($pdo, $parsed, []);
    }

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
            $errCode = (int)$openResult;
            $errMsg = match ($errCode) {
                ZipArchive::ER_NOENT  => 'Файл не найден',
                ZipArchive::ER_NOZIP  => 'Файл не является ZIP-архивом',
                ZipArchive::ER_INCONS => 'ZIP-архив повреждён',
                ZipArchive::ER_MEMORY => 'Недостаточно памяти',
                ZipArchive::ER_READ   => 'Ошибка чтения',
                default               => "Не удалось открыть ZIP (код: $errCode)",
            };
            jsonResponse(['error' => $errMsg], 422);
        }

        // Найдём CSV
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
            jsonResponse(['error' => 'В ZIP нет CSV файла'], 422);
        }

        // Распакуем images/ во временную папку
        $tmpDir = sys_get_temp_dir() . '/recipe-images-' . bin2hex(random_bytes(4));
        @mkdir($tmpDir, 0755, true);

        $imageFiles = [];  // lowercase basename => absolute path
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $n = $zip->getNameIndex($i);
            if (str_ends_with($n, '/')) continue;
            if (preg_match('#(^|/)images/(.+)$#i', $n, $m)) {
                $base = basename($m[2]);
                $base = preg_replace('/[^\p{L}\p{N}._\- ]/u', '_', $base);
                $target = $tmpDir . '/' . $base;
                file_put_contents($target, $zip->getFromIndex($i));
                $imageFiles[strtolower($base)] = $target;
            }
        }
        $zip->close();

        // CSV в temp-файл
        $csvPath = $tmpDir . '/__data.csv';
        file_put_contents($csvPath, $csvContent);

        try {
            $parsed = RecipeCsvParser::parse($csvPath, $pdo);
        } catch (Throwable $e) {
            self::cleanupTmp($tmpDir);
            ChunkedUpload::removeFile($fileName);
            jsonResponse(['error' => $e->getMessage()], 422);
        }

        self::applyParsed($pdo, $parsed, $imageFiles);

        self::cleanupTmp($tmpDir);
        ChunkedUpload::removeFile($fileName);
    }

    public static function uploadProductCover(PDO $pdo, int $productId): void
    {
        Auth::requireEditor();

        $stmt = $pdo->prepare('SELECT slug, name FROM products WHERE id = ?');
        $stmt->execute([$productId]);
        $product = $stmt->fetch();
        if (!$product) jsonResponse(['error' => 'Товар не найден'], 404);

        if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
            jsonResponse(['error' => 'Файл не загружен'], 422);
        }
        $file = $_FILES['file'];
        if ($file['size'] > 8 * 1024 * 1024) {
            jsonResponse(['error' => 'Файл больше 8 MB'], 422);
        }
        $mime = mime_content_type($file['tmp_name']);
        $extMap = [
            'image/jpeg' => 'jpg', 'image/png' => 'png',
            'image/webp' => 'webp', 'image/gif' => 'gif',
        ];
        if (!isset($extMap[$mime])) {
            jsonResponse(['error' => "Формат не поддерживается: $mime"], 422);
        }
        $ext = $extMap[$mime];

        $safeSlug = preg_replace('/[^a-z0-9\-]/', '', strtolower($product['slug'])) ?: "p$productId";
        $dir = __DIR__ . '/../../../public/uploads/products/' . $safeSlug;
        if (!is_dir($dir)) mkdir($dir, 0755, true);

        foreach (glob($dir . '/cover.*') as $old) @unlink($old);

        $coverFile = 'cover.' . $ext;
        if (!move_uploaded_file($file['tmp_name'], $dir . '/' . $coverFile)) {
            jsonResponse(['error' => 'Не удалось сохранить файл'], 500);
        }

        $relUrl = '/uploads/products/' . $safeSlug . '/' . $coverFile;

        $check = $pdo->prepare(
            "SELECT id FROM product_images WHERE product_id = ? AND url LIKE ? LIMIT 1"
        );
        $check->execute([$productId, '/uploads/products/' . $safeSlug . '/cover.%']);
        $existingId = (int)$check->fetchColumn();

        if ($existingId > 0) {
            $pdo->prepare('UPDATE product_images SET url = ?, alt = ? WHERE id = ?')
                ->execute([$relUrl, $product['name'], $existingId]);
        } else {
            $pdo->prepare('UPDATE product_images SET sort_order = sort_order + 1 WHERE product_id = ?')
                ->execute([$productId]);
            $pdo->prepare(
                "INSERT INTO product_images (product_id, url, alt, media_type, sort_order)
                 VALUES (?, ?, ?, 'image', 0)"
            )->execute([$productId, $relUrl, $product['name']]);
        }

        jsonResponse(['data' => ['url' => $relUrl]]);
    }

    /* ============================================================
       ВНУТРЕННЕЕ
       ============================================================ */

    /**
     * Принимает $imageFiles = [lowercase basename => absolute path]
     * Сопоставляет картинки с товарами по трём приоритетам:
     *   1) {product_id}.{ext}  (например 1.png → products.id = 1) — ОСНОВНОЙ
     *   2) имя файла из CSV-колонки КАРТИНКА
     *   3) slugify(имя товара) — если файлы названы по имени
     */
    private static function applyParsed(PDO $pdo, array $parsed, array $imageFiles): void
    {
        if ($parsed['total_entries'] === 0) {
            jsonResponse([
                'error' => 'Не найдено ни одной записи. Проверьте формат CSV.',
                'missing' => $parsed['missing'],
            ], 422);
        }

        // Составляем map: pid => путь к картинке
        $pidToImage = [];      // pid => ['path' => '/tmp/...', 'source' => 'id|name|slug']
        $usedFileKeys = [];    // какие файлы уже задействованы
        $stats = [
            'copied' => 0,
            'by_id' => 0,
            'by_name' => 0,
            'by_slug' => 0,
            'unmatched_files' => [],   // файлы из ZIP, к которым не нашли товар
            'missing_files' => [],     // из CSV указаны, но в ZIP нет
        ];

        if (!empty($imageFiles)) {
            // 1) По product_id
            foreach ($imageFiles as $basename => $srcPath) {
                $base = pathinfo($basename, PATHINFO_FILENAME);
                if (!ctype_digit($base)) continue;

                $pid = (int)$base;
                $exists = $pdo->prepare('SELECT 1 FROM products WHERE id = ?');
                $exists->execute([$pid]);
                if (!$exists->fetchColumn()) continue;

                $pidToImage[$pid] = ['path' => $srcPath, 'source' => 'id'];
                $usedFileKeys[$basename] = true;
                $stats['by_id']++;
            }

            // 2) По имени из CSV-колонки КАРТИНКА
            foreach ($parsed['product_images'] ?? [] as $pid => $imgName) {
                if (isset($pidToImage[$pid])) continue; // уже нашли по id
                $key = strtolower(basename($imgName));
                if (!isset($imageFiles[$key])) {
                    $stats['missing_files'][] = $imgName;
                    continue;
                }
                $pidToImage[$pid] = ['path' => $imageFiles[$key], 'source' => 'name'];
                $usedFileKeys[$key] = true;
                $stats['by_name']++;
            }

            // 3) По транслиту названия (fallback — если файлы названы по имени)
            $notResolved = $pdo->query(
                "SELECT id, name FROM products WHERE type IN ('simple', 'recipe')"
            )->fetchAll();

            foreach ($notResolved as $p) {
                $pid = (int)$p['id'];
                if (isset($pidToImage[$pid])) continue;

                $slug = self::translitSlug($p['name']);
                if ($slug === '') continue;

                // ищем {slug}.{ext}
                foreach (self::COVER_EXT as $ext) {
                    $try1 = strtolower($slug . '.' . $ext);
                    $try2 = strtolower($slug . '.jpg');
                    if (isset($imageFiles[$try1])) {
                        $pidToImage[$pid] = ['path' => $imageFiles[$try1], 'source' => 'slug'];
                        $usedFileKeys[$try1] = true;
                        $stats['by_slug']++;
                        break;
                    }
                }
            }

            // Неиспользованные файлы → в отчёт
            foreach ($imageFiles as $basename => $path) {
                if (!isset($usedFileKeys[$basename])) {
                    $stats['unmatched_files'][] = $basename;
                }
            }
        }

        // ---- Пишем в БД ----
        $pdo->exec('BEGIN IMMEDIATE');
        try {
            // 1. Рецепты
            $pdo->exec('DELETE FROM weight_recipes');
            $ins = $pdo->prepare(
                'INSERT INTO weight_recipes (weight_g, product_id, quantity) VALUES (?, ?, ?)'
            );
            foreach ($parsed['rows'] as $w => $map) {
                foreach ($map as $pid => $qty) {
                    $ins->execute([$w, $pid, $qty]);
                }
            }

            // 2. Картинки
            if (!empty($pidToImage)) {
                $slugStmt = $pdo->prepare('SELECT slug, name FROM products WHERE id = ?');
                $checkImg = $pdo->prepare(
                    "SELECT id FROM product_images WHERE product_id = ? AND url LIKE ? LIMIT 1"
                );

                foreach ($pidToImage as $pid => $info) {
                    $src = $info['path'];
                    $ext = strtolower(pathinfo($src, PATHINFO_EXTENSION));
                    if ($ext === 'jpeg') $ext = 'jpg';
                    if (!in_array($ext, self::COVER_EXT, true)) continue;

                    $slugStmt->execute([$pid]);
                    $p = $slugStmt->fetch();
                    if (!$p) continue;

                    $safeSlug = preg_replace('/[^a-z0-9\-]/', '', strtolower($p['slug'])) ?: "p$pid";
                                        $dir = __DIR__ . '/../../../public/uploads/products/' . $safeSlug;
                    if (!is_dir($dir) && !@mkdir($dir, 0755, true)) continue;

                    foreach (glob($dir . '/cover.*') as $old) @unlink($old);
                    $dest = $dir . '/cover.' . $ext;
                    if (!copy($src, $dest)) continue;

                    $relUrl = '/uploads/products/' . $safeSlug . '/cover.' . $ext;

                    $checkImg->execute([$pid, '/uploads/products/' . $safeSlug . '/cover.%']);
                    $existId = (int)$checkImg->fetchColumn();

                    if ($existId > 0) {
                        $pdo->prepare('UPDATE product_images SET url = ?, alt = ? WHERE id = ?')
                            ->execute([$relUrl, $p['name'], $existId]);
                    } else {
                        $pdo->prepare(
                            'UPDATE product_images SET sort_order = sort_order + 1 WHERE product_id = ?'
                        )->execute([$pid]);
                        $pdo->prepare(
                            "INSERT INTO product_images (product_id, url, alt, media_type, sort_order)
                             VALUES (?, ?, ?, 'image', 0)"
                        )->execute([$pid, $relUrl, $p['name']]);
                    }
                    $stats['copied']++;
                }
            }

            $pdo->exec('COMMIT');
        } catch (Throwable $e) {
            $pdo->exec('ROLLBACK');
            jsonResponse(['error' => 'Ошибка БД: ' . $e->getMessage()], 500);
        }

        jsonResponse([
            'data' => [
                'weights' => $parsed['weights'],
                'rows_processed' => $parsed['rows_processed'],
                'resolved' => $parsed['resolved'],
                'total_entries' => $parsed['total_entries'],
                'missing' => $parsed['missing'],
                'images' => $stats,
            ],
        ]);
    }

    private static function translitSlug(string $s): string
    {
        $map = [
            'а'=>'a','б'=>'b','в'=>'v','г'=>'g','д'=>'d','е'=>'e','ё'=>'yo','ж'=>'zh',
            'з'=>'z','и'=>'i','й'=>'y','к'=>'k','л'=>'l','м'=>'m','н'=>'n','о'=>'o',
            'п'=>'p','р'=>'r','с'=>'s','т'=>'t','у'=>'u','ф'=>'f','х'=>'h','ц'=>'ts',
            'ч'=>'ch','ш'=>'sh','щ'=>'sch','ъ'=>'','ы'=>'y','ь'=>'','э'=>'e','ю'=>'yu','я'=>'ya',
        ];
        $s = mb_strtolower(trim($s), 'UTF-8');
        $s = strtr($s, $map);
        $s = preg_replace('/[^a-z0-9]+/', '-', $s);
        $s = trim($s, '-');
        return $s;
    }

    private static function cleanupTmp(string $dir): void
    {
        if (!is_dir($dir)) return;
        foreach (glob($dir . '/*') as $f) @unlink($f);
        @rmdir($dir);
    }

    public static function fillBundleByWeight(PDO $pdo, int $productId): void
    {
        Auth::requireEditor();
        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true) ?? [];
        $weightG = (int)($data['weight_g'] ?? 0);
        $mode = (string)($data['mode'] ?? 'replace');

        if ($weightG <= 0) jsonResponse(['error' => 'weight_g обязателен'], 422);
        if (!in_array($mode, ['replace', 'add'], true)) {
            jsonResponse(['error' => 'mode: replace | add'], 422);
        }

        $prodStmt = $pdo->prepare('SELECT type FROM products WHERE id = ?');
        $prodStmt->execute([$productId]);
        $type = $prodStmt->fetchColumn();
        if (!$type) jsonResponse(['error' => 'Товар не найден'], 404);
        if ($type !== 'bundle') jsonResponse(['error' => 'Только для наборов'], 422);

        $recipeStmt = $pdo->prepare('SELECT product_id, quantity FROM weight_recipes WHERE weight_g = ?');
        $recipeStmt->execute([$weightG]);
        $recipeMap = [];
        foreach ($recipeStmt->fetchAll() as $r) {
            $recipeMap[(int)$r['product_id']] = (int)$r['quantity'];
        }
        if (empty($recipeMap)) {
            jsonResponse(['error' => "Рецепт для {$weightG} г пуст"], 422);
        }

        $currentStmt = $pdo->prepare('SELECT component_id, quantity FROM bundle_items WHERE product_id = ?');
        $currentStmt->execute([$productId]);
        $currentMap = [];
        foreach ($currentStmt->fetchAll() as $r) {
            $currentMap[(int)$r['component_id']] = (int)$r['quantity'];
        }

        if ($mode === 'replace') {
            $same = count($currentMap) === count($recipeMap);
            if ($same) {
                foreach ($recipeMap as $pid => $qty) {
                    if (!isset($currentMap[$pid]) || $currentMap[$pid] !== $qty) {
                        $same = false;
                        break;
                    }
                }
            }
            if ($same) {
                $pdo->prepare('UPDATE products SET recipe_weight_g = ? WHERE id = ?')
                    ->execute([$weightG, $productId]);
                jsonResponse(['data' => [
                    'changed' => false, 'matched' => true, 'items' => count($recipeMap),
                ]]);
            }
        }

        $pdo->exec('BEGIN IMMEDIATE');
        try {
            if ($mode === 'replace') {
                $pdo->prepare('DELETE FROM bundle_items WHERE product_id = ?')->execute([$productId]);
            }
            $ins = $pdo->prepare(
                'INSERT INTO bundle_items (product_id, component_id, quantity) VALUES (?, ?, ?)
                 ON CONFLICT(product_id, component_id) DO UPDATE SET quantity = excluded.quantity'
            );
            foreach ($recipeMap as $pid => $qty) {
                $ins->execute([$productId, $pid, $qty]);
            }
            $pdo->prepare('UPDATE products SET recipe_weight_g = ? WHERE id = ?')
                ->execute([$weightG, $productId]);
            $pdo->exec('COMMIT');
        } catch (Throwable $e) {
            $pdo->exec('ROLLBACK');
            jsonResponse(['error' => $e->getMessage()], 500);
        }

        jsonResponse(['data' => [
            'changed' => true, 'matched' => false,
            'items' => count($recipeMap), 'mode' => $mode,
        ]]);
    }
}