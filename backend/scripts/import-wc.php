<?php
require __DIR__ . '/../src/Database.php';

$csvPath = $argv[1] ?? null;
if (!$csvPath || !file_exists($csvPath)) {
    fwrite(STDERR, "Ukazhi put k CSV: php scripts/import-wc.php ../wc-product-export.csv\n");
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

function translit(string $s): string
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
    return $s !== '' ? $s : 'product';
}

/**
 * WC кладёт в описание HTML (<p>, <br>, сущности). Фронт рендерит
 * products.description как plain text с whitespace-pre-line —
 * поэтому чистим теги и оставляем переносы строк.
 */
function cleanDescription(?string $html): ?string
{
    if ($html === null) return null;
    $s = trim($html);
    if ($s === '') return null;
    $s = preg_replace('#<br\s*/?>#i', "\n", $s);
    $s = preg_replace('#</p>\s*<p[^>]*>#i', "\n\n", $s);
    $s = preg_replace('#</?(p|div|span|h[1-6]|ul|ol|li|strong|b|em|i|a|figure|img)[^>]*>#i', '', $s ?? '');
    $s = html_entity_decode($s ?? '', ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $s = preg_replace("/[ \t]+\n/", "\n", $s ?? '');
    $s = preg_replace("/\n{3,}/", "\n\n", $s ?? '');
    $s = trim($s ?? '');
    return $s !== '' ? $s : null;
}

function mapCategorySlug(string $name): ?string
{
    $map = [
        'наборы' => 'nabory',
        'vip подарки' => 'vip',
        'vip' => 'vip',
        'жесть' => 'zhest',
        'игрушки' => 'igrushki',
        'картон' => 'karton',
        'мешочки' => 'meshochki',
        'текстиль' => 'tekstil',
        'тубы' => 'tuby',
        'подарки детям' => 'nabory',
        'подарки' => 'nabory',
    ];
    $key = mb_strtolower(trim($name), 'UTF-8');
    return $map[$key] ?? null;
}

$pdo = Database::get();
$pdo->exec("BEGIN IMMEDIATE");

$handle = fopen($csvPath, 'r');
if (!$handle) {
    fwrite(STDERR, "Ne otkryvaetsya fajl\n");
    exit(1);
}

$header = fgetcsv($handle, 0, ',', '"', '');
if (!$header) {
    fwrite(STDERR, "CSV pust\n");
    exit(1);
}

if (isset($header[0])) {
    $header[0] = preg_replace('/^\xEF\xBB\xBF/', '', $header[0]);
    $header[0] = trim($header[0]);
}

$col = array_flip($header);

$catSlugToId = [];
foreach ($pdo->query('SELECT id, slug FROM categories')->fetchAll() as $c) {
    $catSlugToId[$c['slug']] = (int)$c['id'];
}

$imported = 0;
$skipped = 0;
$bundles = [];

while (($row = fgetcsv($handle, 0, ',', '"', '')) !== false) {
    if ($row === [null]) continue;
    if (count(array_filter($row, fn($v) => $v !== null && $v !== '')) === 0) continue;

    $type = Col($row, $col, ['Тип', 'Type']) ?? 'simple';
    if (!in_array($type, ['simple', 'woosb'], true)) { $skipped++; continue; }

    $legacyId = (int)(Col($row, $col, ['ID']) ?? 0);
    if (!$legacyId) { $skipped++; continue; }

    $name = trim(Col($row, $col, ['Имя', 'Название', 'Name']) ?? '');
    if ($name === '') { $skipped++; continue; }

    $sku = trim(Col($row, $col, ['Артикул', 'SKU']) ?? '');
    if ($sku === '') $sku = 'SKU-' . $legacyId;

    $slug = translit($name) . '-' . $legacyId;

    $rawBase = Col($row, $col, ['Базовая цена', 'Обычная цена', 'Regular price']) ?? '0';
    $rawSale = Col($row, $col, ['Акционная цена', 'Цена со скидкой', 'Sale price']) ?? '0';
    $base = (float)str_replace(',', '.', $rawBase);
    $sale = (float)str_replace(',', '.', $rawSale);

    $priceKopecks = (int)round(($sale > 0 ? $sale : $base) * 100);
    $oldPriceKopecks = ($sale > 0 && $base > 0) ? (int)round($base * 100) : null;

    $visibility = strtolower(trim(Col($row, $col, ['Видимость в каталоге', 'Catalog visibility']) ?? 'visible'));
    $isPublished = (int)(Col($row, $col, ['Опубликован', 'Published']) ?? '1') === 1 ? 1 : 0;

    $showInCatalog = ($priceKopecks > 0 && $isPublished && !in_array($visibility, ['hidden', 'скрытый'], true)) ? 1 : 0;

    $categoryId = null;
    $catsRaw = trim(Col($row, $col, ['Категории', 'Categories']) ?? '');
    if ($catsRaw !== '') {
        $parts = preg_split('/\s*>\s*|\s*,\s*/', $catsRaw);
        foreach (array_reverse($parts) as $part) {
            $slugCat = mapCategorySlug($part);
            if ($slugCat && isset($catSlugToId[$slugCat])) {
                $categoryId = $catSlugToId[$slugCat];
                break;
            }
        }
    }

    $stock = (int)(Col($row, $col, ['Запасы', 'Stock']) ?? '0');

    // Описание: полное «Описание», при отсутствии — «Краткое описание»
    $description = cleanDescription(Col($row, $col, ['Описание', 'Description']))
        ?? cleanDescription(Col($row, $col, ['Краткое описание', 'Short description']));

    $stmt = $pdo->prepare(<<<SQL
        INSERT INTO products
            (legacy_wc_id, sku, slug, name, description, type, price_kopecks, old_price_kopecks,
             category_id, show_in_catalog, is_published, stock_qty)
        VALUES
            (:legacy_id, :sku, :slug, :name, :description, :type, :price, :old_price,
             :category_id, :show_in_catalog, :is_published, :stock)
        ON CONFLICT(legacy_wc_id) DO UPDATE SET
            sku = excluded.sku,
            name = excluded.name,
            slug = excluded.slug,
            description = COALESCE(NULLIF(excluded.description, ''), products.description),
            price_kopecks = excluded.price_kopecks,
            old_price_kopecks = excluded.old_price_kopecks,
            category_id = excluded.category_id,
            show_in_catalog = excluded.show_in_catalog,
            is_published = excluded.is_published,
            stock_qty = excluded.stock_qty
    SQL);

    $stmt->execute([
        ':legacy_id' => $legacyId,
        ':sku' => $sku,
        ':slug' => $slug,
        ':name' => $name,
        ':description' => $description,
        ':type' => $type === 'woosb' ? 'bundle' : 'simple',
        ':price' => $priceKopecks,
        ':old_price' => $oldPriceKopecks,
        ':category_id' => $categoryId,
        ':show_in_catalog' => $showInCatalog,
        ':is_published' => $isPublished,
        ':stock' => $stock,
    ]);

    // ВАЖНО: lastInsertId() в SQLite — это rowid последней реальной INSERT
    // на соединении (безотносительно таблицы). После upsert с веткой UPDATE
    // он вернёт мусор (например, id картинки из product_images), поэтому id
    // товара всегда разрешаем явным SELECT.
    $idStmt = $pdo->prepare('SELECT id FROM products WHERE legacy_wc_id = ?');
    $idStmt->execute([$legacyId]);
    $productId = (int)$idStmt->fetchColumn();
    if ($productId === 0) {
        $productId = (int)$pdo->lastInsertId();
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

    $woosbIds = Col($row, $col, ['Мета: woosb_ids']);
    if ($woosbIds) $bundles[$productId] = $woosbIds;

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
            $compLegacyId = (int)($item['id'] ?? 0);
            $qty = (int)($item['qty'] ?? 0);
            if (!$compLegacyId || $qty <= 0) continue;
            $lookup->execute([$compLegacyId]);
            $compId = (int)$lookup->fetchColumn();
            if ($compId) {
                $insert->execute([$productId, $compId, $qty]);
                $components++;
            }
        }
    }
}

// Типы: товар, входящий составом в наборы (конфеты и пр.) — это
// «часть набора» (recipe), а не самостоятельный товар (simple).
// bundle не трогаем; товары без legacy_wc_id (созданные вручную) не трогаем.
$pdo->exec("
    UPDATE products SET type = 'recipe'
    WHERE type = 'simple'
      AND legacy_wc_id IS NOT NULL
      AND id IN (SELECT DISTINCT component_id FROM bundle_items)
");
$recipeSynced = $pdo->query(
    "SELECT COUNT(*) FROM products WHERE type = 'recipe' AND legacy_wc_id IS NOT NULL
     AND id NOT IN (SELECT DISTINCT component_id FROM bundle_items)"
)->fetchColumn();
if ($recipeSynced > 0) {
    // импортированный товар больше не входит ни в один набор — снова простой
    $pdo->exec("
        UPDATE products SET type = 'simple'
        WHERE type = 'recipe'
          AND legacy_wc_id IS NOT NULL
          AND id NOT IN (SELECT DISTINCT component_id FROM bundle_items)
    ");
}

$pdo->exec("COMMIT");

echo "OK importirovano: {$imported}, propushcheno: {$skipped}, komponentov: {$components}\n";