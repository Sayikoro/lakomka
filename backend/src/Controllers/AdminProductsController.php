<?php

require_once __DIR__ . '/../Auth.php';

class AdminProductsController
{
    /* ============================================================
       СПИСОК
       GET /api/admin/products?q=...&filter=all|catalog|hidden|bundles|simple|recipe
       ============================================================ */
    public static function list(PDO $pdo): void
    {
        Auth::requireAuth();

        $search = trim($_GET['q'] ?? '');
        $filter = $_GET['filter'] ?? 'all';

        $sql = 'SELECT id, sku, slug, name, description, manufacturer, type,
                       price_kopecks, stock_qty, show_in_catalog, is_published,
                       category_id, video_url, packaging_material,
                       weight_g, length_cm, width_cm, height_cm,
                       recipe_weight_g
                FROM products WHERE 1=1';
        $params = [];

        if ($search !== '') {
            $sql .= ' AND (name LIKE ? OR sku LIKE ?)';
            $params[] = "%$search%";
            $params[] = "%$search%";
        }

        if ($filter === 'catalog') {
            $sql .= " AND show_in_catalog = 1 AND is_published = 1 AND type IN ('simple','bundle')";
        } elseif ($filter === 'hidden') {
            $sql .= ' AND (show_in_catalog = 0 OR is_published = 0)';
        } elseif ($filter === 'bundles') {
            $sql .= " AND type = 'bundle'";
        } elseif ($filter === 'simple') {
            $sql .= " AND type = 'simple'";
        } elseif ($filter === 'recipe') {
            $sql .= " AND type = 'recipe'";
        }

        $sql .= ' ORDER BY id DESC LIMIT 500';

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        jsonResponse(['data' => $stmt->fetchAll()]);
    }

    /* ============================================================
       ОДИН ТОВАР
       ============================================================ */
    public static function show(PDO $pdo, int $id): void
    {
        Auth::requireAuth();

        $stmt = $pdo->prepare('SELECT * FROM products WHERE id = ?');
        $stmt->execute([$id]);
        $product = $stmt->fetch();

        if (!$product) {
            jsonResponse(['error' => 'Товар не найден'], 404);
        }

        $img = $pdo->prepare(
            "SELECT id, url, alt, media_type, sort_order
             FROM product_images
             WHERE product_id = ?
             ORDER BY sort_order, id"
        );
        $img->execute([$id]);
        $rows = $img->fetchAll() ?: [];

        $product['media'] = array_map(fn($r) => [
            'id'         => (int)$r['id'],
            'type'       => $r['media_type'],
            'url'        => $r['url'],
            'alt'        => $r['alt'],
            'sort_order' => (int)$r['sort_order'],
        ], $rows);

        $product['images'] = array_values(array_map(fn($r) => [
            'id'         => (int)$r['id'],
            'url'        => $r['url'],
            'alt'        => $r['alt'],
            'sort_order' => (int)$r['sort_order'],
        ], array_filter($rows, fn($r) => $r['media_type'] === 'image')));

        jsonResponse(['data' => $product]);
    }

    /* ============================================================
       СОЗДАНИЕ
       ============================================================ */
    public static function create(PDO $pdo): void
    {
        Auth::requireAuth();

        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true);
        if (!is_array($data)) {
            jsonResponse(['error' => 'Invalid JSON'], 400);
        }

        $name = trim((string)($data['name'] ?? ''));
        if ($name === '') {
            jsonResponse(['error' => 'Укажите название'], 422);
        }
        if (mb_strlen($name) > 255) {
            jsonResponse(['error' => 'Название длиннее 255 символов'], 422);
        }

        $type = $data['type'] ?? 'simple';
        if (!in_array($type, ['simple', 'bundle', 'recipe'], true)) {
            jsonResponse(['error' => 'type: simple | bundle | recipe'], 422);
        }

        $slug = trim((string)($data['slug'] ?? ''));
        if ($slug === '') {
            $slug = self::slugify($name);
        }
        if (!preg_match('/^[a-z0-9\-]+$/', $slug)) {
            jsonResponse(['error' => 'Slug может содержать только латиницу, цифры и дефис'], 422);
        }
        $check = $pdo->prepare('SELECT 1 FROM products WHERE slug = ?');
        $check->execute([$slug]);
        if ($check->fetchColumn()) {
            jsonResponse(['error' => "Slug '$slug' уже занят"], 422);
        }

        $categoryId = null;
        if (isset($data['category_id']) && $data['category_id'] !== '' && $data['category_id'] !== null) {
            $categoryId = (int)$data['category_id'];
            $catCheck = $pdo->prepare('SELECT 1 FROM categories WHERE id = ?');
            $catCheck->execute([$categoryId]);
            if (!$catCheck->fetchColumn()) {
                jsonResponse(['error' => "Категория #$categoryId не найдена"], 422);
            }
        }

        $videoUrl = null;
        if (isset($data['video_url'])) {
            $v = trim((string)$data['video_url']);
            if ($v !== '') {
                if (!preg_match('#^https?://#i', $v)) {
                    jsonResponse(['error' => 'Ссылка на видео должна начинаться с http:// или https://'], 422);
                }
                $videoUrl = $v;
            }
        }

        $description = isset($data['description']) ? trim((string)$data['description']) : '';
        $manufacturer = isset($data['manufacturer']) ? trim((string)$data['manufacturer']) : '';

        $price = (int)($data['price_kopecks'] ?? 0);
        if ($price < 0) {
            jsonResponse(['error' => 'Цена не может быть отрицательной'], 422);
        }
        $stock = (int)($data['stock_qty'] ?? 0);
        if ($stock < 0) {
            jsonResponse(['error' => 'Остаток не может быть отрицательным'], 422);
        }

        $weight = isset($data['weight_g']) && $data['weight_g'] !== '' && $data['weight_g'] !== null
            ? (int)$data['weight_g'] : null;
        $length = isset($data['length_cm']) && $data['length_cm'] !== '' && $data['length_cm'] !== null
            ? (float)$data['length_cm'] : null;
        $width = isset($data['width_cm']) && $data['width_cm'] !== '' && $data['width_cm'] !== null
            ? (float)$data['width_cm'] : null;
        $height = isset($data['height_cm']) && $data['height_cm'] !== '' && $data['height_cm'] !== null
            ? (float)$data['height_cm'] : null;
        $packaging = isset($data['packaging_material']) && trim((string)$data['packaging_material']) !== ''
            ? trim((string)$data['packaging_material']) : null;

        // Для recipe всегда show_in_catalog = 0
        $showInCatalog = $type === 'recipe'
            ? 0
            : (int)(bool)($data['show_in_catalog'] ?? 1);

        $stmt = $pdo->prepare(
            'INSERT INTO products
                (sku, slug, name, description, manufacturer, type,
                 price_kopecks, stock_qty, category_id, video_url,
                 packaging_material, weight_g, length_cm, width_cm, height_cm,
                 show_in_catalog, is_published)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );

        try {
            $stmt->execute([
                isset($data['sku']) && trim((string)$data['sku']) !== ''
                    ? trim((string)$data['sku']) : null,
                $slug,
                $name,
                $description !== '' ? $description : null,
                $manufacturer !== '' ? $manufacturer : null,
                $type,
                $price,
                $stock,
                $categoryId,
                $videoUrl,
                $packaging,
                $weight,
                $length,
                $width,
                $height,
                $showInCatalog,
                (int)(bool)($data['is_published'] ?? 1),
            ]);
        } catch (PDOException $e) {
            if (str_contains($e->getMessage(), 'UNIQUE')) {
                jsonResponse(['error' => 'Нарушено уникальное поле (slug или sku)'], 422);
            }
            throw $e;
        }

        $newId = (int)$pdo->lastInsertId();

        // Автозаполнение по рецепту (если передан recipe_weight_g и type = bundle)
        $recipeWeight = isset($data['recipe_weight_g']) && $data['recipe_weight_g'] !== '' && $data['recipe_weight_g'] !== null
            ? (int)$data['recipe_weight_g'] : null;

        if ($recipeWeight && $type === 'bundle') {
            $recipeStmt = $pdo->prepare('SELECT product_id, quantity FROM weight_recipes WHERE weight_g = ?');
            $recipeStmt->execute([$recipeWeight]);
            $rows = $recipeStmt->fetchAll();

            if (!empty($rows)) {
                $ins = $pdo->prepare(
                    'INSERT INTO bundle_items (product_id, component_id, quantity) VALUES (?, ?, ?)
                     ON CONFLICT(product_id, component_id) DO UPDATE SET quantity = excluded.quantity'
                );
                foreach ($rows as $r) {
                    $ins->execute([$newId, (int)$r['product_id'], (int)$r['quantity']]);
                }
                $pdo->prepare('UPDATE products SET recipe_weight_g = ? WHERE id = ?')
                    ->execute([$recipeWeight, $newId]);
            }
        }

        jsonResponse([
            'data' => ['id' => $newId, 'slug' => $slug],
        ], 201);
    }

    /* ============================================================
       ОБНОВЛЕНИЕ
       ============================================================ */
    public static function update(PDO $pdo, int $id): void
    {
        Auth::requireAuth();

        $exists = $pdo->prepare('SELECT id, type FROM products WHERE id = ?');
        $exists->execute([$id]);
        $current = $exists->fetch();
        if (!$current) {
            jsonResponse(['error' => 'Товар не найден'], 404);
        }

        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true);
        if (!is_array($data)) {
            jsonResponse(['error' => 'Invalid JSON'], 400);
        }

        $fields = [];
        $params = [];

        if (array_key_exists('name', $data)) {
            $name = trim((string)$data['name']);
            if ($name === '') {
                jsonResponse(['error' => 'Название не может быть пустым'], 422);
            }
            if (mb_strlen($name) > 255) {
                jsonResponse(['error' => 'Название длиннее 255 символов'], 422);
            }
            $fields[] = 'name = ?';
            $params[] = $name;
        }

        if (array_key_exists('slug', $data)) {
            $slug = trim((string)$data['slug']);
            if ($slug === '') {
                jsonResponse(['error' => 'Slug не может быть пустым'], 422);
            }
            if (!preg_match('/^[a-z0-9\-]+$/', $slug)) {
                jsonResponse(['error' => 'Slug может содержать только латиницу, цифры и дефис'], 422);
            }
            $dup = $pdo->prepare('SELECT id FROM products WHERE slug = ? AND id <> ?');
            $dup->execute([$slug, $id]);
            if ($dup->fetchColumn()) {
                jsonResponse(['error' => "Slug '$slug' уже занят другим товаром"], 422);
            }
            $fields[] = 'slug = ?';
            $params[] = $slug;
        }

        if (array_key_exists('type', $data)) {
            $newType = (string)$data['type'];
            if (!in_array($newType, ['simple', 'bundle', 'recipe'], true)) {
                jsonResponse(['error' => 'type: simple | bundle | recipe'], 422);
            }
            // Нельзя менять тип bundle на другой, если есть состав
            if ($current['type'] === 'bundle' && $newType !== 'bundle') {
                $bundleCheck = $pdo->prepare('SELECT COUNT(*) FROM bundle_items WHERE product_id = ?');
                $bundleCheck->execute([$id]);
                if ((int)$bundleCheck->fetchColumn() > 0) {
                    jsonResponse(['error' => 'Нельзя сменить тип: у набора есть состав. Сначала очистите его.'], 422);
                }
            }
            $fields[] = 'type = ?';
            $params[] = $newType;
            // recipe автоматически снимает с каталога
            if ($newType === 'recipe') {
                $fields[] = 'show_in_catalog = 0';
            }
        }

        if (array_key_exists('sku', $data)) {
            $sku = $data['sku'];
            $fields[] = 'sku = ?';
            $params[] = ($sku === null || trim((string)$sku) === '') ? null : trim((string)$sku);
        }

        if (array_key_exists('description', $data)) {
            $d = trim((string)$data['description']);
            $fields[] = 'description = ?';
            $params[] = $d !== '' ? $d : null;
        }

        if (array_key_exists('manufacturer', $data)) {
            $m = trim((string)$data['manufacturer']);
            $fields[] = 'manufacturer = ?';
            $params[] = $m !== '' ? $m : null;
        }

        if (array_key_exists('price_kopecks', $data)) {
            $price = (int)$data['price_kopecks'];
            if ($price < 0) jsonResponse(['error' => 'Цена не может быть отрицательной'], 422);
            $fields[] = 'price_kopecks = ?';
            $params[] = $price;
        }

        if (array_key_exists('stock_qty', $data)) {
            $stock = (int)$data['stock_qty'];
            if ($stock < 0) jsonResponse(['error' => 'Остаток не может быть отрицательным'], 422);
            $fields[] = 'stock_qty = ?';
            $params[] = $stock;
        }

        if (array_key_exists('category_id', $data)) {
            $cid = $data['category_id'];
            if ($cid === null || $cid === '') {
                $fields[] = 'category_id = NULL';
            } else {
                $cid = (int)$cid;
                $check = $pdo->prepare('SELECT 1 FROM categories WHERE id = ?');
                $check->execute([$cid]);
                if (!$check->fetchColumn()) {
                    jsonResponse(['error' => "Категория #$cid не найдена"], 422);
                }
                $fields[] = 'category_id = ?';
                $params[] = $cid;
            }
        }

        if (array_key_exists('show_in_catalog', $data)) {
            $fields[] = 'show_in_catalog = ?';
            // recipe всегда 0
            $params[] = $current['type'] === 'recipe'
                ? 0
                : (int)(bool)$data['show_in_catalog'];
        }

        if (array_key_exists('is_published', $data)) {
            $fields[] = 'is_published = ?';
            $params[] = (int)(bool)$data['is_published'];
        }

        if (array_key_exists('video_url', $data)) {
            $v = trim((string)$data['video_url']);
            if ($v === '') {
                $fields[] = 'video_url = NULL';
            } else {
                if (!preg_match('#^https?://#i', $v)) {
                    jsonResponse(['error' => 'Ссылка на видео должна начинаться с http:// или https://'], 422);
                }
                $fields[] = 'video_url = ?';
                $params[] = $v;
            }
        }

        if (array_key_exists('legacy_slug', $data)) {
            $legacy = trim((string)$data['legacy_slug']);
            $fields[] = 'legacy_slug = ?';
            $params[] = $legacy !== '' ? $legacy : null;
        }

        if (array_key_exists('packaging_material', $data)) {
            $p = trim((string)$data['packaging_material']);
            $fields[] = 'packaging_material = ?';
            $params[] = $p !== '' ? $p : null;
        }
        if (array_key_exists('weight_g', $data)) {
            $w = $data['weight_g'];
            $fields[] = 'weight_g = ?';
            $params[] = ($w === null || $w === '') ? null : (int)$w;
        }
        foreach (['length_cm', 'width_cm', 'height_cm'] as $f) {
            if (array_key_exists($f, $data)) {
                $v = $data[$f];
                $fields[] = "$f = ?";
                $params[] = ($v === null || $v === '') ? null : (float)$v;
            }
        }
        if (array_key_exists('recipe_weight_g', $data)) {
            $rw = $data['recipe_weight_g'];
            $fields[] = 'recipe_weight_g = ?';
            $params[] = ($rw === null || $rw === '') ? null : (int)$rw;
        }

        if ($fields === []) {
            jsonResponse(['error' => 'Нет полей для обновления'], 422);
        }

        $params[] = $id;
        $sql = 'UPDATE products SET ' . implode(', ', $fields) . ' WHERE id = ?';

        try {
            $pdo->prepare($sql)->execute($params);
        } catch (PDOException $e) {
            if (str_contains($e->getMessage(), 'UNIQUE')) {
                jsonResponse(['error' => 'Нарушено уникальное поле (slug или legacy_wc_id)'], 422);
            }
            throw $e;
        }

        $get = $pdo->prepare('SELECT * FROM products WHERE id = ?');
        $get->execute([$id]);
        jsonResponse(['data' => $get->fetch()]);
    }

    /* ============================================================
       УДАЛЕНИЕ
       ============================================================ */
    public static function destroy(PDO $pdo, int $id): void
    {
        Auth::requireEditor();

        $exists = $pdo->prepare('SELECT id, type FROM products WHERE id = ?');
        $exists->execute([$id]);
        $row = $exists->fetch();
        if (!$row) {
            jsonResponse(['error' => 'Товар не найден'], 404);
        }

        // recipe может быть в рецептах
        if ($row['type'] === 'recipe') {
            $usedInRecipes = $pdo->prepare(
                'SELECT COUNT(*) FROM weight_recipes WHERE product_id = ?'
            );
            $usedInRecipes->execute([$id]);
            $cnt = (int)$usedInRecipes->fetchColumn();
            if ($cnt > 0) {
                jsonResponse([
                    'error' => "Конфета используется в $cnt записях рецептов. Удалите её из рецептов сначала.",
                ], 422);
            }
        }

        // Любой товар может быть в bundle_items как component
        $check = $pdo->prepare('SELECT COUNT(*) FROM bundle_items WHERE component_id = ?');
        $check->execute([$id]);
        $inBundles = (int)$check->fetchColumn();
        if ($inBundles > 0) {
            jsonResponse([
                'error' => "Товар входит в состав $inBundles наборов. Сначала уберите его из составов.",
            ], 422);
        }

        $img = $pdo->prepare('SELECT url FROM product_images WHERE product_id = ?');
        $img->execute([$id]);
        foreach ($img->fetchAll() as $r) {
            if (str_starts_with($r['url'], '/uploads/')) {
                $path = __DIR__ . '/../../../public' . $r['url'];
                if (is_file($path)) @unlink($path);
            }
        }

        $pdo->prepare('DELETE FROM bundle_items WHERE product_id = ?')->execute([$id]);
        $pdo->prepare('DELETE FROM product_images WHERE product_id = ?')->execute([$id]);
        $pdo->prepare('DELETE FROM weight_recipes WHERE product_id = ?')->execute([$id]);
        $pdo->prepare('DELETE FROM products WHERE id = ?')->execute([$id]);

        jsonResponse(['data' => ['ok' => true]]);
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