<?php

require_once __DIR__ . '/../Auth.php';
require_once __DIR__ . '/../AdminLog.php';
require_once __DIR__ . '/../Paths.php';

class AdminProductsController
{
    /* ============================================================
       СПИСОК
       GET /api/admin/products?q=...&filter=all|catalog|hidden|bundles|simple|recipe

       Task 121: серверная пагинация. Без page= — старый режим
       (LIMIT 500, ответ {data}), им пользуются WeightRecipesViewer,
       BundleEditor и корзина. С page= — новый:
         page (1..N), per_page (10–200, по умолчанию 50),
         sort=default|name_asc|name_desc|price_asc|price_desc,
         category=<id>, price_min/price_max (копейки),
         weight_min/weight_max (граммы).
       Ответ: {data, total, page, per_page, pages, price_min, price_max,
               weight_steps[], categories_present[]}
       (bounds/ступени/категории считаются по набору q+filter+category —
       чтобы ползунки не «прыгали» при смене своих же значений).
       ============================================================ */
    private const SELECT_COLS = 'SELECT id, sku, slug, name, description, manufacturer, type,
                       price_kopecks, stock_qty, show_in_catalog, is_published,
                       category_id, video_url, packaging_material,
                       weight_g, length_cm, width_cm, height_cm,
                       recipe_weight_g, deleted_at
                FROM products';

    /** Порог «заканчивается» — настройка low_stock_threshold (default 5).
     *  Одна логика с AdminDashboardController::alerts (Task 152). */
    private static function lowStockThreshold(PDO $pdo): int
    {
        $st = $pdo->prepare("SELECT value FROM settings WHERE key = 'low_stock_threshold'");
        $st->execute();
        if ($row = $st->fetch()) {
            $custom = (int)$row['value'];
            if ($custom >= 0 && $custom <= 1000) return $custom;
        }
        return 5;
    }

    public static function list(PDO $pdo): void
    {
        Auth::requireAuth();

        $search = trim($_GET['q'] ?? '');
        $filter = $_GET['filter'] ?? 'all';

        $where = ' WHERE 1=1';
        $params = [];

        if ($search !== '') {
            $where .= ' AND (name LIKE ? OR sku LIKE ?)';
            $params[] = "%$search%";
            $params[] = "%$search%";
        }

        if ($filter === 'catalog') {
            $where .= " AND deleted_at IS NULL AND show_in_catalog = 1 AND is_published = 1 AND type IN ('simple','bundle')";
        } elseif ($filter === 'hidden') {
            $where .= ' AND deleted_at IS NULL AND (show_in_catalog = 0 OR is_published = 0)';
        } elseif ($filter === 'bundles') {
            $where .= " AND deleted_at IS NULL AND type = 'bundle'";
        } elseif ($filter === 'simple') {
            $where .= " AND deleted_at IS NULL AND type = 'simple'";
        } elseif ($filter === 'recipe') {
            $where .= " AND deleted_at IS NULL AND type = 'recipe'";
        } elseif ($filter === 'deleted') {
            /* Корзина: только мягко-удалённые (Task 100) */
            $where .= ' AND deleted_at IS NOT NULL';
        } elseif ($filter === 'low_stock') {
            /* Task 152: плитка-тревога «Товары заканчиваются» — опубликованные
             * товары с остатком не выше порога (настройка low_stock_threshold,
             * по умолчанию 5 — той же логике следует AdminDashboardController). */
            $threshold = self::lowStockThreshold($pdo);
            $where .= ' AND deleted_at IS NULL AND is_published = 1 AND stock_qty <= ' . $threshold;
        } else {
            /* По умолчанию удалённые (в корзине) не показываем */
            $where .= ' AND deleted_at IS NULL';
        }

        /* ── Task 121: пагинация ── */
        $page = isset($_GET['page']) ? (int)$_GET['page'] : 0;
        if ($page === 0) {
            /* ЛЕГАЦИЯ: прежний ответ {data} для всех прочих потребителей */
            $stmt = $pdo->prepare(self::SELECT_COLS . $where . ' ORDER BY id DESC LIMIT 500');
            $stmt->execute($params);
            $rows = $stmt->fetchAll();
            self::enrich($pdo, $rows);
            jsonResponse(['data' => $rows]);
            return;
        }

        if ($page < 1) $page = 1;
        $perPage = (int)($_GET['per_page'] ?? 50);
        if ($perPage < 10) $perPage = 10;
        if ($perPage > 200) $perPage = 200;

        /* Сортировка — те же варианты, что были в клиентской таблице */
        $sort = (string)($_GET['sort'] ?? 'default');
        $orderBy = match ($sort) {
            'name_asc'   => 'name ASC, id DESC',
            'name_desc'  => 'name DESC, id DESC',
            'price_asc'  => 'price_kopecks ASC, id DESC',
            'price_desc' => 'price_kopecks DESC, id DESC',
            default      => 'id DESC',
        };

        /* Категория и диапазоны — в SQL */
        $whereFull = $where;
        $paramsFull = $params;

        $categoryId = (int)($_GET['category'] ?? 0);
        if ($categoryId > 0) {
            $whereFull .= ' AND category_id = ?';
            $paramsFull[] = $categoryId;
        }
        if (isset($_GET['price_min'], $_GET['price_max'])) {
            $whereFull .= ' AND price_kopecks BETWEEN ? AND ?';
            $paramsFull[] = max(0, (int)$_GET['price_min']);
            $paramsFull[] = max(0, (int)$_GET['price_max']);
        }
        if (isset($_GET['weight_min'], $_GET['weight_max'])) {
            $whereFull .= ' AND COALESCE(recipe_weight_g, 0) BETWEEN ? AND ?';
            $paramsFull[] = max(0, (int)$_GET['weight_min']);
            $paramsFull[] = max(0, (int)$_GET['weight_max']);
        }

        $countStmt = $pdo->prepare('SELECT COUNT(*) FROM products' . $whereFull);
        $countStmt->execute($paramsFull);
        $total = (int)$countStmt->fetchColumn();
        $pages = max(1, (int)ceil($total / $perPage));
        if ($page > $pages) $page = $pages;

        $stmt = $pdo->prepare(
            self::SELECT_COLS . $whereFull
            . " ORDER BY $orderBy LIMIT $perPage OFFSET " . (($page - 1) * $perPage)
        );
        $stmt->execute($paramsFull);
        $rows = $stmt->fetchAll();
        self::enrich($pdo, $rows);

        /* Фасеты по набору q+filter+category (без price/weight — чтобы
           ползунки не пересчитывали сами себя) */
        $whereFacet = $where . ($categoryId > 0 ? ' AND category_id = ' . $categoryId : '');
        $priceRow = $pdo->prepare(
            'SELECT MIN(price_kopecks) AS lo, MAX(price_kopecks) AS hi FROM products' . $whereFacet
        );
        $priceRow->execute($params);
        $priceBounds = $priceRow->fetch() ?: ['lo' => 0, 'hi' => 0];

        $wq = $pdo->prepare(
            'SELECT DISTINCT recipe_weight_g FROM products' . $whereFacet
            . ' AND recipe_weight_g IS NOT NULL ORDER BY recipe_weight_g ASC'
        );
        $wq->execute($params);
        $weightSteps = array_map('intval', $wq->fetchAll(PDO::FETCH_COLUMN));

        /* Категории, представленные в наборе q+filter (без category — чтобы
           плитки категорий не исчезали при выбранной категории) */
        $cq = $pdo->prepare(
            'SELECT DISTINCT category_id FROM products' . $where . ' AND category_id IS NOT NULL'
        );
        $cq->execute($params);
        $categoriesPresent = array_map('intval', $cq->fetchAll(PDO::FETCH_COLUMN));

        /* Иконки плиток категорий: первая картинка товара категории
           (минимальный sort_order, id — как в enrich, но по категориям).
           При пагинации текущая страница не покрывает все категории,
           поэтому иконки считаются сервером по всему набору. */
        $tq = $pdo->prepare(
            'SELECT p.category_id AS cid,
                    (SELECT pi.url FROM product_images pi
                     WHERE pi.product_id = p.id AND pi.media_type = \'image\'
                     ORDER BY pi.sort_order, pi.id LIMIT 1) AS url
             FROM products p' . $where . ' AND p.category_id IS NOT NULL
             ORDER BY p.id ASC'
        );
        $tq->execute($params);
        $catThumbs = [];
        foreach ($tq->fetchAll() as $r) {
            $cid = (int)$r['cid'];
            if ($r['url'] !== null && !isset($catThumbs[$cid])) {
                $catThumbs[$cid] = $r['url'];
            }
        }
        $catThumbsList = [];
        foreach ($catThumbs as $cid => $url) {
            $catThumbsList[] = ['id' => $cid, 'url' => $url];
        }

        jsonResponse([
            'data' => $rows,
            'total' => $total,
            'page' => $page,
            'per_page' => $perPage,
            'pages' => $pages,
            'price_min' => (int)($priceBounds['lo'] ?? 0),
            'price_max' => (int)($priceBounds['hi'] ?? 0),
            'weight_steps' => $weightSteps,
            'categories_present' => $categoriesPresent,
            'category_thumbs' => $catThumbsList,
        ]);
    }

    /** Дописать к строкам списка thumb/imgs/vids — один запрос на всё. */
    private static function enrich(PDO $pdo, array &$rows): void
    {
        /* Task 90: URL первой картинки товара — иконки категорий в
           фильтре-плитках админки (как в клиентском каталоге). Один
           запрос по всем картинкам, первым считается минимум
           (sort_order, id) с media_type = 'image'. */
        $tq = $pdo->query(
            "SELECT product_id, url
             FROM product_images
             WHERE media_type = 'image'
             ORDER BY product_id, sort_order, id"
        );
        $thumbByProduct = [];
        foreach ($tq as $r) {
            $pid = (int)$r['product_id'];
            if (!isset($thumbByProduct[$pid])) {
                $thumbByProduct[$pid] = $r['url'];
            }
        }
        foreach ($rows as &$row) {
            $row['thumb'] = $thumbByProduct[(int)$row['id']] ?? null;
        }
        unset($row);

        /* Task 101: счётчики медиа одним запросом — в таблице метки
           «нет фото» (незаполненный товар) и «видео N» (тяжёлые карточки). */
        $mq = $pdo->query(
            "SELECT product_id,
                    SUM(media_type = 'image') AS imgs,
                    SUM(media_type = 'video') AS vids
             FROM product_images GROUP BY product_id"
        );
        $mediaByProduct = [];
        foreach ($mq as $r) {
            $mediaByProduct[(int)$r['product_id']] = [(int)$r['imgs'], (int)$r['vids']];
        }
        foreach ($rows as &$row) {
            [$imgs, $vids] = $mediaByProduct[(int)$row['id']] ?? [0, 0];
            $row['imgs'] = $imgs;
            $row['vids'] = $vids;
        }
        unset($row);
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
        $payload = Auth::requireEditor();

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
                 show_in_catalog, is_published, meta_title, meta_description)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
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
                isset($data['meta_title']) && trim((string)$data['meta_title']) !== ''
                    ? trim((string)$data['meta_title']) : null,
                isset($data['meta_description']) && trim((string)$data['meta_description']) !== ''
                    ? trim((string)$data['meta_description']) : null,
            ]);
        } catch (PDOException $e) {
            if (str_contains($e->getMessage(), 'UNIQUE')) {
                jsonResponse(['error' => 'Нарушено уникальное поле (slug или sku)'], 422);
            }
            throw $e;
        }

        $newId = (int)$pdo->lastInsertId();
        AdminLog::add($pdo, AdminLog::actor($payload ?? ['email' => 'unknown']), 'product.create', "#{$newId} {$name}");

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
        $payload = Auth::requireEditor();

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

        /* SEO-поля (Task 152): пустая строка → NULL (витрина тогда берёт
         * название/описание по умолчанию). */
        if (array_key_exists('meta_title', $data)) {
            $mt = trim((string)$data['meta_title']);
            if (mb_strlen($mt) > 255) {
                jsonResponse(['error' => 'SEO-заголовок длиннее 255 символов'], 422);
            }
            $fields[] = 'meta_title = ?';
            $params[] = $mt !== '' ? $mt : null;
        }
        if (array_key_exists('meta_description', $data)) {
            $md = trim((string)$data['meta_description']);
            if (mb_strlen($md) > 1000) {
                jsonResponse(['error' => 'SEO-описание длиннее 1000 символов'], 422);
            }
            $fields[] = 'meta_description = ?';
            $params[] = $md !== '' ? $md : null;
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

        /* Журнал: какие именно поля менялись (Task 104) */
        $tracked = ['name','slug','type','sku','price_kopecks','stock_qty','category_id',
                    'show_in_catalog','is_published','video_url','description','manufacturer'];
        $changed = array_values(array_intersect($tracked, array_keys($data)));
        AdminLog::add($pdo, AdminLog::actor($payload), 'product.update',
            "#{$id}: " . ($changed !== [] ? implode(', ', $changed) : 'прочие поля'));

        $get = $pdo->prepare('SELECT * FROM products WHERE id = ?');
        $get->execute([$id]);
        jsonResponse(['data' => $get->fetch()]);
    }

    /* ============================================================
       УДАЛЕНИЕ (мягкое — корзина, Task 100)
       По умолчанию товар помечается deleted_at и пропадает из всех
       списков и витрины; файлы и привязки остаются — восстановление
       мгновенное (POST /restore). Удалить НАВСЕГДА можно только уже
       лежащий в корзине: DELETE ...?force=1 (та же проверка составов).
       ============================================================ */
    public static function destroy(PDO $pdo, int $id): void
    {
        $payload = Auth::requireEditor();

        $force = ($_GET['force'] ?? '') === '1';

        $exists = $pdo->prepare('SELECT id, type, name, deleted_at FROM products WHERE id = ?');
        $exists->execute([$id]);
        $row = $exists->fetch();
        if (!$row) {
            jsonResponse(['error' => 'Товар не найден'], 404);
        }

        if (!$force && $row['deleted_at'] !== null) {
            jsonResponse(['error' => 'Товар уже в корзине'], 409);
        }
        if ($force && $row['deleted_at'] === null) {
            jsonResponse(['error' => 'Полное удаление — только для товара из корзины'], 409);
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

        if ($force) {
            /* Полное удаление: файлы и привязки вычищаются (старое поведение) */
            $img = $pdo->prepare('SELECT url FROM product_images WHERE product_id = ?');
            $img->execute([$id]);
            foreach ($img->fetchAll() as $r) {
                if (str_starts_with($r['url'], '/uploads/')) {
                    $path = Paths::publicRoot() . $r['url'];
                    if (is_file($path)) @unlink($path);
                }
            }

            $pdo->prepare('DELETE FROM bundle_items WHERE product_id = ?')->execute([$id]);
            $pdo->prepare('DELETE FROM product_images WHERE product_id = ?')->execute([$id]);
            $pdo->prepare('DELETE FROM weight_recipes WHERE product_id = ?')->execute([$id]);
            $pdo->prepare('DELETE FROM products WHERE id = ?')->execute([$id]);
            AdminLog::add($pdo, AdminLog::actor($payload), 'product.delete-forever', "#{$id} {$row['name']}");
        } else {
            /* Мягкое удаление — в корзину (файлы не трогаем) */
            $pdo->prepare('UPDATE products SET deleted_at = datetime(\'now\') WHERE id = ?')
                ->execute([$id]);
            AdminLog::add($pdo, AdminLog::actor($payload), 'product.delete', "#{$id} {$row['name']}");
        }

        jsonResponse(['data' => ['ok' => true, 'soft' => !$force]]);
    }

    /* ============================================================
       ВОССТАНОВЛЕНИЕ ИЗ КОРЗИНЫ
       POST /api/admin/products/{id}/restore
       ============================================================ */
    public static function restore(PDO $pdo, int $id): void
    {
        $payload = Auth::requireEditor();

        $stmt = $pdo->prepare('SELECT id, name, deleted_at FROM products WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) {
            jsonResponse(['error' => 'Товар не найден'], 404);
        }
        if ($row['deleted_at'] === null) {
            jsonResponse(['error' => 'Товар не удалён'], 409);
        }

        $pdo->prepare('UPDATE products SET deleted_at = NULL WHERE id = ?')->execute([$id]);
        AdminLog::add($pdo, AdminLog::actor($payload), 'product.restore', "#{$id} {$row['name']}");

        jsonResponse(['data' => ['ok' => true]]);
    }

    /* ============================================================
       ДУБЛИРОВАНИЕ ТОВАРА (Task 98)
       POST /api/admin/products/{id}/duplicate
       Копия с именем «… (копия)», уникальным slug, снятой публикацией
       (черновик) и теми же картинками/составом. Категория и всё прочее
       наследуются.
       ============================================================ */
    public static function duplicate(PDO $pdo, int $id): void
    {
        $payload = Auth::requireEditor();

        $stmt = $pdo->prepare('SELECT * FROM products WHERE id = ?');
        $stmt->execute([$id]);
        $src = $stmt->fetch();
        if (!$src) {
            jsonResponse(['error' => 'Товар не найден'], 404);
        }

        /* Уникальный slug: <slug>-copy, -copy-2, -copy-3… */
        $base = (string)$src['slug'];
        $slug = $base . '-copy';
        $n = 2;
        $check = $pdo->prepare('SELECT 1 FROM products WHERE slug = ?');
        while (true) {
            $check->execute([$slug]);
            if (!$check->fetchColumn()) break;
            $slug = $base . '-copy-' . (++$n);
        }

        $name = (string)$src['name'] . ' (копия)';
        if (mb_strlen($name) > 255) $name = mb_substr((string)$src['name'], 0, 245) . ' (копия)';

        /* recipe остаётся вне каталога; живой товар копируется черновиком */
        $show = $src['type'] === 'recipe' ? 0 : 0;
        $published = 0;

        $pdo->beginTransaction();
        try {
            $ins = $pdo->prepare(
                'INSERT INTO products
                    (sku, slug, name, description, manufacturer, type,
                     price_kopecks, old_price_kopecks, category_id, video_url,
                     packaging_material, weight_g, length_cm, width_cm, height_cm,
                     recipe_weight_g, show_in_catalog, is_published, stock_qty)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $ins->execute([
                $src['sku'], $slug, $name, $src['description'], $src['manufacturer'],
                $src['type'], $src['price_kopecks'], $src['old_price_kopecks'],
                $src['category_id'], $src['video_url'], $src['packaging_material'],
                $src['weight_g'], $src['length_cm'], $src['width_cm'], $src['height_cm'],
                $src['recipe_weight_g'], $show, $published, $src['stock_qty'],
            ]);
            $newId = (int)$pdo->lastInsertId();

            /* Картинки и видео — те же файлы (URL общие), отдельные записи */
            $pdo->prepare(
                'INSERT INTO product_images (product_id, url, alt, media_type, sort_order)
                 SELECT ?, url, alt, media_type, sort_order FROM product_images WHERE product_id = ?'
            )->execute([$newId, $id]);

            /* Состав набора */
            $pdo->prepare(
                'INSERT INTO bundle_items (product_id, component_id, quantity)
                 SELECT ?, component_id, quantity FROM bundle_items WHERE product_id = ?'
            )->execute([$newId, $id]);

            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }

        AdminLog::add($pdo, AdminLog::actor($payload), 'product.duplicate', "#{$id} → #{$newId} {$name}");

        jsonResponse(['data' => ['id' => $newId, 'slug' => $slug, 'name' => $name]], 201);
    }

    /* ============================================================
       МАССОВЫЕ ОПЕРАЦИИ (Task 99)
       POST /api/admin/products/bulk
       { ids: [..], action: "status"|"category"|"price_percent"|"delete",
         value: … }
       Возвращает число изменённых и пропущенных (составы/рецепты).
       ============================================================ */
    public static function bulk(PDO $pdo): void
    {
        $payload = Auth::requireEditor();

        $data = json_decode((string)file_get_contents('php://input'), true);
        if (!is_array($data)) {
            jsonResponse(['error' => 'Invalid JSON'], 400);
        }

        $ids = array_values(array_filter(array_map('intval', (array)($data['ids'] ?? [])), fn($v) => $v > 0));
        if ($ids === []) {
            jsonResponse(['error' => 'Не выбраны товары'], 422);
        }
        if (count($ids) > 500) {
            jsonResponse(['error' => 'За раз — не больше 500 товаров'], 422);
        }

        $action = (string)($data['action'] ?? '');
        $value = $data['value'] ?? null;

        $in = implode(',', $ids);

        switch ($action) {
            case 'status': {
                /* value: { show_in_catalog?: 0|1, is_published?: 0|1 } */
                $set = [];
                $params = [];
                if (isset($value['show_in_catalog'])) {
                    $set[] = 'show_in_catalog = ?';
                    $params[] = (int)(bool)$value['show_in_catalog'];
                }
                if (isset($value['is_published'])) {
                    $set[] = 'is_published = ?';
                    $params[] = (int)(bool)$value['is_published'];
                }
                if ($set === []) {
                    jsonResponse(['error' => 'Не указаны статусы'], 422);
                }
                /* recipe всегда вне каталога — не трогаем их show_in_catalog */
                $extra = isset($value['show_in_catalog'])
                    ? " AND (type <> 'recipe')" : '';
                $sql = "UPDATE products SET " . implode(', ', $set)
                     . " WHERE id IN ($in) AND deleted_at IS NULL" . $extra;
                $st = $pdo->prepare($sql);
                $st->execute($params);
                $n = $st->rowCount();
                AdminLog::add($pdo, AdminLog::actor($payload), 'product.bulk-status',
                    count($ids) . ' шт → ' . json_encode($value, JSON_UNESCAPED_UNICODE) . " (изменено $n)");
                jsonResponse(['data' => ['ok' => true, 'updated' => $n, 'skipped' => count($ids) - $n]]);
            }

            case 'category': {
                if ($value === null || $value === '') {
                    $sql = "UPDATE products SET category_id = NULL WHERE id IN ($in) AND deleted_at IS NULL";
                    $n = $pdo->exec($sql);
                    $label = 'без категории';
                } else {
                    $cid = (int)$value;
                    $chk = $pdo->prepare('SELECT 1 FROM categories WHERE id = ?');
                    $chk->execute([$cid]);
                    if (!$chk->fetchColumn()) {
                        jsonResponse(['error' => "Категория #$cid не найдена"], 422);
                    }
                    $st = $pdo->prepare(
                        "UPDATE products SET category_id = ? WHERE id IN ($in) AND deleted_at IS NULL"
                    );
                    $st->execute([$cid]);
                    $n = $st->rowCount();
                    $label = "категория #$cid";
                }
                AdminLog::add($pdo, AdminLog::actor($payload), 'product.bulk-category',
                    count($ids) . ' шт → ' . $label . " (изменено $n)");
                jsonResponse(['data' => ['ok' => true, 'updated' => $n, 'skipped' => count($ids) - $n]]);
            }

            case 'price_percent': {
                $percent = (float)($value ?? 0);
                if ($percent === 0.0 || abs($percent) > 90) {
                    jsonResponse(['error' => 'Процент от -90 до 90, не 0'], 422);
                }
                $k = 1 + $percent / 100;
                /* Цены — в копейках; окрругляем до рубля */
                $st = $pdo->prepare("SELECT id, price_kopecks FROM products WHERE id IN ($in) AND deleted_at IS NULL");
                $st->execute();
                $upd = $pdo->prepare('UPDATE products SET price_kopecks = ? WHERE id = ?');
                $n = 0;
                foreach ($st->fetchAll() as $r) {
                    $np = max(0, (int)round(((int)$r['price_kopecks']) * $k / 100) * 100);
                    if ($np !== (int)$r['price_kopecks']) {
                        $upd->execute([$np, (int)$r['id']]);
                        $n++;
                    }
                }
                AdminLog::add($pdo, AdminLog::actor($payload), 'product.bulk-price',
                    "$percent% → изменено $n из " . count($ids));
                jsonResponse(['data' => ['ok' => true, 'updated' => $n, 'skipped' => count($ids) - $n]]);
            }

            case 'delete': {
                /* Мягкое удаление выбранных; охраняемые (в составе/рецептах) — пропускаем */
                $st = $pdo->prepare(
                    "SELECT id, name, type FROM products WHERE id IN ($in) AND deleted_at IS NULL"
                );
                $st->execute();
                $deleted = 0;
                $skipped = [];
                $chkRecipes = $pdo->prepare('SELECT COUNT(*) FROM weight_recipes WHERE product_id = ?');
                $chkBundles = $pdo->prepare('SELECT COUNT(*) FROM bundle_items WHERE component_id = ?');
                $soft = $pdo->prepare("UPDATE products SET deleted_at = datetime('now') WHERE id = ?");
                foreach ($st->fetchAll() as $r) {
                    $pid = (int)$r['id'];
                    if ($r['type'] === 'recipe') {
                        $chkRecipes->execute([$pid]);
                        if ((int)$chkRecipes->fetchColumn() > 0) {
                            $skipped[] = "{$r['name']} (в рецептах)";
                            continue;
                        }
                    }
                    $chkBundles->execute([$pid]);
                    if ((int)$chkBundles->fetchColumn() > 0) {
                        $skipped[] = "{$r['name']} (в составе наборов)";
                        continue;
                    }
                    $soft->execute([$pid]);
                    $deleted++;
                }
                AdminLog::add($pdo, AdminLog::actor($payload), 'product.bulk-delete',
                    "удалено $deleted из " . count($ids) . ($skipped ? '; пропущены: ' . implode(', ', array_slice($skipped, 0, 5)) : ''));
                jsonResponse(['data' => ['ok' => true, 'updated' => $deleted, 'skipped' => count($ids) - $deleted, 'skipped_names' => $skipped]]);
            }

            default:
                jsonResponse(['error' => 'action: status | category | price_percent | delete'], 422);
        }
    }

    /* ============================================================
       PDF ПО ВЫБРАННЫМ ПОДАРКАМ (Task 131)
       POST /api/admin/products/pdf { ids: [...] }
       → application/pdf: карточки «картинка + название + цена»,
       6 штук на страницу A4 (сетка 2×3), больше ничего.
       Текст рисует GD (кириллица через TTF из public/pdfjs),
       ImgPdf собирает страницы-картинки в PDF.
       ============================================================ */
    public static function pdf(PDO $pdo): void
    {
        $payload = Auth::requireAuth();

        $data = json_decode((string)file_get_contents('php://input'), true);
        if (!is_array($data)) {
            jsonResponse(['error' => 'Invalid JSON'], 400);
        }
        $ids = array_values(array_unique(array_filter(
            array_map('intval', (array)($data['ids'] ?? [])),
            fn($v) => $v > 0
        )));
        if ($ids === []) {
            jsonResponse(['error' => 'Не выбраны товары'], 422);
        }
        if (count($ids) > 500) {
            jsonResponse(['error' => 'За раз — не больше 500 товаров'], 422);
        }

        $in = implode(',', array_fill(0, count($ids), '?'));
        $st = $pdo->prepare(
            "SELECT id, name, price_kopecks FROM products
             WHERE id IN ($in) AND deleted_at IS NULL"
        );
        $st->execute($ids);
        $byId = [];
        foreach ($st->fetchAll() as $row) {
            $byId[(int)$row['id']] = $row;
        }
        if (!$byId) {
            jsonResponse(['error' => 'Выбранные товары не найдены'], 422);
        }

        /* Порядок — как выбрал владелец, а не как вернула БД */
        $cards = [];
        foreach ($ids as $id) {
            if (!isset($byId[$id])) continue;
            $cards[] = [
                'name'   => (string)$byId[$id]['name'],
                'price'  => (int)$byId[$id]['price_kopecks'],
                'img'    => self::mainImageFile($pdo, $id),
            ];
        }

        [$fontReg, $fontBold] = self::pdfFonts();

        /* Task 132: обложка (первая страница) и последняя страница —
           картинки из настроек. Нет/битые → PDF собирается без них. */
        $stCfg = $pdo->prepare(
            "SELECT key, value FROM settings WHERE key IN ('pdf_cover_first','pdf_cover_last')"
        );
        $stCfg->execute();
        $cfg = [];
        foreach ($stCfg->fetchAll() as $r) {
            $cfg[$r['key']] = (string)$r['value'];
        }
        $coverFirst = self::pdfSettingFile($cfg['pdf_cover_first'] ?? '');
        $coverLast  = self::pdfSettingFile($cfg['pdf_cover_last'] ?? '');

        $tmpDir = sys_get_temp_dir() . '/lakomka-pdf-' . uniqid();
        if (!mkdir($tmpDir, 0700, true) && !is_dir($tmpDir)) {
            jsonResponse(['error' => 'Не удалось создать временную папку'], 500);
        }
        $pages = [];
        $coverPages = 0;
        try {
            if (self::renderPdfImagePage($coverFirst, $tmpDir . '/cover-first.jpg')) {
                $pages[] = $tmpDir . '/cover-first.jpg';
                $coverPages++;
            }
            foreach (array_chunk($cards, 6) as $pageNo => $chunk) {
                $file = $tmpDir . '/page-' . sprintf('%03d', $pageNo) . '.jpg';
                self::renderPdfCardPage($chunk, $fontReg, $fontBold, $file);
                $pages[] = $file;
            }
            if (self::renderPdfImagePage($coverLast, $tmpDir . '/cover-last.jpg')) {
                $pages[] = $tmpDir . '/cover-last.jpg';
                $coverPages++;
            }
            require_once __DIR__ . '/../ImgPdf.php';
            $pdf = ImgPdf::fromJpegs($pages);
        } finally {
            foreach ($pages as $p) @unlink($p);
            @rmdir($tmpDir);
        }

        header('Content-Type: application/pdf');
        header('Content-Disposition: attachment; filename="lakomka-podarki-' . date('Y.m.d-Hi') . '.pdf"');
        header('Content-Length: ' . strlen($pdf));
        header('Cache-Control: no-store');
        AdminLog::add($pdo, AdminLog::actor($payload), 'products.pdf',
            'PDF: ' . count($cards) . ' товаров, ' . count($pages) . ' стр.'
            . ($coverPages ? " (обложка/финал: $coverPages)" : ''));
        echo $pdf;
        exit;
    }

    /** Task 132: настройка-обложка (URL) → локальный файл внутри /uploads.
     *  Внешние ссылки не принимаются ещё на этапе сохранения настройки;
     *  здесь дополнительный барьер: realpath-контейнер в publicRoot.
     *  null = страницы не будет (PDF собирается без неё, fail-soft). */
    private static function pdfSettingFile(string $url): ?string
    {
        $url = trim($url);
        if ($url === '' || !str_starts_with($url, '/uploads/')) return null;
        $path = parse_url($url, PHP_URL_PATH) ?: $url;
        $root = realpath(Paths::publicRoot());
        $file = realpath($root . $path);
        if (!$root || !$file || !str_starts_with($file, $root . DIRECTORY_SEPARATOR)) return null;
        return is_file($file) ? $file : null;
    }

    /** Task 132: страница A4 (1240×1754) из готовой картинки обложки —
     *  «contain» по центру на белом поле (ничего не режем). false =
     *  файла нет или картинка битая — страница пропускается. */
    private static function renderPdfImagePage(?string $srcFile, string $outFile): bool
    {
        if (!$srcFile) return false;
        $bytes = @file_get_contents($srcFile);
        if ($bytes === false) return false;
        $src = @imagecreatefromstring($bytes);
        if (!$src) return false;

        $W = 1240; $H = 1754;
        $page = imagecreatetruecolor($W, $H);
        imagefill($page, 0, 0, imagecolorallocate($page, 255, 255, 255));

        $sw = imagesx($src); $sh = imagesy($src);
        $k = min($W / $sw, $H / $sh);
        $dw = max(1, (int)round($sw * $k));
        $dh = max(1, (int)round($sh * $k));
        imagecopyresampled(
            $page, $src,
            (int)(($W - $dw) / 2), (int)(($H - $dh) / 2),
            0, 0, $dw, $dh, $sw, $sh
        );

        $ok = imagejpeg($page, $outFile, 90);
        return (bool)$ok;
    }

    /** Файл основной картинки товара (первая по sort_order) или null */
    private static function mainImageFile(PDO $pdo, int $productId): ?string
    {
        $st = $pdo->prepare(
            "SELECT url FROM product_images
             WHERE product_id = ? AND media_type = 'image'
             ORDER BY sort_order, id LIMIT 1"
        );
        $st->execute([$productId]);
        $url = (string)($st->fetchColumn() ?: '');
        if ($url === '') return null;

        $path = parse_url($url, PHP_URL_PATH) ?: $url;
        $root = realpath(Paths::publicRoot());
        $file = realpath($root . $path);
        /* защита от выхода за public/ через ../ в url из БД */
        if (!$root || !$file || !str_starts_with($file, $root . DIRECTORY_SEPARATOR)) return null;
        return is_file($file) ? $file : null;
    }

    /** @return string[] [regular, bold] — TTF с кириллицей и знаком ₽ */
    private static function pdfFonts(): array
    {
        $candidates = [
            /* DejaVu в репо (public/fonts): кириллица + ₽, работает на любом хостинге */
            [Paths::publicRoot() . '/fonts/DejaVuSans.ttf',
             Paths::publicRoot() . '/fonts/DejaVuSans-Bold.ttf'],
            [Paths::publicRoot() . '/pdfjs/standard_fonts/LiberationSans-Regular.ttf',
             Paths::publicRoot() . '/pdfjs/standard_fonts/LiberationSans-Bold.ttf'],
            ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
             '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'],
            ['/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
             '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'],
        ];
        foreach ($candidates as [$reg, $bold]) {
            if (is_file($reg) && is_file($bold)) return [$reg, $bold];
        }
        throw new RuntimeException('TTF-шрифт с кириллицей не найден для PDF');
    }

    /** Страница A4 (150 dpi, 1240×1754): сетка 2×3 карточек */
    private static function renderPdfCardPage(array $cards, string $fontReg, string $fontBold, string $outFile): void
    {
        $W = 1240; $H = 1754;
        $M = 56; $GAP = 36;
        $COLS = 2; $ROWS = 3;
        $cardW = (int)(($W - 2 * $M - ($COLS - 1) * $GAP) / $COLS);   // 546
        $cardH = (int)(($H - 2 * $M - ($ROWS - 1) * $GAP) / $ROWS);   // 523

        $page = imagecreatetruecolor($W, $H);
        $white = imagecolorallocate($page, 255, 255, 255);
        imagefill($page, 0, 0, $white);

        $border  = imagecolorallocate($page, 227, 230, 234);  // #E3E6EA
        $muted   = imagecolorallocate($page, 156, 163, 175);  // #9CA3AF
        $nameC   = imagecolorallocate($page, 32, 38, 46);     // #20262E
        $priceC  = imagecolorallocate($page, 17, 24, 39);     // #111827
        $imgBg   = imagecolorallocate($page, 245, 246, 248);  // #F5F6F8

        $PAD = 18;
        $IMG_H = 320;
        $NAME_SIZE = 29; $NAME_LH = 36;
        $PRICE_SIZE = 34;

        foreach (array_values($cards) as $i => $card) {
            $col = $i % $COLS;
            $row = intdiv($i, $COLS);
            $x = $M + $col * ($cardW + $GAP);
            $y = $M + $row * ($cardH + $GAP);

            imagefilledrectangle($page, $x, $y, $x + $cardW, $y + $cardH, $white);
            imagerectangle($page, $x, $y, $x + $cardW, $y + $cardH, $border);

            /* ── картинка: contain в блок 510×320 ── */
            $ix = $x + $PAD; $iy = $y + $PAD;
            $iw = $cardW - 2 * $PAD; $ih = $IMG_H;
            $src = null;
            if (!empty($card['img'])) {
                $bytes = @file_get_contents($card['img']);
                if ($bytes !== false) $src = @imagecreatefromstring($bytes);
            }
            if ($src) {
                $sw = imagesx($src); $sh = imagesy($src);
                $k = min($iw / $sw, $ih / $sh);
                $dw = max(1, (int)round($sw * $k));
                $dh = max(1, (int)round($sh * $k));
                imagecopyresampled(
                    $page, $src,
                    $ix + (int)(($iw - $dw) / 2), $iy + (int)(($ih - $dh) / 2),
                    0, 0, $dw, $dh, $sw, $sh
                );
            } else {
                imagefilledrectangle($page, $ix, $iy, $ix + $iw, $iy + $ih, $imgBg);
                $t = 'нет фото';
                $b = imagettfbbox($NAME_SIZE - 3, 0, $fontReg, $t);
                imagettftext($page, $NAME_SIZE - 3, 0,
                    $ix + (int)(($iw - ($b[2] - $b[0])) / 2), $iy + (int)(($ih + $NAME_SIZE) / 2),
                    $muted, $fontReg, $t);
            }

            /* ── название: до 2 строк, перенос по словам ── */
            $nameY = $iy + $ih + 14 + $NAME_SIZE;
            $lines = self::wrapPdfText((string)$card['name'], $fontReg, $NAME_SIZE, $iw, 2);
            foreach ($lines as $li => $line) {
                imagettftext($page, $NAME_SIZE, 0, $x + $PAD, $nameY + $li * $NAME_LH, $nameC, $fontReg, $line);
            }

            /* ── цена: прижата к низу карточки ── */
            $price = self::formatPdfPrice((int)$card['price']);
            $priceY = $y + $cardH - $PAD - 6;
            imagettftext($page, $PRICE_SIZE, 0, $x + $PAD, $priceY, $priceC, $fontBold, $price);
        }

        imagejpeg($page, $outFile, 90);
    }

    /** Перенос по словам, максимум $maxLines, хвост с «…» */
    private static function wrapPdfText(string $text, string $font, int $size, int $maxW, int $maxLines): array
    {
        $text = trim(preg_replace('/\s+/u', ' ', $text) ?? '');
        if ($text === '') return [''];

        $words = explode(' ', $text);
        $lines = [];
        $cur = '';
        foreach ($words as $w) {
            $try = $cur === '' ? $w : "$cur $w";
            $b = imagettfbbox($size, 0, $font, $try);
            if ($b[2] - $b[0] <= $maxW) {
                $cur = $try;
                continue;
            }
            if ($cur !== '') {
                $lines[] = $cur;
                if (count($lines) === $maxLines) break;
                $cur = $w;
            } else {
                /* одно слово шире строки — режем по символам */
                while ($w !== '') {
                    $b = imagettfbbox($size, 0, $font, $w);
                    if ($b[2] - $b[0] <= $maxW || mb_strlen($w) <= 1) break;
                    $w = mb_substr($w, 0, (int)max(1, mb_strlen($w) - 2));
                }
                $cur = $w;
            }
        }
        if (count($lines) < $maxLines && $cur !== '') $lines[] = $cur;
        $lines = array_slice($lines, 0, $maxLines);

        /* если не всё влезло — на последней строке «…» */
        $used = implode(' ', $lines);
        if (mb_strlen($used) < mb_strlen($text)) {
            $last = $lines[$maxLines - 1];
            do {
                $last = mb_substr($last, 0, max(0, mb_strlen($last) - 1));
                $b = imagettfbbox($size, 0, $font, $last . '…');
            } while ($b[2] - $b[0] > $maxW && $last !== '');
            $lines[$maxLines - 1] = $last . '…';
        }
        return $lines;
    }

    /** Копейки → «1 234 ₽» / «1 234,50 ₽» */
    private static function formatPdfPrice(int $kopecks): string
    {
        $rub = intdiv($kopecks, 100);
        $kop = $kopecks % 100;
        $base = number_format($rub, 0, ',', ' ');
        if ($kop > 0) $base .= ',' . sprintf('%02d', $kop);
        return $base . ' ₽';
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