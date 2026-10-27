# check.ps1
$ErrorActionPreference = "Continue"
$root = (Get-Location).Path

if (-not (Test-Path (Join-Path $root "package.json"))) {
    Write-Host "❌ Запусти скрипт из корня lakomka-shop" -ForegroundColor Red
    exit 1
}

$php = "C:\Users\Andrew\AppData\Local\Microsoft\WinGet\Packages\PHP.PHP.8.4_Microsoft.Winget.Source_8wekyb3d8bbwe\php.exe"
if (-not (Test-Path $php)) {
    $php = (Get-Command php -ErrorAction SilentlyContinue).Source
}

function Pass($msg) { Write-Host "  ✓ $msg" -ForegroundColor Green }
function Fail($msg) { Write-Host "  ✗ $msg" -ForegroundColor Red }
function Warn($msg) { Write-Host "  ! $msg" -ForegroundColor Yellow }
function Section($msg) { Write-Host ""; Write-Host "== $msg ==" -ForegroundColor Cyan }

# ============================================================
# 1. ФАЙЛЫ
# ============================================================
Section "1. Файлы"

$files = @(
    "backend\public\index.php",
    "backend\src\Database.php",
    "backend\src\Auth.php",
    "backend\src\Mailer.php",
    "backend\src\Controllers\OrderController.php",
    "backend\src\Controllers\AuthController.php",
    "backend\src\Controllers\AdminOrdersController.php",
    "backend\src\Controllers\AdminSettingsController.php",
    "backend\src\Controllers\AdminProductsController.php",
    "backend\src\Controllers\AdminBundleController.php",
    "backend\src\Controllers\AdminImagesController.php",
    "backend\config.php",
    "backend\storage\database.sqlite",
    "backend\scripts\add-video-column.php",
    "backend\scripts\add-legacy-slug.php",
    "backend\lib\PHPMailer\PHPMailer.php",
    "src\app\admin\products\page.tsx",
    "src\app\admin\products\new\page.tsx",
    "src\app\admin\products\[id]\page.tsx",
    "src\components\admin\ProductsTable.tsx",
    "src\components\admin\ProductForm.tsx",
    "src\components\admin\BundleEditor.tsx",
    "src\components\admin\ImageUploader.tsx",
    "src\components\admin\VideoField.tsx",
    "src\components\ui\VideoEmbed.tsx",
    "src\lib\products.ts",
    "src\lib\site.ts"
)

foreach ($f in $files) {
    if (Test-Path (Join-Path $root $f)) { Pass $f } else { Fail $f }
}

# ============================================================
# 2. ПАПКА UPLOADS
# ============================================================
Section "2. Папка uploads"

$uploads = Join-Path $root "public\uploads\products"
if (Test-Path $uploads) {
    $count = (Get-ChildItem $uploads -Recurse -File -ErrorAction SilentlyContinue).Count
    Pass "public\uploads\products существует (файлов: $count)"
} else {
    Warn "public\uploads\products ОТСУТСТВУЕТ (создастся при загрузке первой картинки)"
}

# ============================================================
# 3. БД — КОЛОНКИ
# ============================================================
Section "3. БД — схема"

if ($php -and (Test-Path (Join-Path $root "backend\storage\database.sqlite"))) {
    Push-Location (Join-Path $root "backend")
    try {
        $cols = & $php -r "require 'src/Database.php'; `$pdo = Database::get(); `$c = `$pdo->query('PRAGMA table_info(products)')->fetchAll(); foreach (`$c as `$x) echo `$x['name'].PHP_EOL;" 2>$null

        foreach ($needed in @("id","name","slug","sku","price_kopecks","stock_qty","video_url","legacy_slug","category_id","show_in_catalog","is_published")) {
            if ($cols -contains $needed) { Pass "products.$needed" } else { Fail "products.$needed ОТСУТСТВУЕТ" }
        }

        $imgCols = & $php -r "require 'src/Database.php'; `$pdo = Database::get(); `$c = `$pdo->query('PRAGMA table_info(product_images)')->fetchAll(); foreach (`$c as `$x) echo `$x['name'].PHP_EOL;" 2>$null
        foreach ($needed in @("id","product_id","url","alt","sort_order")) {
            if ($imgCols -contains $needed) { Pass "product_images.$needed" } else { Fail "product_images.$needed ОТСУТСТВУЕТ" }
        }
    } finally { Pop-Location }
} else {
    Fail "PHP или БД не найдены"
}

# ============================================================
# 4. БД — ДАННЫЕ
# ============================================================
Section "4. БД — данные"

if ($php) {
    Push-Location (Join-Path $root "backend")
    try {
        & $php -r @"
require 'src/Database.php';
`$pdo = Database::get();
function n(`$pdo, `$sql) { return (int)`$pdo->query(`$sql)->fetchColumn(); }
echo "products: " . n(`$pdo, 'SELECT COUNT(*) FROM products') . PHP_EOL;
echo "  bundles: " . n(`$pdo, 'SELECT COUNT(*) FROM products WHERE type=''bundle''') . PHP_EOL;
echo "  s video_url: " . n(`$pdo, 'SELECT COUNT(*) FROM products WHERE video_url IS NOT NULL') . PHP_EOL;
echo "  s legacy_slug: " . n(`$pdo, 'SELECT COUNT(*) FROM products WHERE legacy_slug IS NOT NULL') . PHP_EOL;
echo "product_images: " . n(`$pdo, 'SELECT COUNT(*) FROM product_images') . PHP_EOL;
echo "  s local /uploads: " . n(`$pdo, 'SELECT COUNT(*) FROM product_images WHERE url LIKE ''/uploads/%''') . PHP_EOL;
echo "  s remote URL: " . n(`$pdo, 'SELECT COUNT(*) FROM product_images WHERE url LIKE ''http%''') . PHP_EOL;
echo "bundle_items: " . n(`$pdo, 'SELECT COUNT(*) FROM bundle_items') . PHP_EOL;
echo "categories: " . n(`$pdo, 'SELECT COUNT(*) FROM categories') . PHP_EOL;
echo "orders: " . n(`$pdo, 'SELECT COUNT(*) FROM orders') . PHP_EOL;
echo "users: " . n(`$pdo, 'SELECT COUNT(*) FROM users') . PHP_EOL;
"@ 2>$null
    } finally { Pop-Location }
}

# ============================================================
# 5. PHP-СЕРВЕР
# ============================================================
Section "5. PHP-сервер :8000"

$listen8000 = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
if ($listen8000) {
    Pass "порт 8000 слушается"
    try {
        $health = Invoke-RestMethod -Uri "http://localhost:8000/api/health" -TimeoutSec 3
        if ($health.status -eq "ok") { Pass "/api/health отвечает" } else { Fail "/api/health не ok" }
    } catch { Fail "/api/health: $($_.Exception.Message)" }
} else {
    Fail "порт 8000 НЕ слушается — PHP-сервер не запущен"
}

# ============================================================
# 6. NEXT.JS
# ============================================================
Section "6. Next.js :3000"

$listen3000 = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($listen3000) {
    Pass "порт 3000 слушается"
} else {
    Fail "порт 3000 НЕ слушается — npm run dev не запущен"
}

# ============================================================
# 7. API — ПУБЛИЧНЫЕ ENDPOINTS
# ============================================================
Section "7. API — публичные"

$endpoints = @(
    "/api/health",
    "/api/categories",
    "/api/products"
)
foreach ($ep in $endpoints) {
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:8000$ep" -TimeoutSec 5 -UseBasicParsing
        Pass "$ep → $($r.StatusCode)"
    } catch {
        Fail "$ep → $($_.Exception.Message)"
    }
}

# ============================================================
# 8. API — ADMIN (без токена, ожидаем 401)
# ============================================================
Section "8. API — admin (проверка, что роут живой)"

$adminEps = @(
    "/api/admin/products",
    "/api/admin/products/1",
    "/api/admin/products/1/bundle",
    "/api/admin/orders",
    "/api/admin/settings"
)
foreach ($ep in $adminEps) {
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:8000$ep" -TimeoutSec 5 -UseBasicParsing
        Warn "$ep → $($r.StatusCode) (ожидался 401)"
    } catch {
        $code = $_.Exception.Response.StatusCode.value__
        if ($code -eq 401) {
            Pass "$ep → 401 (нужна авторизация — роут есть)"
        } elseif ($code -eq 404) {
            Fail "$ep → 404 (роут НЕ зарегистрирован в index.php)"
        } else {
            Warn "$ep → $code $($_.Exception.Message)"
        }
    }
}

# ============================================================
# 9. ПРОВЕРКА REQ МЕТОДА
# ============================================================
Section "9. API — несуществующий роут"

try {
    $r = Invoke-WebRequest -Uri "http://localhost:8000/api/nonsense" -TimeoutSec 5 -UseBasicParsing
    Warn "неожиданный 200 на /api/nonsense"
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    if ($code -eq 404) { Pass "404 на неизвестный роут (правильно)" }
    else { Warn "код $code на /api/nonsense" }
}

# ============================================================
# ИТОГ
# ============================================================
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Если увидел красное — там и проблема." -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan