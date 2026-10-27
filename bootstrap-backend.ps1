# bootstrap-backend.ps1
$ErrorActionPreference = 'Stop'
$root = (Get-Location).Path
$backend = Join-Path $root 'backend'

if (-not (Get-Command php -ErrorAction SilentlyContinue)) {
    Write-Host "❌ PHP не найден в PATH. Установи PHP 8.1+ и добавь в PATH." -ForegroundColor Red
    exit 1
}
$phpVersion = (php -r "echo PHP_VERSION;")
Write-Host "✅ PHP $phpVersion"

Write-Host "`n📁 Создаю структуру backend/"
$dirs = @(
    'backend',
    'backend/public',
    'backend/src',
    'backend/src/Controllers',
    'backend/storage',
    'backend/scripts'
)
foreach ($d in $dirs) {
    $p = Join-Path $root $d
    if (-not (Test-Path $p)) {
        New-Item -ItemType Directory -Force -Path $p | Out-Null
        Write-Host "  + $d"
    }
}

function Save-File {
    param([string]$RelPath, [string]$Content)
    $full = Join-Path $root $RelPath
    $dir = Split-Path $full -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    [System.IO.File]::WriteAllText($full, $Content, [System.Text.UTF8Encoding]::new($false))
    Write-Host "  ✓ $RelPath"
}

# ============================================================
# config.php
# ============================================================
Save-File 'backend/config.php' @'
<?php

return [
    'db_path' => __DIR__ . '/storage/database.sqlite',
    'debug'   => true,
    'admin_email' => 'admin@lakomka.local',
];
'@

# ============================================================
# src/Database.php
# ============================================================
Save-File 'backend/src/Database.php' @'
<?php

class Database
{
    private static ?PDO $instance = null;

    public static function get(): PDO
    {
        if (self::$instance instanceof PDO) {
            return self::$instance;
        }

        $config = require __DIR__ . '/../config.php';
        $dbPath = $config['db_path'];

        $pdo = new PDO('sqlite:' . $dbPath);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

        $pdo->exec('PRAGMA journal_mode = WAL');
        $pdo->exec('PRAGMA busy_timeout = 5000');
        $pdo->exec('PRAGMA foreign_keys = ON');
        $pdo->exec('PRAGMA synchronous = NORMAL');

        self::$instance = $pdo;
        return $pdo;
    }
}
'@

# ============================================================
# scripts/migrate.php
# ============================================================
Save-File 'backend/scripts/migrate.php' @'
<?php
require __DIR__ . '/../src/Database.php';

$pdo = Database::get();

$pdo->exec(<<<SQL
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT,
    role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    legacy_wc_id INTEGER UNIQUE,
    sku TEXT,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL CHECK (type IN ('simple', 'bundle')),
    price_kopecks INTEGER NOT NULL DEFAULT 0,
    old_price_kopecks INTEGER,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    packaging_material TEXT,
    show_in_catalog INTEGER NOT NULL DEFAULT 1,
    is_published INTEGER NOT NULL DEFAULT 1,
    stock_qty INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS product_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    alt TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS product_attributes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bundle_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    component_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1,
    UNIQUE(product_id, component_id)
);

CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT UNIQUE NOT NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_email TEXT,
    delivery_method TEXT NOT NULL CHECK (delivery_method IN ('pickup', 'city', 'region', 'tk')),
    address TEXT,
    comment TEXT,
    total_kopecks INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','confirmed','paid','shipped','done','cancelled')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    qty INTEGER NOT NULL,
    price_kopecks INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS order_status_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    comment TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_catalog ON products(show_in_catalog, is_published);
CREATE INDEX IF NOT EXISTS idx_images_product ON product_images(product_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_bundle_product ON bundle_items(product_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, created_at);
SQL);

echo "OK migratsiya vypolnena`n";
'@

# ============================================================
# scripts/import-wc.php
# ============================================================
Save-File 'backend/scripts/import-wc.php' @'
<?php
require __DIR__ . '/../src/Database.php';

$csvPath = $argv[1] ?? null;
if (!$csvPath || !file_exists($csvPath)) {
    fwrite(STDERR, "Ukazhi put k CSV: php scripts/import-wc.php ../wc-product-export.csv`n");
    exit(1);
}

function Col(array $row, array $col, array $aliases): ?string
{
    foreach ($aliases as $name) {
        if (isset($col[$name])) {
            $v = $row[$col[$name]] ?? '';
            return ($v === '') ? null : $v;
        }
    }
    return null;
}

$pdo = Database::get();
$pdo->exec("BEGIN IMMEDIATE");

$handle = fopen($csvPath, 'r');
$header = fgetcsv($handle);
if (!$header) {
    fwrite(STDERR, "CSV pust ili ne chitaetsya`n");
    exit(1);
}
$col = array_flip($header);

$imported = 0;
$bundles = [];

while (($row = fgetcsv($handle)) !== false) {
    $type = Col($row, $col, ['Тип', 'Type']) ?? 'simple';
    if (!in_array($type, ['simple', 'woosb'], true)) continue;

    $legacyId = (int)(Col($row, $col, ['ID']) ?? 0);
    if (!$legacyId) continue;

    $name = trim(Col($row, $col, ['Название', 'Name']) ?? '');
    if ($name === '') continue;

    $slug = trim(Col($row, $col, ['Слаг', 'Slug']) ?? '') ?: 'product-' . $legacyId;
    $sku  = trim(Col($row, $col, ['Артикул', 'SKU']) ?? '');

    $rawPrice = Col($row, $col, ['Обычная цена', 'Regular price']) ?? '0';
    $rawSale  = Col($row, $col, ['Цена со скидкой', 'Sale price']) ?? '0';
    $price = (float)str_replace(',', '.', $rawPrice);
    $sale  = (float)str_replace(',', '.', $rawSale);

    $priceKopecks = (int)round(($sale > 0 ? $sale : $price) * 100);
    $oldPriceKopecks = ($sale > 0 && $price > 0) ? (int)round($price * 100) : null;

    $showInCatalog = ($priceKopecks === 0) ? 0 : 1;

    $stmt = $pdo->prepare(<<<SQL
        INSERT INTO products
            (legacy_wc_id, sku, slug, name, type, price_kopecks, old_price_kopecks,
             show_in_catalog, is_published, stock_qty)
        VALUES
            (:legacy_id, :sku, :slug, :name, :type, :price, :old_price,
             :show_in_catalog, 1, :stock)
        ON CONFLICT(legacy_wc_id) DO UPDATE SET
            sku = excluded.sku,
            name = excluded.name,
            slug = excluded.slug,
            price_kopecks = excluded.price_kopecks,
            old_price_kopecks = excluded.old_price_kopecks,
            show_in_catalog = excluded.show_in_catalog
    SQL);

    $stmt->execute([
        ':legacy_id' => $legacyId,
        ':sku' => $sku,
        ':slug' => $slug,
        ':name' => $name,
        ':type' => $type === 'woosb' ? 'bundle' : 'simple',
        ':price' => $priceKopecks,
        ':old_price' => $oldPriceKopecks,
        ':show_in_catalog' => $showInCatalog,
        ':stock' => (int)(Col($row, $col, ['Запасы', 'Stock']) ?? 0),
    ]);

    $productId = (int)$pdo->lastInsertId();
    if ($productId === 0) {
        $idStmt = $pdo->prepare('SELECT id FROM products WHERE legacy_wc_id = ?');
        $idStmt->execute([$legacyId]);
        $productId = (int)$idStmt->fetchColumn();
    }

    $imagesRaw = trim(Col($row, $col, ['Изображения', 'Images']) ?? '');
    if ($imagesRaw !== '') {
        $pdo->prepare('DELETE FROM product_images WHERE product_id = ?')->execute([$productId]);
        $sort = 0;
        foreach (explode(',', $imagesRaw) as $url) {
            $url = trim($url);
            if ($url === '') continue;
            $pdo->prepare('INSERT INTO product_images (product_id, url, sort_order) VALUES (?, ?, ?)')
                ->execute([$productId, $url, $sort++]);
        }
    }

    $woosbIds = Col($row, $col, ['Мета: woosb_ids', 'Meta: woosb_ids']);
    if ($woosbIds) {
        $bundles[$productId] = $woosbIds;
    }

    $imported++;
}

fclose($handle);

$components = 0;
if ($bundles) {
    $lookup = $pdo->prepare('SELECT id FROM products WHERE legacy_wc_id = ?');
    $insert = $pdo->prepare('INSERT OR IGNORE INTO bundle_items (product_id, component_id, quantity) VALUES (?, ?, ?)');
    $clear = $pdo->prepare('DELETE FROM bundle_items WHERE product_id = ?');

    foreach ($bundles as $productId => $json) {
        $decoded = json_decode($json, true);
        if (!is_array($decoded)) continue;

        $clear->execute([$productId]);
        foreach ($decoded as $item) {
            $componentLegacyId = (int)($item['id'] ?? 0);
            $qty = (int)($item['qty'] ?? 0);
            if (!$componentLegacyId || $qty <= 0) continue;

            $lookup->execute([$componentLegacyId]);
            $componentId = (int)$lookup->fetchColumn();
            if ($componentId) {
                $insert->execute([$productId, $componentId, $qty]);
                $components++;
            }
        }
    }
}

$pdo->exec("COMMIT");

echo "OK importirovano tovarov: {$imported}, komponentov: {$components}`n";
'@

# ============================================================
# scripts/seed-admin.php
# ============================================================
Save-File 'backend/scripts/seed-admin.php' @'
<?php
require __DIR__ . '/../src/Database.php';

$pdo = Database::get();

$email = 'admin@lakomka.local';
$pass  = 'changeme123';
$hash  = password_hash($pass, PASSWORD_DEFAULT);

$stmt = $pdo->prepare(
    'INSERT INTO users (email, password_hash, name, role)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash'
);
$stmt->execute([$email, $hash, 'Admin', 'admin']);

echo "OK admin: $email / $pass`n";
'@

# ============================================================
# scripts/seed-categories.php
# ============================================================
Save-File 'backend/scripts/seed-categories.php' @'
<?php
require __DIR__ . '/../src/Database.php';

$pdo = Database::get();

$cats = [
    ['nabory',    'Наборы',      1],
    ['vip',       'VIP подарки', 2],
    ['zhest',     'Жесть',       3],
    ['igrushki',  'Игрушки',     4],
    ['karton',    'Картон',      5],
    ['meshochki', 'Мешочки',     6],
    ['tekstil',   'Текстиль',    7],
    ['tuby',      'Тубы',        8],
];

$stmt = $pdo->prepare(
    'INSERT INTO categories (slug, name, sort_order)
     VALUES (?, ?, ?)
     ON CONFLICT(slug) DO UPDATE SET name = excluded.name, sort_order = excluded.sort_order'
);

foreach ($cats as $c) {
    $stmt->execute($c);
}

echo "OK kategorij: " . count($cats) . "`n";
'@

# ============================================================
# public/index.php
# ============================================================
Save-File 'backend/public/index.php' @'
<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: http://localhost:3000');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require __DIR__ . '/../src/Database.php';

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$path = rtrim($path, '/') ?: '/';

$pdo = Database::get();

function jsonResponse(mixed $data, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function hydrateImages(PDO $pdo, array &$product): void
{
    $stmt = $pdo->prepare('SELECT url, alt FROM product_images WHERE product_id = ? ORDER BY sort_order');
    $stmt->execute([$product['id']]);
    $product['images'] = $stmt->fetchAll() ?: [];
}

try {
    if ($path === '/api/products' && $_SERVER['REQUEST_METHOD'] === 'GET') {
        $category = $_GET['category'] ?? null;
        $packaging = $_GET['packaging'] ?? null;

        $sql = 'SELECT p.* FROM products p WHERE p.show_in_catalog = 1 AND p.is_published = 1';
        $params = [];

        if ($category !== null) {
            $sql .= ' AND p.category_id = (SELECT id FROM categories WHERE slug = ?)';
            $params[] = $category;
        }
        if ($packaging !== null) {
            $sql .= ' AND p.packaging_material = ?';
            $params[] = $packaging;
        }

        $sql .= ' ORDER BY p.id DESC';

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $products = $stmt->fetchAll();

        foreach ($products as &$p) {
            hydrateImages($pdo, $p);
        }
        unset($p);

        jsonResponse(['data' => $products]);
    }

    if (preg_match('#^/api/products/([a-z0-9-]+)$#', $path, $m) && $_SERVER['REQUEST_METHOD'] === 'GET') {
        $stmt = $pdo->prepare('SELECT * FROM products WHERE slug = ? AND show_in_catalog = 1 AND is_published = 1');
        $stmt->execute([$m[1]]);
        $product = $stmt->fetch();

        if (!$product) {
            jsonResponse(['error' => 'Not found'], 404);
        }

        hydrateImages($pdo, $product);

        if ($product['type'] === 'bundle') {
            $bundleStmt = $pdo->prepare(<<<SQL
                SELECT b.quantity, p.name AS component_name, p.sku, p.slug AS component_slug
                FROM bundle_items b
                JOIN products p ON p.id = b.component_id
                WHERE b.product_id = ?
            SQL);
            $bundleStmt->execute([$product['id']]);
            $product['bundle_items'] = $bundleStmt->fetchAll() ?: [];
        }

        jsonResponse(['data' => $product]);
    }

    if ($path === '/api/categories' && $_SERVER['REQUEST_METHOD'] === 'GET') {
        $rows = $pdo->query('SELECT * FROM categories ORDER BY sort_order, name')->fetchAll();
        jsonResponse(['data' => $rows]);
    }

    if ($path === '/api/health') {
        jsonResponse(['status' => 'ok', 'time' => date('c')]);
    }

    jsonResponse(['error' => 'Not found'], 404);

} catch (Throwable $e) {
    jsonResponse(['error' => $e->getMessage()], 500);
}
'@

# ============================================================
# .gitignore
# ============================================================
Save-File 'backend/.gitignore' @'
storage/*.sqlite
storage/*.sqlite-*
storage/*.log
'@

# ============================================================
# ЗАПУСК МИГРАЦИИ И СИДА
# ============================================================
Write-Host "`n🔧 Запускаю миграцию…"
Push-Location $backend
try {
    php scripts/migrate.php
    php scripts/seed-categories.php
    php scripts/seed-admin.php

    Write-Host "`n📥 Ищу CSV для импорта…"
    $csv = Get-ChildItem -Path $root -Filter "wc-product-export*.csv" -File | Select-Object -First 1
    if ($csv) {
        Write-Host "  Найден: $($csv.Name) ($([math]::Round($csv.Length/1KB)) KB)"
        php scripts/import-wc.php $csv.FullName
    } else {
        Write-Host "  ⚠️  CSV не найден в корне проекта. Импортируй позже:" -ForegroundColor Yellow
        Write-Host "     cd backend; php scripts/import-wc.php `"путь\к\wc-product-export.csv`"" -ForegroundColor Yellow
    }
} finally {
    Pop-Location
}

Write-Host "`n✅ Backend готов"
Write-Host ""
Write-Host "Дальше:" -ForegroundColor Cyan
Write-Host "  cd backend" -ForegroundColor Cyan
Write-Host "  php -S localhost:8000 -t public" -ForegroundColor Cyan
Write-Host ""
Write-Host "Проверки:" -ForegroundColor Cyan
Write-Host "  curl http://localhost:8000/api/health" -ForegroundColor Cyan
Write-Host "  curl http://localhost:8000/api/products" -ForegroundColor Cyan
Write-Host "  curl http://localhost:8000/api/categories" -ForegroundColor Cyan