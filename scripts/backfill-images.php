<?php
/* Одноразовый догрузчик: у 14 товаров вторая картинка есть только на lakomkakhv.ru.
   Качаем её в public/uploads/products/{slug}/ как ext-{maxN+1}.{ext}, чтобы экспорт
   ZIP работал полностью на локальных файлах (без сетевых таймаутов и 502). */

$pdo = new PDO('sqlite:' . __DIR__ . '/../backend/storage/database.sqlite');
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$root = __DIR__ . '/../public/uploads/products';
$rows = $pdo->query(
    "SELECT p.id, p.slug, COUNT(pi.id) AS imgs
     FROM products p JOIN product_images pi ON pi.product_id = p.id AND pi.media_type = 'image'
     GROUP BY p.id"
)->fetchAll(PDO::FETCH_ASSOC);

$done = 0; $fail = [];
foreach ($rows as $r) {
    $dir = $root . '/' . $r['slug'];
    if (!is_dir($dir)) { $fail[] = $r['slug'] . ' (нет папки)'; continue; }
    $have = glob($dir . '/*.*') ?: [];
    if (count($have) >= (int)$r['imgs']) continue; // покрытие полное

    // Нужны картинки с позиций, начиная с count($have) (порядок как в экспорте)
    $st = $pdo->prepare(
        "SELECT url FROM product_images
         WHERE product_id = ? AND media_type = 'image'
         ORDER BY sort_order, id"
    );
    $st->execute([$r['id']]);
    $urls = $st->fetchAll(PDO::FETCH_COLUMN);

    // Максимальный номер среди уже лежащих файлов (ext-429.png -> 429)
    $maxN = 0;
    foreach ($have as $f) {
        $n = (int)preg_replace('/\D/', '', basename($f));
        if ($n > $maxN) $maxN = $n;
    }

    for ($i = count($have); $i < (int)$r['imgs']; $i++) {
        $url = $urls[$i] ?? null;
        if (!$url || !str_starts_with($url, 'http')) { $fail[] = $r['slug'] . " (позиция $i не внешняя)"; continue; }
        $maxN++;
        $ext = strtolower(pathinfo(parse_url($url, PHP_URL_PATH) ?? '', PATHINFO_EXTENSION)) ?: 'jpg';
        if ($ext === 'jpeg') $ext = 'jpg';
        $dest = sprintf('%s/ext-%d.%s', $dir, $maxN, $ext);

        $ok = false;
        for ($try = 1; $try <= 2 && !$ok; $try++) {
            $ctx = stream_context_create(['http' => ['timeout' => 20, 'ignore_errors' => true]]);
            $blob = @file_get_contents($url, false, $ctx);
            if ($blob !== false && strlen($blob) > 1000) {
                file_put_contents($dest, $blob);
                $ok = true;
            }
        }
        if ($ok) { $done++; echo "OK  {$r['slug']} <- $url (" . strlen($blob) . " B)\n"; }
        else { $fail[] = $r['slug'] . " <- $url"; }
    }
}

echo "Догружено: $done\n";
if ($fail) { echo "Не удалось:\n" . implode("\n", $fail) . "\n"; }
