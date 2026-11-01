<?php

require_once __DIR__ . '/../Auth.php';
require_once __DIR__ . '/../RecipeCsvParser.php';
require_once __DIR__ . '/../ChunkedUpload.php';
require_once __DIR__ . '/../Paths.php';

class AdminWeightRecipeController
{
    private const COVER_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif'];

    /** Settings-ключ с «ручными» граммовками (созданы кнопкой, пустые группы) */
    private const CUSTOM_WEIGHTS_KEY = 'weight_custom_groups';

    public static function list(PDO $pdo): void
    {
        Auth::requireEditor();

        /* Task 114: граммовки теперь из трёх источников — рецепты (CSV/вручную),
           «свои позиции» (weight_recipe_items) и пустые группы, созданные
           кнопкой «+ Своя граммовка» (маркер в settings). */
        $map = [];
        foreach ($pdo->query(
            'SELECT weight_g, COUNT(*) AS items_count, SUM(quantity) AS total_qty
             FROM weight_recipes GROUP BY weight_g'
        )->fetchAll() as $r) {
            $map[(int)$r['weight_g']] = [
                'weight_g'    => (int)$r['weight_g'],
                'items_count' => (int)$r['items_count'],
                'total_qty'   => (int)$r['total_qty'],
                'has_custom'  => false,
            ];
        }
        foreach ($pdo->query(
            'SELECT weight_g, COUNT(*) AS c, SUM(quantity) AS q
             FROM weight_recipe_items GROUP BY weight_g'
        )->fetchAll() as $r) {
            $w = (int)$r['weight_g'];
            if (!isset($map[$w])) {
                $map[$w] = ['weight_g' => $w, 'items_count' => 0, 'total_qty' => 0, 'has_custom' => false];
            }
            $map[$w]['items_count'] += (int)$r['c'];
            $map[$w]['total_qty'] += (int)$r['q'];
            $map[$w]['has_custom'] = true;
        }
        foreach (self::customWeights($pdo) as $w) {
            if (!isset($map[$w])) {
                $map[$w] = ['weight_g' => $w, 'items_count' => 0, 'total_qty' => 0, 'has_custom' => false];
            }
        }
        ksort($map);

        jsonResponse(['data' => array_values($map)]);
    }

    public static function show(PDO $pdo, int $weightG): void
    {
        Auth::requireEditor();
        $stmt = $pdo->prepare(<<<SQL
            SELECT r.weight_g, r.quantity,
                   p.id AS product_id, p.name AS product_name,
                   p.manufacturer AS product_manufacturer,
                   p.sku AS product_sku,
                   p.weight_g AS product_weight_g,
                   (SELECT url FROM product_images
                    WHERE product_id = p.id AND media_type = 'image'
                    ORDER BY sort_order LIMIT 1) AS product_image_url
            FROM weight_recipes r
            JOIN products p ON p.id = r.product_id
            WHERE r.weight_g = ?
            ORDER BY p.name
        SQL);
        $stmt->execute([$weightG]);
        $rows = $stmt->fetchAll() ?: [];

        /* Свои позиции (Task 114): состав без карточки товара — упаковка,
           открытка и т.п. Идут после конфет, сортировка — по sort_order/id. */
        $cstmt = $pdo->prepare(
            'SELECT id, weight_g, name, quantity FROM weight_recipe_items
             WHERE weight_g = ? ORDER BY sort_order, id'
        );
        $cstmt->execute([$weightG]);
        $custom = array_map(static fn(array $r): array => [
            'id'       => (int)$r['id'],
            'weight_g' => (int)$r['weight_g'],
            'name'     => (string)$r['name'],
            'quantity' => (int)$r['quantity'],
        ], $cstmt->fetchAll() ?: []);

        jsonResponse(['data' => $rows, 'custom' => $custom]);
    }

    /* ─────────────────────────────────────────────────────────────
       Task 114: СВОИ ГРАММОВКИ И СВОИ ПОЗИЦИИ
       ───────────────────────────────────────────────────────────── */

    /** POST /api/admin/weight-recipes/weights {weight_g} — создать пустую
        граммовку (маркер в settings, чтобы группа не «испарилась» до того,
        как в ней появятся позиции). */
    public static function createWeight(PDO $pdo): void
    {
        Auth::requireEditor();
        $data = json_decode((string)file_get_contents('php://input'), true) ?? [];
        $w = (int)($data['weight_g'] ?? 0);
        if ($w <= 0 || $w > 1000000) {
            jsonResponse(['error' => 'Вес — целое число граммов от 1 до 1 000 000'], 422);
        }

        $weights = self::customWeights($pdo);
        if (!in_array($w, $weights, true)) {
            $weights[] = $w;
            sort($weights);
            self::saveCustomWeights($pdo, $weights);
        }
        jsonResponse(['data' => ['ok' => true, 'weights' => $weights]]);
    }

    /** DELETE /api/admin/weight-recipes/{w} — удалить граммовку целиком:
        конфеты рецепта, свои позиции и маркер пустой группы. */
    public static function deleteWeight(PDO $pdo, int $weightG): void
    {
        Auth::requireEditor();
        $pdo->prepare('DELETE FROM weight_recipes WHERE weight_g = ?')->execute([$weightG]);
        $pdo->prepare('DELETE FROM weight_recipe_items WHERE weight_g = ?')->execute([$weightG]);
        $weights = array_values(array_filter(
            self::customWeights($pdo),
            static fn(int $w): bool => $w !== $weightG
        ));
        self::saveCustomWeights($pdo, $weights);
        jsonResponse(['data' => ['ok' => true]]);
    }

    /** POST /api/admin/weight-recipes/{w}/custom {name, quantity} — своя позиция. */
    public static function addCustom(PDO $pdo, int $weightG): void
    {
        Auth::requireEditor();
        $data = json_decode((string)file_get_contents('php://input'), true) ?? [];
        $name = trim((string)($data['name'] ?? ''));
        $qty = (int)($data['quantity'] ?? 1);
        if ($name === '') jsonResponse(['error' => 'Укажите название позиции'], 422);
        if (mb_strlen($name) > 255) jsonResponse(['error' => 'Название длиннее 255 символов'], 422);
        if ($qty <= 0) jsonResponse(['error' => 'Количество — целое число больше 0'], 422);

        $pdo->prepare(
            'INSERT INTO weight_recipe_items (weight_g, name, quantity) VALUES (?, ?, ?)'
        )->execute([$weightG, $name, $qty]);

        jsonResponse(['data' => ['ok' => true, 'id' => (int)$pdo->lastInsertId()]]);
    }

    /** POST /api/admin/weight-recipes/{w}/custom/{id} {name?, quantity?} — правка. */
    public static function updateCustom(PDO $pdo, int $weightG, int $id): void
    {
        Auth::requireEditor();
        $data = json_decode((string)file_get_contents('php://input'), true) ?? [];
        $cur = $pdo->prepare('SELECT name, quantity FROM weight_recipe_items WHERE id = ? AND weight_g = ?');
        $cur->execute([$id, $weightG]);
        $row = $cur->fetch();
        if (!$row) jsonResponse(['error' => 'Позиция не найдена'], 404);

        $name = array_key_exists('name', $data) ? trim((string)$data['name']) : (string)$row['name'];
        $qty = array_key_exists('quantity', $data) ? (int)$data['quantity'] : (int)$row['quantity'];
        if ($name === '') jsonResponse(['error' => 'Название не может быть пустым'], 422);
        if (mb_strlen($name) > 255) jsonResponse(['error' => 'Название длиннее 255 символов'], 422);
        if ($qty <= 0) jsonResponse(['error' => 'Количество — целое число больше 0'], 422);

        $pdo->prepare('UPDATE weight_recipe_items SET name = ?, quantity = ? WHERE id = ?')
            ->execute([$name, $qty, $id]);
        jsonResponse(['data' => ['ok' => true]]);
    }

    /** DELETE /api/admin/weight-recipes/{w}/custom/{id} — убрать позицию. */
    public static function removeCustom(PDO $pdo, int $weightG, int $id): void
    {
        Auth::requireEditor();
        $pdo->prepare('DELETE FROM weight_recipe_items WHERE id = ? AND weight_g = ?')
            ->execute([$id, $weightG]);
        jsonResponse(['data' => ['ok' => true]]);
    }

    /** POST /api/admin/weight-recipes/product-weight {product_id, weight_g} —
        задать/убрать вес конфеты прямо из таблицы рецепта (пусто/0 → NULL).
        «Кастомные товары, у которых нет веса, но они есть в составе». */
    public static function setProductWeight(PDO $pdo): void
    {
        Auth::requireEditor();
        $data = json_decode((string)file_get_contents('php://input'), true) ?? [];
        $productId = (int)($data['product_id'] ?? 0);
        if ($productId <= 0) jsonResponse(['error' => 'product_id обязателен'], 422);

        $exists = $pdo->prepare('SELECT 1 FROM products WHERE id = ?');
        $exists->execute([$productId]);
        if (!$exists->fetchColumn()) jsonResponse(['error' => 'Товар не найден'], 404);

        $raw = $data['weight_g'] ?? null;
        if ($raw === null || $raw === '' || (int)$raw === 0) {
            $weight = null;
        } else {
            $weight = (int)$raw;
            if ($weight < 0 || $weight > 1000000) {
                jsonResponse(['error' => 'Вес — целое число граммов от 1 до 1 000 000 или пусто'], 422);
            }
        }

        $pdo->prepare('UPDATE products SET weight_g = ? WHERE id = ?')->execute([$weight, $productId]);
        jsonResponse(['data' => ['ok' => true, 'weight_g' => $weight]]);
    }

    /** @return int[] «Ручные» граммовки из settings (пустые группы). */
    private static function customWeights(PDO $pdo): array
    {
        $stmt = $pdo->prepare("SELECT value FROM settings WHERE key = ?");
        $stmt->execute([self::CUSTOM_WEIGHTS_KEY]);
        $raw = (string)($stmt->fetchColumn() ?: '');
        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) return [];
        $out = [];
        foreach ($decoded as $v) {
            $w = (int)$v;
            if ($w > 0 && $w <= 1000000) $out[] = $w;
        }
        return array_values(array_unique($out));
    }

    private static function saveCustomWeights(PDO $pdo, array $weights): void
    {
        $json = json_encode(array_map('intval', $weights), JSON_UNESCAPED_UNICODE);
        $stmt = $pdo->prepare(
            'INSERT INTO settings (key, value) VALUES (?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value'
        );
        $stmt->execute([self::CUSTOM_WEIGHTS_KEY, $json]);
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
        $dir = Paths::uploadsRoot() . '/products/' . $safeSlug;
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

    /** Task 117: DELETE /api/admin/products/{id}/cover — убрать фото конфеты
        (обложку): файл cover.* с диска + запись в product_images. Нужен
        справочнику конфет — раньше фото можно было только заменить. */
    public static function deleteProductCover(PDO $pdo, int $productId): void
    {
        Auth::requireEditor();

        $stmt = $pdo->prepare('SELECT slug FROM products WHERE id = ?');
        $stmt->execute([$productId]);
        $slug = $stmt->fetchColumn();
        if ($slug === false) jsonResponse(['error' => 'Товар не найден'], 404);

        $safeSlug = preg_replace('/[^a-z0-9\-]/', '', strtolower((string)$slug)) ?: "p$productId";

        $sel = $pdo->prepare(
            "SELECT id, url FROM product_images WHERE product_id = ? AND url LIKE ?"
        );
        $sel->execute([$productId, '/uploads/products/' . $safeSlug . '/cover.%']);
        $rows = $sel->fetchAll() ?: [];
        if ($rows === []) {
            jsonResponse(['error' => 'У конфеты нет фото'], 404);
        }

        foreach ($rows as $r) {
            if (str_starts_with($r['url'], '/uploads/')) {
                $path = Paths::publicRoot() . $r['url'];
                if (is_file($path)) @unlink($path);
            }
        }
        $del = $pdo->prepare('DELETE FROM product_images WHERE id = ?');
        foreach ($rows as $r) {
            $del->execute([(int)$r['id']]);
        }

        jsonResponse(['data' => ['ok' => true, 'removed' => count($rows)]]);
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

            // 1.5. Производители (Task 117): колонка «ПРОИЗВОДИТЕЛЬ» раньше
            //      терялась — импортированные конфеты оставались без неё.
            //      ЗАПОЛНЯЕМ ТОЛЬКО ПУСТЫЕ: ручные правки владельца не
            //      перезатираются, CSV — источник для пропусков.
            $stats['manufacturers_filled'] = 0;
            if (!empty($parsed['product_manufacturers'])) {
                $updMan = $pdo->prepare(
                    "UPDATE products SET manufacturer = ?
                     WHERE id = ? AND (manufacturer IS NULL OR manufacturer = '')"
                );
                foreach ($parsed['product_manufacturers'] as $pid => $man) {
                    $updMan->execute([$man, $pid]);
                    $stats['manufacturers_filled'] += $updMan->rowCount();
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
                    $dir = Paths::uploadsRoot() . '/products/' . $safeSlug;
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
                'manufacturers_filled' => $stats['manufacturers_filled'] ?? 0,
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