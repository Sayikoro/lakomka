<?php
/* Task 58: снапшот живой БД перед коммитом.
 * 1) integrity_check — убеждаемся, что коммитим здоровую базу
 * 2) wal_checkpoint(TRUNCATE) — вливаем WAL в основной файл,
 *    чтобы скопировать ОДИН файл без потери последних транзакций
 * 3) контрольные счётчики для сверки копии
 */

require_once '/home/z/my-project/backend/src/Database.php';

$pdo = Database::get();

$check = $pdo->query('PRAGMA integrity_check')->fetchColumn();
echo "INTEGRITY\t$check\n";
if ($check !== 'ok') {
    fwrite(STDERR, "БД повреждена — коммит отменяй и разбирайся!\n");
    exit(1);
}

$pdo->exec('PRAGMA wal_checkpoint(TRUNCATE)');
echo "CHECKPOINT\tok\n";

foreach (['products', 'product_images', 'categories', 'weight_recipes', 'candy_sets', 'candy_set_items', 'orders', 'users', 'settings'] as $t) {
    try {
        echo "COUNT_$t\t" . $pdo->query("SELECT COUNT(*) FROM \"$t\"")->fetchColumn() . "\n";
    } catch (Throwable $e) {
        echo "COUNT_$t\tMISSING\n";
    }
}

echo "SIZE\t" . filesize('/home/z/my-project/backend/storage/database.sqlite') . " bytes\n";

/* 4) Копия в клон для коммита + верификация копии */
$dst = '/home/z/my-project/lakomka/backend/storage/database.sqlite';
if (!copy('/home/z/my-project/backend/storage/database.sqlite', $dst)) {
    fwrite(STDERR, "COPY FAILED\n");
    exit(1);
}
clearstatcache();
echo "COPIED\t" . filesize($dst) . " bytes -> lakomka/backend/storage/\n";

$copy = new PDO('sqlite:' . $dst);
$copy->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
echo "COPY_INTEGRITY\t" . $copy->query('PRAGMA integrity_check')->fetchColumn() . "\n";
foreach (['products', 'product_images', 'categories', 'weight_recipes', 'candy_sets', 'users', 'settings'] as $t) {
    echo "COPY_$t\t" . $copy->query("SELECT COUNT(*) FROM \"$t\"")->fetchColumn() . "\n";
}
/* В копии не должно быть секретов: smtp_pass пуст, .env не в репо */
$smtp = $copy->query("SELECT COUNT(*) FROM settings WHERE key LIKE '%smtp_pass%' AND value != ''")->fetchColumn();
echo "COPY_SMTP_PASS_NONEMPTY\t$smtp\n";
