<?php

require_once __DIR__ . '/../Auth.php';

/**
 * Task 50: Кастомные наборы конфет.
 * Именованные подборки конфет из справочника.
 * is_filter = 0 — набор нигде не участвует (не учитывается в поиске/фильтрах витрины).
 * is_filter = 1 — набор участвует в фильтре «Состав» каталога: показывает товары,
 *                 в составе которых есть конфеты из набора.
 */
class AdminCandySetController
{
    /* ============================================================
       СПИСОК НАБОРОВ
       GET /api/admin/candy-sets
       ============================================================ */
    public static function list(PDO $pdo): void
    {
        Auth::requireAuth();

        $sets = $pdo->query(
            'SELECT id, name, is_filter, created_at FROM candy_sets ORDER BY id DESC'
        )->fetchAll();

        $itemsStmt = $pdo->prepare(
            'SELECT csi.product_id, csi.quantity, p.name AS product_name, p.sku, p.manufacturer
             FROM candy_set_items csi
             JOIN products p ON p.id = csi.product_id
             WHERE csi.set_id = ?
             ORDER BY p.name COLLATE NOCASE ASC'
        );

        foreach ($sets as &$s) {
            $itemsStmt->execute([(int)$s['id']]);
            $s['items'] = $itemsStmt->fetchAll() ?: [];
            $s['is_filter'] = (int)$s['is_filter'];
        }
        unset($s);

        jsonResponse(['data' => $sets]);
    }

    /* ============================================================
       СОЗДАНИЕ НАБОРА
       POST /api/admin/candy-sets  {name, is_filter?, items?: [{product_id, quantity?}]}
       ============================================================ */
    public static function create(PDO $pdo): void
    {
        Auth::requireEditor();

        $data = self::readJson();

        $name = trim((string)($data['name'] ?? ''));
        if ($name === '') {
            jsonResponse(['error' => 'Укажите название набора'], 422);
        }
        if (mb_strlen($name) > 255) {
            jsonResponse(['error' => 'Название длиннее 255 символов'], 422);
        }

        $isFilter = (int)(bool)($data['is_filter'] ?? 0);
        $items = self::normalizeItems($pdo, $data['items'] ?? []);

        $pdo->beginTransaction();
        try {
            $ins = $pdo->prepare('INSERT INTO candy_sets (name, is_filter) VALUES (?, ?)');
            $ins->execute([$name, $isFilter]);
            $setId = (int)$pdo->lastInsertId();

            self::replaceItems($pdo, $setId, $items);
            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }

        self::respondOne($pdo, $setId, 201);
    }

    /* ============================================================
       ОБНОВЛЕНИЕ НАБОРА (полный replace состава)
       POST /api/admin/candy-sets/{id}  {name?, is_filter?, items?: [...]}
       ============================================================ */
    public static function update(PDO $pdo, int $id): void
    {
        Auth::requireEditor();

        $exists = $pdo->prepare('SELECT id FROM candy_sets WHERE id = ?');
        $exists->execute([$id]);
        if (!$exists->fetchColumn()) {
            jsonResponse(['error' => 'Набор не найден'], 404);
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

        if (array_key_exists('is_filter', $data)) {
            $fields[] = 'is_filter = ?';
            $params[] = (int)(bool)$data['is_filter'];
        }

        // items: [] или отсутствует — состав не трогаем; массив с элементами — replace
        $items = null;
        if (array_key_exists('items', $data) && is_array($data['items']) && $data['items'] !== []) {
            $items = self::normalizeItems($pdo, $data['items']);
        }

        $pdo->beginTransaction();
        try {
            if ($fields !== []) {
                $params[] = $id;
                $pdo->prepare('UPDATE candy_sets SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($params);
            }
            if ($items !== null) {
                self::replaceItems($pdo, $id, $items);
            }
            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }

        self::respondOne($pdo, $id);
    }

    /* ============================================================
       УДАЛЕНИЕ НАБОРА
       DELETE /api/admin/candy-sets/{id}
       ============================================================ */
    public static function destroy(PDO $pdo, int $id): void
    {
        Auth::requireEditor();

        $exists = $pdo->prepare('SELECT id FROM candy_sets WHERE id = ?');
        $exists->execute([$id]);
        if (!$exists->fetchColumn()) {
            jsonResponse(['error' => 'Набор не найден'], 404);
        }

        $pdo->prepare('DELETE FROM candy_set_items WHERE set_id = ?')->execute([$id]);
        $pdo->prepare('DELETE FROM candy_sets WHERE id = ?')->execute([$id]);

        jsonResponse(['data' => ['ok' => true]]);
    }

    /* ============================================================
       ПУБЛИЧНЫЙ СПИСОК ФИЛЬТРОВ (для витрины)
       GET /api/candy-filters — только is_filter = 1
       ============================================================ */
    public static function publicFilters(PDO $pdo): void
    {
        $sets = $pdo->query(
            'SELECT id, name FROM candy_sets WHERE is_filter = 1 ORDER BY name COLLATE NOCASE ASC'
        )->fetchAll();

        $itemsStmt = $pdo->prepare(
            'SELECT product_id FROM candy_set_items WHERE set_id = ?'
        );

        foreach ($sets as &$s) {
            $itemsStmt->execute([(int)$s['id']]);
            $s['product_ids'] = array_map('intval', array_column($itemsStmt->fetchAll(), 'product_id'));
        }
        unset($s);

        jsonResponse(['data' => $sets]);
    }

    /* ---------- helpers ---------- */

    private static function respondOne(PDO $pdo, int $setId, int $status = 200): void
    {
        $set = $pdo->prepare('SELECT id, name, is_filter, created_at FROM candy_sets WHERE id = ?');
        $set->execute([$setId]);
        $row = $set->fetch();
        if ($row) {
            $row['is_filter'] = (int)$row['is_filter'];
            $itemsStmt = $pdo->prepare(
                'SELECT csi.product_id, csi.quantity, p.name AS product_name, p.sku, p.manufacturer
                 FROM candy_set_items csi JOIN products p ON p.id = csi.product_id
                 WHERE csi.set_id = ? ORDER BY p.name COLLATE NOCASE ASC'
            );
            $itemsStmt->execute([$setId]);
            $row['items'] = $itemsStmt->fetchAll() ?: [];
        }
        jsonResponse(['data' => $row], $status);
    }

    private static function replaceItems(PDO $pdo, int $setId, array $items): void
    {
        $pdo->prepare('DELETE FROM candy_set_items WHERE set_id = ?')->execute([$setId]);
        if ($items === []) return;
        $ins = $pdo->prepare('INSERT INTO candy_set_items (set_id, product_id, quantity) VALUES (?, ?, ?)');
        foreach ($items as $it) {
            $ins->execute([$setId, $it['product_id'], $it['quantity']]);
        }
    }

    /**
     * Валидация состава: [{product_id, quantity?}] → [{product_id:int, quantity:int>=1}]
     * Дубликаты схлопываются (максимум quantity), несуществующие конфеты — 422.
     */
    private static function normalizeItems(PDO $pdo, mixed $raw): array
    {
        if (!is_array($raw)) {
            jsonResponse(['error' => 'items должен быть массивом'], 422);
        }

        $map = [];
        foreach ($raw as $it) {
            if (!is_array($it)) {
                jsonResponse(['error' => 'Неверный формат items'], 422);
            }
            $pid = (int)($it['product_id'] ?? 0);
            $qty = max(1, (int)($it['quantity'] ?? 1));
            if ($pid <= 0) {
                jsonResponse(['error' => 'В items передан некорректный product_id'], 422);
            }
            if (!isset($map[$pid]) || $qty > $map[$pid]) {
                $map[$pid] = $qty;
            }
        }

        if ($map === []) return [];

        $check = $pdo->prepare("SELECT id FROM products WHERE id = ? AND type = 'recipe'");
        $out = [];
        foreach ($map as $pid => $qty) {
            $check->execute([$pid]);
            if (!$check->fetchColumn()) {
                jsonResponse(['error' => "Конфета #$pid не найдена в справочнике"], 422);
            }
            $out[] = ['product_id' => $pid, 'quantity' => $qty];
        }
        return $out;
    }

    private static function readJson(): array
    {
        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true);
        if (!is_array($data)) {
            jsonResponse(['error' => 'Invalid JSON'], 400);
        }
        return $data;
    }
}
