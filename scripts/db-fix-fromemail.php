<?php
require '/home/z/my-project/backend/src/Database.php';
$pdo = Database::get();
$fix = [
  'from_email'  => 'admin@fixme.org.ru',  // = ящик SMTP-авторизации (SpaceWeb требует совпадения)
  'admin_email' => 'admin@fixme.org.ru',  // реальный ящик для уведомлений о заказах
];
$stmt = $pdo->prepare('UPDATE settings SET value = ? WHERE key = ?');
foreach ($fix as $k => $v) {
  $n = $stmt->execute([$v, $k]);
  echo $k, ' -> ', $v, ' (rows: ', $stmt->rowCount(), ')', PHP_EOL;
}
