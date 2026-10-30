<?php
/* Локальная эмуляция .htaccess для смоук-теста деплой-пакета.
 * Запуск: .ztools/php -S 127.0.0.1:8090 scripts/deploy/dev-router.php
 * (docroot = .deploy-package) — повторяет правила scripts/deploy/.htaccess. */
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$root = getcwd();

// 1) защита backend: только public/index.php
if (str_starts_with($uri, '/backend/')) {
    if (rtrim($uri, '/') !== '/backend/public/index.php') {
        http_response_code(403);
        echo "Forbidden (эмуляция .htaccess)\n";
        return true;
    }
}

// 2) /api/* → PHP-фронтконтроллер
if (preg_match('#^/api(/|$)#', $uri)) {
    $_SERVER['REQUEST_URI'] = $uri; // как в Apache: REQUEST_URI оригинальный
    chdir($root . '/backend/public');
    require $root . '/backend/public/index.php';
    return true;
}

// 3) старые WP-адреса → 301 (Redirect/rewrite из .htaccess)
$redirects = [
    '#^/shop(/.*)?$#' => '/catalog/',
    '#^/checkout-2(/.*)?$#' => '/checkout/',
    '#^/my-account(/.*)?$#' => '/',
    '#^/privacy-policy(/.*)?$#' => '/privacy/',
    '#^/wp-login\.php$#' => '/',
    '#^/wp-json(/.*)?$#' => '/',
    '#^/wp-admin(/.*)?$#' => '/',
    '#^/feed(/.*)?$#' => '/',
    '#^/comments/feed(/.*)?$#' => '/',
];
foreach ($redirects as $re => $to) {
    if (preg_match($re, $uri)) {
        header('Location: ' . $to, true, 301);
        return true;
    }
}

// 4) статика: файл → как есть; папка → index.html; иначе .html; 404 → /404.html
$file = $root . $uri;
if ($uri !== '/' && is_file($file)) {
    return false; // встроенный сервер отдаст сам
}
if (is_dir($file)) {
    $idx = rtrim($file, '/') . '/index.html';
    if (is_file($idx)) {
        header('Content-Type: text/html; charset=utf-8');
        echo file_get_contents($idx);
        return true;
    }
}
if (is_file($file . '.html')) {
    header('Content-Type: text/html; charset=utf-8');
    echo file_get_contents($file . '.html');
    return true;
}
if ($uri !== '/404.html' && is_file($root . '/404.html')) {
    http_response_code(404);
    header('Content-Type: text/html; charset=utf-8');
    echo file_get_contents($root . '/404.html');
    return true;
}
return false;
