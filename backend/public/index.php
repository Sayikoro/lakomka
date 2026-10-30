<?php

declare(strict_types=1);


// Не даём PHP печатать HTML-ошибки в JSON-ответ
ini_set('display_errors', '0');
ini_set('log_errors', '1');
ini_set('error_log', __DIR__ . '/../storage/php-errors.log');

// Любой warning/notice → ErrorException, ловится общим catch(Throwable)
set_error_handler(function ($errno, $errstr, $errfile, $errline) {
    if (!(error_reporting() & $errno)) return false;
    throw new ErrorException($errstr, 0, $errno, $errfile, $errline);
});



header('Content-Type: application/json; charset=utf-8');

// CORS: отдаём разрешённые origin из конфига (или same-origin — заголовки не нужны).
// При same-origin проксировании (прод, превью) браузер сам не требует CORS.
$_corsConfig = require __DIR__ . '/../config.php';
$_origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($_origin !== '' && in_array($_origin, $_corsConfig['cors_allowed_origins'] ?? [], true)) {
    header('Access-Control-Allow-Origin: ' . $_origin);
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    header('Vary: Origin');
}
unset($_corsConfig, $_origin);

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require __DIR__ . '/../src/Database.php';
require __DIR__ . '/../src/Auth.php';

$pdo = Database::get();

// Первый запуск (свежий деплой): схема БД + дефолтный суперадмин +
// автогенерация секретов (см. config.php). Идемпотентно.
require_once __DIR__ . '/../src/Bootstrap.php';
Bootstrap::ensure($pdo);

$path   = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$path   = rtrim($path, '/') ?: '/';
$method = $_SERVER['REQUEST_METHOD'];

function jsonResponse(mixed $data, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function hydrateImages(PDO $pdo, array &$product): void
{
    $stmt = $pdo->prepare(
        "SELECT id, url, alt, media_type, sort_order
         FROM product_images WHERE product_id = ?
         ORDER BY sort_order, id"
    );
    $stmt->execute([$product['id']]);
    $rows = $stmt->fetchAll() ?: [];

    $media = [];
    $images = [];
    foreach ($rows as $r) {
        $item = [
            'id' => (int)$r['id'], 'type' => $r['media_type'],
            'url' => $r['url'], 'alt' => $r['alt'], 'sort_order' => (int)$r['sort_order'],
        ];
        $media[] = $item;
        if ($r['media_type'] === 'image') {
            $images[] = [
                'id' => $item['id'], 'url' => $item['url'],
                'alt' => $item['alt'], 'sort_order' => $item['sort_order'],
            ];
        }
    }

    $product['media'] = $media;
    $product['images'] = $images;
}

try {

    if ($path === '/api/health' && $method === 'GET') {
        jsonResponse(['status' => 'ok', 'time' => date('c')]);
    }

    /* ========== PUBLIC ========== */
        if ($path === '/api/products' && $method === 'GET') {
        // Каталог: только simple и bundle, recipe всегда скрыт
        $stmt = $pdo->prepare(
            "SELECT p.* FROM products p
             WHERE p.show_in_catalog = 1
               AND p.is_published = 1
               AND p.type IN ('simple', 'bundle')
             ORDER BY p.id DESC"
        );
        $stmt->execute();
        $products = $stmt->fetchAll();

        // Task 50: состав наборов в компактном виде — для фильтра «Состав» на витрине
        $compMap = [];
        foreach ($pdo->query('SELECT product_id, GROUP_CONCAT(component_id) AS ids FROM bundle_items GROUP BY product_id') as $r) {
            $compMap[(int)$r['product_id']] = array_map('intval', explode(',', (string)$r['ids']));
        }
        foreach ($products as &$p) {
            if ($p['type'] === 'bundle') {
                $p['component_ids'] = $compMap[(int)$p['id']] ?? [];
            }
            hydrateImages($pdo, $p);
        }
        unset($p);
        jsonResponse(['data' => $products]);
    }

    /* Task 50: публичные фильтры «Состав» (кастомные наборы конфет с is_filter=1) */
    if ($path === '/api/candy-filters' && $method === 'GET') {
        require_once __DIR__ . '/../src/Controllers/AdminCandySetController.php';
        AdminCandySetController::publicFilters($pdo);
    }

    if (preg_match('#^/api/products/by-legacy/(.+)$#', $path, $m) && $method === 'GET') {
        $stmt = $pdo->prepare(
            'SELECT slug FROM products WHERE legacy_slug = ? AND is_published = 1 LIMIT 1'
        );
        $stmt->execute([urldecode($m[1])]);
        $row = $stmt->fetch();
        if (!$row) jsonResponse(['error' => 'Not found'], 404);
        jsonResponse(['data' => ['slug' => $row['slug']]]);
    }

    if (preg_match('#^/api/products/([a-z0-9-]+)$#', $path, $m) && $method === 'GET') {
        
    $stmt = $pdo->prepare(
    "SELECT * FROM products WHERE slug = ? AND is_published = 1
       AND type IN ('simple', 'bundle')"
);
$stmt->execute([$m[1]]);
        $product = $stmt->fetch();
        if (!$product) jsonResponse(['error' => 'Not found'], 404);

        hydrateImages($pdo, $product);

        if ($product['type'] === 'bundle') {
            $b = $pdo->prepare(<<<SQL
                SELECT b.quantity, p.id AS component_id, p.name AS component_name,
                       p.sku, p.slug AS component_slug,
                       p.description AS component_description,
                       p.manufacturer AS component_manufacturer
                FROM bundle_items b JOIN products p ON p.id = b.component_id
                WHERE b.product_id = ? ORDER BY b.id
            SQL);
            $b->execute([$product['id']]);
            $items = $b->fetchAll() ?: [];

            $img = $pdo->prepare(
                "SELECT url FROM product_images WHERE product_id = ? AND media_type = 'image' ORDER BY sort_order LIMIT 1"
            );
            foreach ($items as &$it) {
                $img->execute([$it['component_id']]);
                $it['component_image'] = $img->fetchColumn() ?: null;
            }
            unset($it);
            $product['bundle_items'] = $items;
        }

        jsonResponse(['data' => $product]);
    }

    if ($path === '/api/categories' && $method === 'GET') {
        $rows = $pdo->query('SELECT * FROM categories ORDER BY sort_order, name')->fetchAll();
        jsonResponse(['data' => $rows]);
    }

    /* Витринные настройки (hero, шаблон карточки) — публично, без авторизации */
    if ($path === '/api/settings/public' && $method === 'GET') {
        require_once __DIR__ . '/../src/Controllers/AdminSettingsController.php';
        AdminSettingsController::publicShow($pdo);
    }

    if ($path === '/api/orders' && $method === 'POST') {
        require_once __DIR__ . '/../src/Controllers/OrderController.php';
        OrderController::create($pdo);
    }

    /* ========== AUTH ========== */
    if ($path === '/api/auth/login' && $method === 'POST') {
        require_once __DIR__ . '/../src/Controllers/AuthController.php';
        AuthController::login($pdo);
    }
    if ($path === '/api/auth/me' && $method === 'GET') {
        require_once __DIR__ . '/../src/Controllers/AuthController.php';
        AuthController::me();
    }
    if ($path === '/api/auth/logout' && $method === 'POST') {
        require_once __DIR__ . '/../src/Controllers/AuthController.php';
        AuthController::logout();
    }
    if ($path === '/api/auth/first-run' && $method === 'GET') {
        require_once __DIR__ . '/../src/Controllers/AuthController.php';
        AuthController::firstRun($pdo);
    }

    /* ========== ADMIN: USERS ========== */
    if ($path === '/api/admin/users' && $method === 'GET') {
        require_once __DIR__ . '/../src/Controllers/AdminUsersController.php';
        AdminUsersController::list($pdo);
    }
    if ($path === '/api/admin/users' && $method === 'POST') {
        require_once __DIR__ . '/../src/Controllers/AdminUsersController.php';
        AdminUsersController::create($pdo);
    }
    if (preg_match('#^/api/admin/users/(\d+)$#', $path, $m)) {
        require_once __DIR__ . '/../src/Controllers/AdminUsersController.php';
        $id = (int)$m[1];
        if ($method === 'POST')   AdminUsersController::update($pdo, $id);
        if ($method === 'DELETE') AdminUsersController::destroy($pdo, $id);
    }
    if (preg_match('#^/api/admin/users/(\d+)/password$#', $path, $m) && $method === 'POST') {
        require_once __DIR__ . '/../src/Controllers/AdminUsersController.php';
        AdminUsersController::changePassword($pdo, (int)$m[1]);
    }
    if (preg_match('#^/api/admin/users/(\d+)/reset-password$#', $path, $m) && $method === 'POST') {
        require_once __DIR__ . '/../src/Controllers/AdminUsersController.php';
        AdminUsersController::resetPassword($pdo, (int)$m[1]);
    }
    /* ========== PDF: КАТАЛОГИ И СЕРТИФИКАТ ========== */
    if ($path === '/api/pdfs' && $method === 'GET') {
        require_once __DIR__ . '/../src/Controllers/PdfController.php';
        PdfController::list($pdo);
    }
    if ($path === '/api/admin/pdfs/chunk' && $method === 'POST') {
        require_once __DIR__ . '/../src/Controllers/PdfController.php';
        PdfController::uploadChunk();
    }
    if (preg_match('#^/api/admin/pdfs/([a-z0-9_]+)/meta$#', $path, $m) && $method === 'POST') {
        require_once __DIR__ . '/../src/Controllers/PdfController.php';
        PdfController::saveMeta($pdo, $m[1]);
    }
    if (preg_match('#^/api/admin/pdfs/([a-z0-9_]+)/cover$#', $path, $m) && $method === 'POST') {
        require_once __DIR__ . '/../src/Controllers/PdfController.php';
        PdfController::uploadCover($m[1]);
    }
    if (preg_match('#^/api/admin/pdfs/([a-z0-9_]+)$#', $path, $m) && $method === 'DELETE') {
        require_once __DIR__ . '/../src/Controllers/PdfController.php';
        PdfController::remove($m[1]);
    }

    /* ========== ТЕКСТЫ СТРАНИЦ (Настройки → Текст на страницах) ========== */
    if ($path === '/api/admin/page-texts' && $method === 'GET') {
        require_once __DIR__ . '/../src/Controllers/PageTextsController.php';
        PageTextsController::show($pdo);
    }
    if ($path === '/api/admin/page-texts' && $method === 'POST') {
        require_once __DIR__ . '/../src/Controllers/PageTextsController.php';
        PageTextsController::update($pdo);
    }

    /* ========== ADMIN: UPLOAD (chunked) ========== */
    if ($path === '/api/admin/upload/chunk' && $method === 'POST') {
        require_once __DIR__ . '/../src/Controllers/AdminUploadController.php';
        AdminUploadController::chunk();
    }
    /* Загрузка картинки для hero главной страницы */
    if ($path === '/api/admin/uploads/hero' && $method === 'POST') {
        require_once __DIR__ . '/../src/Controllers/AdminUploadController.php';
        AdminUploadController::saveHeroImage();
    }

    /* Загрузка SVG-снежинки для снегопада */
    if ($path === '/api/admin/uploads/snowflake' && $method === 'POST') {
        require_once __DIR__ . '/../src/Controllers/AdminUploadController.php';
        AdminUploadController::saveSnowflakeSvg();
    }

    /* ========== ADMIN: SITE UPDATE (Настройки → «Обновление») ========== */
    if ($path === '/api/admin/site-update' && $method === 'GET') {
        require_once __DIR__ . '/../src/Controllers/AdminSiteUpdateController.php';
        AdminSiteUpdateController::status();
    }
    if ($path === '/api/admin/site-update/apply' && $method === 'POST') {
        require_once __DIR__ . '/../src/Controllers/AdminSiteUpdateController.php';
        AdminSiteUpdateController::apply();
    }
    if ($path === '/api/admin/site-update/deploy-archive' && $method === 'GET') {
        require_once __DIR__ . '/../src/Controllers/AdminSiteUpdateController.php';
        AdminSiteUpdateController::deployArchive();
    }
    if ($path === '/api/admin/site-update/deploy-archive/download' && $method === 'GET') {
        require_once __DIR__ . '/../src/Controllers/AdminSiteUpdateController.php';
        AdminSiteUpdateController::deployArchiveDownload();
    }
    if ($path === '/api/admin/site-update/github-check' && $method === 'GET') {
        require_once __DIR__ . '/../src/Controllers/AdminSiteUpdateController.php';
        AdminSiteUpdateController::githubCheck();
    }
    if ($path === '/api/admin/site-update/github-download' && $method === 'POST') {
        require_once __DIR__ . '/../src/Controllers/AdminSiteUpdateController.php';
        AdminSiteUpdateController::githubDownload();
    }

    /* ========== ADMIN: WEIGHT RECIPES ========== */
    if ($path === '/api/admin/weight-recipes' && $method === 'GET') {
        require_once __DIR__ . '/../src/Controllers/AdminWeightRecipeController.php';
        AdminWeightRecipeController::list($pdo);
    }
    if ($path === '/api/admin/weight-recipes/import-csv' && $method === 'POST') {
        require_once __DIR__ . '/../src/Controllers/AdminWeightRecipeController.php';
        AdminWeightRecipeController::importCsv($pdo);
    }
    if ($path === '/api/admin/weight-recipes/import-zip' && $method === 'POST') {
        require_once __DIR__ . '/../src/Controllers/AdminWeightRecipeController.php';
        AdminWeightRecipeController::importZip($pdo);
    }
    if (preg_match('#^/api/admin/weight-recipes/(\d+)$#', $path, $m)) {
        require_once __DIR__ . '/../src/Controllers/AdminWeightRecipeController.php';
        $w = (int)$m[1];
        if ($method === 'GET')  AdminWeightRecipeController::show($pdo, $w);
        if ($method === 'POST') AdminWeightRecipeController::upsert($pdo, $w);
    }
    if (preg_match('#^/api/admin/weight-recipes/(\d+)/(\d+)$#', $path, $m) && $method === 'DELETE') {
        require_once __DIR__ . '/../src/Controllers/AdminWeightRecipeController.php';
        AdminWeightRecipeController::remove($pdo, (int)$m[1], (int)$m[2]);
    }
    if (preg_match('#^/api/admin/products/(\d+)/fill-by-weight$#', $path, $m) && $method === 'POST') {
        require_once __DIR__ . '/../src/Controllers/AdminWeightRecipeController.php';
        AdminWeightRecipeController::fillBundleByWeight($pdo, (int)$m[1]);
    }
    if (preg_match('#^/api/admin/products/(\d+)/cover$#', $path, $m) && $method === 'POST') {
        require_once __DIR__ . '/../src/Controllers/AdminWeightRecipeController.php';
        AdminWeightRecipeController::uploadProductCover($pdo, (int)$m[1]);
    }
    /* ========== ADMIN: ORDERS ========== */
    if ($path === '/api/admin/orders' && $method === 'GET') {
        require_once __DIR__ . '/../src/Controllers/AdminOrdersController.php';
        AdminOrdersController::list($pdo);
    }
    if (preg_match('#^/api/admin/orders/(\d+)/resend-email$#', $path, $m) && $method === 'POST') {
        require_once __DIR__ . '/../src/Controllers/AdminOrdersController.php';
        Auth::requireEditor();
        AdminOrdersController::resendEmail($pdo, (int)$m[1]);
    }
    if (preg_match('#^/api/admin/orders/(\d+)$#', $path, $m)) {
        require_once __DIR__ . '/../src/Controllers/AdminOrdersController.php';
        $id = (int)$m[1];
        if ($method === 'GET') {
            AdminOrdersController::show($pdo, $id);
        }
        if ($method === 'POST') {
            Auth::requireEditor();
            AdminOrdersController::updateStatus($pdo, $id);
        }
    }

    /* ========== ADMIN: SETTINGS ========== */
    if ($path === '/api/admin/settings' && $method === 'GET') {
        Auth::requireSuperAdmin();
        require_once __DIR__ . '/../src/Controllers/AdminSettingsController.php';
        AdminSettingsController::show($pdo);
    }
    if ($path === '/api/admin/settings' && $method === 'POST') {
        Auth::requireSuperAdmin();
        require_once __DIR__ . '/../src/Controllers/AdminSettingsController.php';
        AdminSettingsController::update($pdo);
    }
    if ($path === '/api/admin/settings/test-email' && $method === 'POST') {
        Auth::requireSuperAdmin();
        require_once __DIR__ . '/../src/Controllers/AdminSettingsController.php';
        AdminSettingsController::testEmail($pdo);
    }

    /* ========== ADMIN: PRODUCTS ========== */
        if ($path === '/api/admin/products/import-zip' && $method === 'POST') {
        require_once __DIR__ . '/../src/Controllers/AdminProductsImportExportController.php';
        AdminProductsImportExportController::importZip($pdo);
    }
    if ($path === '/api/admin/products/export-zip' && $method === 'POST') {
        require_once __DIR__ . '/../src/Controllers/AdminProductsImportExportController.php';
        AdminProductsImportExportController::exportZip($pdo);
    }
    if (preg_match('#^/api/admin/products/export-zip-download/([a-z0-9\-]+\.zip)$#i', $path, $m) && $method === 'GET') {
        require_once __DIR__ . '/../src/Controllers/AdminProductsImportExportController.php';
        AdminProductsImportExportController::exportZipDownload($m[1]);
    }
    if ($path === '/api/admin/products/export-zip-status' && $method === 'GET') {
        require_once __DIR__ . '/../src/Controllers/AdminProductsImportExportController.php';
        AdminProductsImportExportController::exportZipStatus();
    }
    if ($path === '/api/admin/files' && $method === 'GET') {
        require_once __DIR__ . '/../src/Controllers/AdminFilesController.php';
        AdminFilesController::list();
    }
    if ($path === '/api/admin/files/upload' && $method === 'POST') {
        require_once __DIR__ . '/../src/Controllers/AdminFilesController.php';
        AdminFilesController::upload();
    }
    if ($path === '/api/admin/files/mkdir' && $method === 'POST') {
        require_once __DIR__ . '/../src/Controllers/AdminFilesController.php';
        AdminFilesController::mkdir();
    }
    if ($path === '/api/admin/files/rename' && $method === 'POST') {
        require_once __DIR__ . '/../src/Controllers/AdminFilesController.php';
        AdminFilesController::rename();
    }
    if ($path === '/api/admin/files/delete' && $method === 'POST') {
        require_once __DIR__ . '/../src/Controllers/AdminFilesController.php';
        AdminFilesController::delete();
    }
    if ($path === '/api/admin/files/download' && $method === 'GET') {
        require_once __DIR__ . '/../src/Controllers/AdminFilesController.php';
        AdminFilesController::download();
    }
    if ($path === '/api/admin/products' && $method === 'GET') {
        require_once __DIR__ . '/../src/Controllers/AdminProductsController.php';
        AdminProductsController::list($pdo);
    }
    if ($path === '/api/admin/products' && $method === 'POST') {
        Auth::requireEditor();
        require_once __DIR__ . '/../src/Controllers/AdminProductsController.php';
        AdminProductsController::create($pdo);
    }
    if (preg_match('#^/api/admin/products/(\d+)$#', $path, $m)) {
        require_once __DIR__ . '/../src/Controllers/AdminProductsController.php';
        $id = (int)$m[1];
        if ($method === 'GET') {
            AdminProductsController::show($pdo, $id);
        }
        if ($method === 'POST') {
            Auth::requireEditor();
            AdminProductsController::update($pdo, $id);
        }
        if ($method === 'DELETE') {
            Auth::requireEditor();
            AdminProductsController::destroy($pdo, $id);
        }
    }

    /* ========== ADMIN: MEDIA ========== */
    if (preg_match('#^/api/admin/products/(\d+)/media/image$#', $path, $m) && $method === 'POST') {
        Auth::requireEditor();
        require_once __DIR__ . '/../src/Controllers/AdminImagesController.php';
        AdminImagesController::uploadImage($pdo, (int)$m[1]);
    }
    if (preg_match('#^/api/admin/products/(\d+)/media/video-upload$#', $path, $m) && $method === 'POST') {
        Auth::requireEditor();
        require_once __DIR__ . '/../src/Controllers/AdminImagesController.php';
        AdminImagesController::uploadVideoFile($pdo, (int)$m[1]);
    }
    if (preg_match('#^/api/admin/products/(\d+)/media/video-url$#', $path, $m) && $method === 'POST') {
        Auth::requireEditor();
        require_once __DIR__ . '/../src/Controllers/AdminImagesController.php';
        AdminImagesController::addVideoUrl($pdo, (int)$m[1]);
    }
    if (preg_match('#^/api/admin/products/(\d+)/media/attach$#', $path, $m) && $method === 'POST') {
        Auth::requireEditor();
        require_once __DIR__ . '/../src/Controllers/AdminImagesController.php';
        AdminImagesController::attach($pdo, (int)$m[1]);
    }
    if (preg_match('#^/api/admin/products/(\d+)/media/reorder$#', $path, $m) && $method === 'POST') {
        Auth::requireEditor();
        require_once __DIR__ . '/../src/Controllers/AdminImagesController.php';
        AdminImagesController::reorder($pdo, (int)$m[1]);
    }
    if (preg_match('#^/api/admin/products/(\d+)/media/(\d+)$#', $path, $m) && $method === 'DELETE') {
        Auth::requireEditor();
        require_once __DIR__ . '/../src/Controllers/AdminImagesController.php';
        AdminImagesController::removeMedia($pdo, (int)$m[1], (int)$m[2]);
    }

    /* ========== ADMIN: CANDIES (справочник конфет, Task 50) ========== */
    if ($path === '/api/admin/candies' && $method === 'GET') {
        require_once __DIR__ . '/../src/Controllers/AdminCandyController.php';
        AdminCandyController::list($pdo);
    }
    if ($path === '/api/admin/candies/options' && $method === 'GET') {
        require_once __DIR__ . '/../src/Controllers/AdminCandyController.php';
        AdminCandyController::options($pdo);
    }
    if ($path === '/api/admin/candies' && $method === 'POST') {
        require_once __DIR__ . '/../src/Controllers/AdminCandyController.php';
        AdminCandyController::create($pdo);
    }
    if (preg_match('#^/api/admin/candies/(\d+)$#', $path, $m)) {
        require_once __DIR__ . '/../src/Controllers/AdminCandyController.php';
        $id = (int)$m[1];
        if ($method === 'POST')   AdminCandyController::update($pdo, $id);
        if ($method === 'DELETE') AdminCandyController::destroy($pdo, $id);
    }

    /* ========== ADMIN: CANDY SETS (кастомные наборы конфет, Task 50) ========== */
    if ($path === '/api/admin/candy-sets' && $method === 'GET') {
        require_once __DIR__ . '/../src/Controllers/AdminCandySetController.php';
        AdminCandySetController::list($pdo);
    }
    if ($path === '/api/admin/candy-sets' && $method === 'POST') {
        require_once __DIR__ . '/../src/Controllers/AdminCandySetController.php';
        AdminCandySetController::create($pdo);
    }
    if (preg_match('#^/api/admin/candy-sets/(\d+)$#', $path, $m)) {
        require_once __DIR__ . '/../src/Controllers/AdminCandySetController.php';
        $id = (int)$m[1];
        if ($method === 'POST')   AdminCandySetController::update($pdo, $id);
        if ($method === 'DELETE') AdminCandySetController::destroy($pdo, $id);
    }

    /* ========== ADMIN: BUNDLE ========== */
    if (preg_match('#^/api/admin/products/(\d+)/bundle$#', $path, $m)) {
        require_once __DIR__ . '/../src/Controllers/AdminBundleController.php';
        $id = (int)$m[1];
        if ($method === 'GET') {
            AdminBundleController::list($pdo, $id);
        }
        if ($method === 'POST') {
            Auth::requireEditor();
            AdminBundleController::addComponent($pdo, $id);
        }
    }
    if (preg_match('#^/api/admin/products/(\d+)/bundle/(\d+)$#', $path, $m)) {
        require_once __DIR__ . '/../src/Controllers/AdminBundleController.php';
        $pid = (int)$m[1];
        $iid = (int)$m[2];
        if ($method === 'POST') {
            Auth::requireEditor();
            AdminBundleController::updateComponent($pdo, $pid, $iid);
        }
        if ($method === 'DELETE') {
            Auth::requireEditor();
            AdminBundleController::removeComponent($pdo, $pid, $iid);
        }
    }

    jsonResponse([
        'error' => 'Not found',
        'path' => $path,
        'method' => $method,
    ], 404);

} catch (Throwable $e) {
    jsonResponse([
        'error' => $e->getMessage(),
        'file'  => basename($e->getFile()),
        'line'  => $e->getLine(),
    ], 500);
}