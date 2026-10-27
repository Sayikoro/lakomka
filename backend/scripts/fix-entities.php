<?php
require __DIR__ . '/../src/Database.php';

$pdo = Database::get();

$pdo->exec('BEGIN IMMEDIATE');
try {
    $products = $pdo->query(
        'SELECT id, name, description, manufacturer FROM products'
    )->fetchAll();

    $upd = $pdo->prepare(
        'UPDATE products SET name = ?, description = ?, manufacturer = ? WHERE id = ?'
    );

    $fixed = 0;
    $details = [];

    foreach ($products as $p) {
        $newName = html_entity_decode($p['name'], ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $newDesc = $p['description'] !== null
            ? html_entity_decode($p['description'], ENT_QUOTES | ENT_HTML5, 'UTF-8')
            : null;
        $newMan  = $p['manufacturer'] !== null
            ? html_entity_decode($p['manufacturer'], ENT_QUOTES | ENT_HTML5, 'UTF-8')
            : null;

        if ($newName !== $p['name'] || $newDesc !== $p['description'] || $newMan !== $p['manufacturer']) {
            $upd->execute([$newName, $newDesc, $newMan, $p['id']]);
            $fixed++;
            if (count($details) < 10) {
                $details[] = [
                    'old_name' => $p['name'],
                    'new_name' => $newName,
                    'old_man'  => $p['manufacturer'],
                    'new_man'  => $newMan,
                ];
            }
        }
    }

    // Картинки — alt
    $imgs = $pdo->query('SELECT id, alt FROM product_images WHERE alt IS NOT NULL')->fetchAll();
    $updImg = $pdo->prepare('UPDATE product_images SET alt = ? WHERE id = ?');
    $imgFixed = 0;
    foreach ($imgs as $im) {
        $newAlt = html_entity_decode($im['alt'], ENT_QUOTES | ENT_HTML5, 'UTF-8');
        if ($newAlt !== $im['alt']) {
            $updImg->execute([$newAlt, $im['id']]);
            $imgFixed++;
        }
    }

    $pdo->exec('COMMIT');

    echo "OK: tovarov ispravleno: {$fixed}\n";
    echo "OK: alt kartinok ispravleno: {$imgFixed}\n";

    if ($details) {
        echo "\nPrimery:\n";
        foreach ($details as $d) {
            echo "  name: {$d['old_name']}  =>  {$d['new_name']}\n";
            if ($d['old_man'] !== null || $d['new_man'] !== null) {
                echo "  man:  {$d['old_man']}  =>  {$d['new_man']}\n";
            }
        }
    }
} catch (Throwable $e) {
    $pdo->exec('ROLLBACK');
    fwrite(STDERR, "ERROR: " . $e->getMessage() . "\n");
    exit(1);
}