<?php
/* Аудит auth-покрытия: каждый public static метод контроллера — есть ли Auth::* в первых строках.
   Запуск: php scripts/security-audit-auth.php */
declare(strict_types=1);
$ROOT = dirname(__DIR__);
$dir = $ROOT . '/backend/src/Controllers';
$files = glob($dir . '/*.php');

/* Публичные (не требующие auth) методы по дизайну */
$knownPublic = [
    'AuthController'        => ['login', 'logout', 'me', 'bootstrap', 'firstRun'],
    'OrderController'       => ['create', 'track'],
    'PdfController'         => ['list'],
    'AdminCandySetController' => ['publicFilters'],
    'AdminSettingsController' => ['publicShow'],
    /* внутренние хелперы: в роутере не вызываются напрямую (проверено
       grep'ом по backend/public/index.php), auth стоит в вызывающих
       публичных методах */
    'AdminSiteUpdateController' => ['resolveTarget'],
    'PdfController@internal'    => ['dir', 'descriptions', 'info'],
];

printf("%-38s %-24s %-10s %s\n", 'FILE', 'METHOD', 'AUTH?', 'FIRST-CALL');
foreach ($files as $f) {
    $base = basename($f, '.php');
    $src = (string)file_get_contents($f);
    /* только публичные статические методы (роутеры вызывают именно их) */
    preg_match_all('/public static function (\w+)\s*\(([^)]*)\)\s*(?::\s*[\w\\\\?\s]+)?\{/', $src, $ms, PREG_OFFSET_CAPTURE);
    foreach ($ms[1] as $idx => $m) {
        $name = $m[0];
        $bodyStart = $ms[2][$idx][1] ?? 0;
        /* тело до следующего "public static" или конца файла */
        $next = $ms[0][$idx + 1][1] ?? strlen($src);
        $body = substr($src, $m[1], min($next - $m[1], 1500));
        $auth = 'NO';
        if (preg_match('/Auth::(requireAuth|requireEditor|requireSuperAdmin|verifyAdmin|requireUser)/', $body, $am, PREG_OFFSET_CAPTURE)) {
            $auth = 'YES';
            $call = $am[0][0] . (str_contains($body, '::verify') ? '' : '');
        } else {
            $call = '';
        }
        $publicList = array_merge($knownPublic[$base] ?? [], $knownPublic["$base@internal"] ?? []);
        $isPublicByDesign = in_array($name, $publicList, true);
        $flag = ($auth === 'NO' && !$isPublicByDesign) ? '  <<< CHECK' : '';
        if ($auth === 'NO' && $isPublicByDesign) { $auth = 'public'; }
        printf("%-38s %-24s %-10s %s%s\n", basename($f), $name, $auth, trim($call), $flag);
    }
}
