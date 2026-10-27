<?php
require '/home/z/my-project/backend/src/Database.php';
$pdo = Database::get();
$rows = $pdo->query("SELECT key, value FROM settings WHERE key LIKE '%mail%' OR key LIKE '%smtp%' OR key LIKE '%email%' OR key LIKE '%site_url%'")->fetchAll(PDO::FETCH_ASSOC);
foreach ($rows as $r) {
  $v = $r['value'];
  if (strpos($r['key'], 'pass') !== false) $v = substr($v, 0, 3) . '***(' . strlen($r['value']) . ' chars)';
  echo $r['key'], ' = ', $v, PHP_EOL;
}
