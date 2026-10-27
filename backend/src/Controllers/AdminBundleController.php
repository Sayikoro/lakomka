<?php

require_once __DIR__ . '/../Auth.php';

class AdminBundleController
{
    public static function list(PDO $pdo, int $productId): void
    {
        Auth::requireAuth();

        $stmt = $pdo->prepare(
            'SELECT b.id, b.component_id, b.quantity,
                    p.name AS component_name, p.sku, p.type,
                    p.price_kopecks, p.show_in_catalog
             FROM bundle_items b
             JOIN products p ON p.id = b.component_id
             WHERE b.product_id = ?
             ORDER BY b.id'
        );
        $stmt->execute([$productId]);
        jsonResponse(['data' => $stmt->fetchAll()]);
    }

    public static function addComponent(PDO $pdo, int $productId): void
    {
        Auth::requireAuth();

        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true) ?? [];
        $componentId = (int)($data['component_id'] ?? 0);
        $qty = (int)($data['quantity'] ?? 1);

        if ($componentId <= 0) jsonResponse(['error' => 'component_id обязателен'], 422);
        if ($componentId === $productId) jsonResponse(['error' => 'Нельзя вложить товар сам в себя'], 422);
        if ($qty <= 0) jsonResponse(['error' => 'Количество > 0'], 422);

        $exists = $pdo->prepare('SELECT id FROM products WHERE id = ?');
        $exists->execute([$componentId]);
        if (!$exists->fetchColumn()) jsonResponse(['error' => 'Компонент не найден'], 404);

        $dup = $pdo->prepare('SELECT id FROM bundle_items WHERE product_id = ? AND component_id = ?');
        $dup->execute([$productId, $componentId]);
        $existing = $dup->fetchColumn();

        if ($existing) {
            $pdo->prepare('UPDATE bundle_items SET quantity = quantity + ? WHERE id = ?')
                ->execute([$qty, $existing]);
            jsonResponse(['data' => ['id' => (int)$existing, 'updated' => true]]);
        }

        $stmt = $pdo->prepare(
            'INSERT INTO bundle_items (product_id, component_id, quantity) VALUES (?, ?, ?)'
        );
        $stmt->execute([$productId, $componentId, $qty]);
        jsonResponse(['data' => ['id' => (int)$pdo->lastInsertId()]], 201);
    }

    public static function updateComponent(PDO $pdo, int $productId, int $itemId): void
    {
        Auth::requireAuth();

        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true) ?? [];
        $qty = (int)($data['quantity'] ?? 0);
        if ($qty <= 0) jsonResponse(['error' => 'Количество > 0'], 422);

        $pdo->prepare('UPDATE bundle_items SET quantity = ? WHERE id = ? AND product_id = ?')
            ->execute([$qty, $itemId, $productId]);

        jsonResponse(['data' => ['id' => $itemId, 'quantity' => $qty]]);
    }

    public static function removeComponent(PDO $pdo, int $productId, int $itemId): void
    {
        Auth::requireAuth();
        $pdo->prepare('DELETE FROM bundle_items WHERE id = ? AND product_id = ?')
            ->execute([$itemId, $productId]);
        jsonResponse(['data' => ['ok' => true]]);
    }
}