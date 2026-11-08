<?php

require_once __DIR__ . '/../Auth.php';
require_once __DIR__ . '/../AdminLog.php';

/**
 * Task 141: SEO для категорий.
 *
 * Категории сами по себе в админке не редактируются (создаются сидами
 * и импортом), но страницам /catalog/<slug> нужны мета-теги и текст.
 * Контроллер даёт безопасное редактирование ТОЛЬКО SEO-полей:
 * meta_title, meta_description, seo_text. Название/slug/порядок
 * трогать нельзя — на них завязаны ссылки и фильтры.
 */
class AdminCategoriesController
{
    public const MAX_META_TITLE = 200;
    public const MAX_META_DESCRIPTION = 300;
    public const MAX_SEO_TEXT = 5000;

    /** GET /api/admin/categories — список категорий с SEO-полями. */
    public static function list(PDO $pdo): void
    {
        Auth::requireAuth();

        $rows = $pdo->query(
            'SELECT id, slug, name, sort_order, meta_title, meta_description, seo_text
             FROM categories
             ORDER BY sort_order, name'
        )->fetchAll();

        jsonResponse(['data' => $rows]);
    }

    /** POST /api/admin/categories/{id} — обновить SEO-поля категории. */
    public static function update(PDO $pdo, int $id): void
    {
        $payload = Auth::requireEditor();

        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true);
        if (!is_array($data)) {
            jsonResponse(['error' => 'Invalid JSON'], 400);
        }

        $check = $pdo->prepare('SELECT name FROM categories WHERE id = ?');
        $check->execute([$id]);
        $cat = $check->fetch();
        if (!$cat) {
            jsonResponse(['error' => "Категория #{$id} не найдена"], 404);
        }

        $metaTitle = trim((string)($data['meta_title'] ?? ''));
        $metaDescription = trim((string)($data['meta_description'] ?? ''));
        $seoText = trim((string)($data['seo_text'] ?? ''));

        if (mb_strlen($metaTitle) > self::MAX_META_TITLE) {
            jsonResponse(['error' => 'meta_title: до ' . self::MAX_META_TITLE . ' символов'], 422);
        }
        if (mb_strlen($metaDescription) > self::MAX_META_DESCRIPTION) {
            jsonResponse(['error' => 'meta_description: до ' . self::MAX_META_DESCRIPTION . ' символов'], 422);
        }
        if (mb_strlen($seoText) > self::MAX_SEO_TEXT) {
            jsonResponse(['error' => 'seo_text: до ' . self::MAX_SEO_TEXT . ' символов'], 422);
        }

        $upd = $pdo->prepare(
            'UPDATE categories
             SET meta_title = ?, meta_description = ?, seo_text = ?
             WHERE id = ?'
        );
        $upd->execute([$metaTitle, $metaDescription, $seoText, $id]);

        AdminLog::add($pdo, AdminLog::actor($payload), 'category.seo', "#{$id} {$cat['name']}");

        jsonResponse(['data' => ['ok' => true]]);
    }
}
