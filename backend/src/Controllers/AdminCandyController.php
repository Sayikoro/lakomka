<?php

require_once __DIR__ . '/../Auth.php';
require_once __DIR__ . '/../Paths.php';

/**
 * Task 50: Справочник конфет (products.type = 'recipe').
 * Полное редактирование, добавление, удаление (с каскадом по запросу).
 */
class AdminCandyController
{
    /* ============================================================
       СПИСОК КОНФЕТ
       GET /api/admin/candies?q=...
       Отдаёт конфеты + счётчики использования:
         recipes_count — записей в weight_recipes
         bundles_count — наборов, где конфета в составе (bundle_items)
       ============================================================ */
    public static function list(PDO $pdo): void
    {
        Auth::requireAuth();

        $search = trim($_GET['q'] ?? '');

        $sql = "SELECT id, sku, slug, name, description, manufacturer,
                       price_kopecks, stock_qty, weight_g, is_published,
                       (SELECT COUNT(*) FROM weight_recipes wr WHERE wr.product_id = p.id) AS recipes_count,
                       (SELECT COUNT(DISTINCT bi.product_id) FROM bundle_items bi WHERE bi.component_id = p.id) AS bundles_count,
                       (SELECT COUNT(*) FROM candy_set_items csi WHERE csi.product_id = p.id) AS sets_count
                FROM products p
                WHERE p.type = 'recipe'";
        $params = [];

        if ($search !== '') {
            $sql .= ' AND (p.name LIKE ? OR p.sku LIKE ? OR p.manufacturer LIKE ?)';
            $params[] = "%$search%";
            $params[] = "%$search%";
            $params[] = "%$search%";
        }

        $sql .= ' ORDER BY p.name COLLATE NOCASE ASC LIMIT 2000';

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        jsonResponse(['data' => $stmt->fetchAll()]);
    }

    /* ============================================================
       СОЗДАНИЕ КОНФЕТЫ
       POST /api/admin/candies  {name, sku?, manufacturer?, description?, weight_g?, price_kopecks?}
       ============================================================ */
    public static function create(PDO $pdo): void
    {
        Auth::requireEditor();

        $data = self::readJson();

        $name = trim((string)($data['name'] ?? ''));
        if ($name === '') {
            jsonResponse(['error' => 'Укажите название конфеты'], 422);
        }
        if (mb_strlen($name) > 255) {
            jsonResponse(['error' => 'Название длиннее 255 символов'], 422);
        }

        $sku = self::optTrim($data['sku'] ?? null);
        if ($sku !== null) {
            $dup = $pdo->prepare("SELECT id FROM products WHERE sku = ? AND type = 'recipe'");
            $dup->execute([$sku]);
            if ($dup->fetchColumn()) {
                jsonResponse(['error' => "Конфета с артикулом «{$sku}» уже есть"], 422);
            }
        }

        $slug = self::uniqueSlug($pdo, self::slugify($name));

        $stmt = $pdo->prepare(
            "INSERT INTO products
                (sku, slug, name, description, manufacturer, type,
                 price_kopecks, stock_qty, weight_g,
                 show_in_catalog, is_published)
             VALUES (?, ?, ?, ?, ?, 'recipe', ?, 0, ?, 0, 1)"
        );
        try {
            $stmt->execute([
                $sku,
                $slug,
                $name,
                self::optTrim($data['description'] ?? null),
                self::optTrim($data['manufacturer'] ?? null),
                max(0, (int)($data['price_kopecks'] ?? 0)),
                self::optInt($data['weight_g'] ?? null),
            ]);
        } catch (PDOException $e) {
            if (str_contains($e->getMessage(), 'UNIQUE')) {
                jsonResponse(['error' => 'Нарушено уникальное поле (slug или sku)'], 422);
            }
            throw $e;
        }

        $id = (int)$pdo->lastInsertId();
        $get = $pdo->prepare('SELECT * FROM products WHERE id = ?');
        $get->execute([$id]);
        jsonResponse(['data' => $get->fetch()], 201);
    }

    /* ============================================================
       ПОЛНОЕ РЕДАКТИРОВАНИЕ КОНФЕТЫ
       POST /api/admin/candies/{id}  {name?, sku?, manufacturer?, description?, weight_g?, price_kopecks?, is_published?}
       ============================================================ */
    public static function update(PDO $pdo, int $id): void
    {
        Auth::requireEditor();

        $exists = $pdo->prepare("SELECT id FROM products WHERE id = ? AND type = 'recipe'");
        $exists->execute([$id]);
        if (!$exists->fetchColumn()) {
            jsonResponse(['error' => 'Конфета не найдена'], 404);
        }

        $data = self::readJson();

        $fields = [];
        $params = [];

        if (array_key_exists('name', $data)) {
            $name = trim((string)$data['name']);
            if ($name === '') jsonResponse(['error' => 'Название не может быть пустым'], 422);
            if (mb_strlen($name) > 255) jsonResponse(['error' => 'Название длиннее 255 символов'], 422);
            $fields[] = 'name = ?';
            $params[] = $name;
        }

        if (array_key_exists('sku', $data)) {
            $sku = self::optTrim($data['sku']);
            if ($sku !== null) {
                $dup = $pdo->prepare("SELECT id FROM products WHERE sku = ? AND type = 'recipe' AND id <> ?");
                $dup->execute([$sku, $id]);
                if ($dup->fetchColumn()) {
                    jsonResponse(['error' => "Конфета с артикулом «{$sku}» уже есть"], 422);
                }
            }
            $fields[] = 'sku = ?';
            $params[] = $sku;
        }

        if (array_key_exists('manufacturer', $data)) {
            $fields[] = 'manufacturer = ?';
            $params[] = self::optTrim($data['manufacturer']);
        }

        if (array_key_exists('description', $data)) {
            $fields[] = 'description = ?';
            $params[] = self::optTrim($data['description']);
        }

        if (array_key_exists('weight_g', $data)) {
            $fields[] = 'weight_g = ?';
            $params[] = self::optInt($data['weight_g']);
        }

        if (array_key_exists('price_kopecks', $data)) {
            $price = (int)$data['price_kopecks'];
            if ($price < 0) jsonResponse(['error' => 'Цена не может быть отрицательной'], 422);
            $fields[] = 'price_kopecks = ?';
            $params[] = $price;
        }

        if (array_key_exists('is_published', $data)) {
            $fields[] = 'is_published = ?';
            $params[] = (int)(bool)$data['is_published'];
        }

        if ($fields === []) {
            jsonResponse(['error' => 'Нет полей для обновления'], 422);
        }

        $params[] = $id;
        $pdo->prepare('UPDATE products SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($params);

        $get = $pdo->prepare('SELECT * FROM products WHERE id = ?');
        $get->execute([$id]);
        jsonResponse(['data' => $get->fetch()]);
    }

    /* ============================================================
       УДАЛЕНИЕ КОНФЕТЫ
       DELETE /api/admin/candies/{id}            — запрещено, если используется
       DELETE /api/admin/candies/{id}?force=1    — удалить + вычистить из рецептов и составов
       ============================================================ */
    public static function destroy(PDO $pdo, int $id): void
    {
        Auth::requireEditor();

        $exists = $pdo->prepare("SELECT id, name FROM products WHERE id = ? AND type = 'recipe'");
        $exists->execute([$id]);
        $row = $exists->fetch();
        if (!$row) {
            jsonResponse(['error' => 'Конфета не найдена'], 404);
        }

        $rc = $pdo->prepare('SELECT COUNT(*) FROM weight_recipes WHERE product_id = ?');
        $rc->execute([$id]);
        $recipesCount = (int)$rc->fetchColumn();

        $bc = $pdo->prepare(
            'SELECT COUNT(DISTINCT bi.product_id) FROM bundle_items bi WHERE bi.component_id = ?'
        );
        $bc->execute([$id]);
        $bundlesCount = (int)$bc->fetchColumn();

        $sc = $pdo->prepare('SELECT COUNT(*) FROM candy_set_items WHERE product_id = ?');
        $sc->execute([$id]);
        $setsCount = (int)$sc->fetchColumn();

        $force = (int)($_GET['force'] ?? 0) === 1;

        if (!$force && ($recipesCount > 0 || $bundlesCount > 0)) {
            jsonResponse([
                'error' => 'Конфета используется',
                'usage' => [
                    'recipes' => $recipesCount,
                    'bundles' => $bundlesCount,
                    'sets' => $setsCount,
                ],
                'hint' => 'Передайте force=1, чтобы удалить конфету и все её записи в рецептах веса и составах наборов.',
            ], 409);
        }

        // Картинки-файлы удалить с диска
        $img = $pdo->prepare('SELECT url FROM product_images WHERE product_id = ?');
        $img->execute([$id]);
        foreach ($img->fetchAll() as $r) {
            if (str_starts_with($r['url'], '/uploads/')) {
                $path = Paths::publicRoot() . $r['url'];
                if (is_file($path)) @unlink($path);
            }
        }

        $pdo->prepare('DELETE FROM bundle_items WHERE component_id = ?')->execute([$id]);
        $pdo->prepare('DELETE FROM weight_recipes WHERE product_id = ?')->execute([$id]);
        $pdo->prepare('DELETE FROM candy_set_items WHERE product_id = ?')->execute([$id]);
        $pdo->prepare('DELETE FROM product_images WHERE product_id = ?')->execute([$id]);
        $pdo->prepare('DELETE FROM products WHERE id = ?')->execute([$id]);

        jsonResponse(['data' => [
            'ok' => true,
            'removed' => ['recipes' => $recipesCount, 'bundles' => $bundlesCount, 'sets' => $setsCount],
        ]]);
    }

    /* ============================================================
       ВСЕ КОНФЕТЫ ОДНИМ СПИСКОМ (для пикера наборов)
       GET /api/admin/candies/options
       ============================================================ */
    public static function options(PDO $pdo): void
    {
        Auth::requireAuth();

        $rows = $pdo->query(
            "SELECT id, name, sku, manufacturer, weight_g
             FROM products
             WHERE type = 'recipe'
             ORDER BY name COLLATE NOCASE ASC"
        )->fetchAll();

        jsonResponse(['data' => $rows]);
    }

    /* ---------- helpers ---------- */

    private static function readJson(): array
    {
        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true);
        if (!is_array($data)) {
            jsonResponse(['error' => 'Invalid JSON'], 400);
        }
        return $data;
    }

    private static function optTrim(mixed $v): ?string
    {
        if ($v === null) return null;
        $s = trim((string)$v);
        return $s !== '' ? $s : null;
    }

    private static function optInt(mixed $v): ?int
    {
        if ($v === null || $v === '') return null;
        return (int)$v;
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
        return ($s !== '' ? $s : 'candy') . '-' . substr((string)time(), -5);
    }

    private static function uniqueSlug(PDO $pdo, string $slug): string
    {
        $check = $pdo->prepare('SELECT id FROM products WHERE slug = ?');
        $try = $slug;
        $i = 1;
        while (true) {
            $check->execute([$try]);
            if (!$check->fetchColumn()) return $try;
            $try = $slug . '-' . (++$i);
        }
    }
}
