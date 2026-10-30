<?php

require_once __DIR__ . '/../Auth.php';
require_once __DIR__ . '/../ChunkedUpload.php';

/**
 * Обновление развёрнутого статического сайта архивом
 * (админка → Настройки → вкладка «Обновление»).
 *
 * Архив обновления собирается scripts/build-static.sh в режиме MODE=update:
 * HTML-страницы, _next-ассеты, шрифты, .htaccess, PHP-бэкенд и update.html —
 * БЕЗ медиа (uploads/) и без database.sqlite. Поэтому при применении
 * обновления медиа на сервере и накопленные заказы не затрагиваются.
 *
 * Целостность:
 *  - Zip Slip (../, абсолютные пути, буквы дисков) — отказ всей операции;
 *  - защищённые пути пропускаются даже если попали в архив (двойная страховка
 *    к исключениям на этапе сборки): uploads/, database.sqlite*, логи,
 *    chunked-uploads, last-update.json, config.local.php, UPDATE_ROOT;
 *  - архив обязан выглядеть как архив сайта (index.html / .htaccess / _next / backend).
 *
 * Статус и журнал: backend/version.json (версия пакета) и
 * backend/storage/last-update.json (когда и что применялось).
 */
class AdminSiteUpdateController
{
    private const MAX_FILES = 20000;
    private const MAX_UNCOMPRESSED = 1024 * 1024 * 1024; // 1 GB суммарно

    /** Каталог backend/ (контроллер лежит в backend/src/Controllers). */
    private static function backendDir(): string
    {
        return dirname(__DIR__, 2);
    }

    /**
     * Куда применять обновление.
     *  - deployed: корень на уровень выше backend/ — настоящий развёрнутый сайт;
     *  - staging:  путь из файла backend/UPDATE_ROOT (тестовый стенд песочницы);
     *  - none:     статический сайт не обнаружен — обновление недоступно.
     * @return array{root: string, mode: string}
     */
    public static function resolveTarget(): array
    {
        $override = self::backendDir() . '/UPDATE_ROOT';
        if (is_file($override)) {
            $root = trim((string)file_get_contents($override));
            if ($root !== '' && is_dir($root)) {
                return ['root' => rtrim($root, '/'), 'mode' => 'staging'];
            }
        }

        $root = dirname(self::backendDir());
        if (is_dir($root . '/backend') && (is_file($root . '/index.html') || is_file($root . '/.htaccess'))) {
            return ['root' => $root, 'mode' => 'deployed'];
        }

        return ['root' => '', 'mode' => 'none'];
    }

    /** GET /api/admin/site-update — статус для вкладки «Обновление». */
    public static function status(): void
    {
        Auth::requireEditor();

        $target = self::resolveTarget();
        // версия и журнал — относительны ЦЕЛИ обновления:
        // на деплое это тот же backend/, на стенде — backend/ стенда
        if ($target['root'] !== '') {
            $versionPath = $target['root'] . '/backend/version.json';
            $journalPath = $target['root'] . '/backend/storage/last-update.json';
        } else {
            $versionPath = self::backendDir() . '/version.json';
            $journalPath = self::backendDir() . '/storage/last-update.json';
        }

        jsonResponse(['data' => [
            'mode'        => $target['mode'],
            'version'     => self::readJson($versionPath),
            'last_update' => self::readJson($journalPath),
        ]]);
    }

    /**
     * POST /api/admin/site-update/apply
     * JSON: { file_name: "<upload_id>.zip" } — архив, ранее загруженный
     * по частям через POST /api/admin/upload/chunk (ChunkedUpload).
     */
    public static function apply(): void
    {
        Auth::requireSuperAdmin();
        @set_time_limit(600);

        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true) ?? [];
        $fileName = (string)($data['file_name'] ?? '');
        if ($fileName === '') {
            jsonResponse(['error' => 'Архив не передан. Сначала загрузите его по частям (upload/chunk).'], 422);
        }

        $zipPath = ChunkedUpload::resolveFile($fileName);
        if (!$zipPath) {
            jsonResponse(['error' => 'Архив не найден на сервере — загрузите его заново.'], 422);
        }

        // при любом отказе ниже мусорный архив удаляется с сервера
        $reject = function (string $msg, int $status, array $extra = []) use ($fileName): void {
            ChunkedUpload::removeFile($fileName);
            jsonResponse(['error' => $msg] + $extra, $status);
        };

        $target = self::resolveTarget();
        if ($target['mode'] === 'none') {
            $reject('Обновление применяется только к развёрнутому статическому сайту: в корне должны лежать index.html/.htaccess и папка backend. Здесь такой структуры нет.', 409);
        }
        $root = $target['root'];

        $zip = new ZipArchive();
        if ($zip->open($zipPath) !== true) {
            $reject('Не удалось открыть ZIP-архив — файл повреждён?', 422);
        }

        /* ---------- разбор содержимого ---------- */
        $allowed = [];
        $skippedMedia = 0;
        $skippedProtected = 0;
        $totalSize = 0;
        $hasSiteMarker = false;
        $manifest = null;
        $count = $zip->numFiles;

        for ($i = 0; $i < $count; $i++) {
            $name = $zip->getNameIndex($i);
            if ($name === false) continue;
            $norm = str_replace('\\', '/', $name);

            // Zip Slip и абсолютные пути — отказ целиком
            if ($norm === '' || str_starts_with($norm, '/') || str_contains($norm, "\0")
                || preg_match('#^[a-zA-Z]:#', $norm)) {
                $zip->close();
                $reject("Опасный путь в архиве — обновление отклонено: {$name}", 422);
            }
            if (str_ends_with($norm, '/')) continue; // каталоги не переносятся
            foreach (explode('/', $norm) as $seg) {
                if ($seg === '..') {
                    $zip->close();
                    $reject("Опасный путь в архиве — обновление отклонено: {$name}", 422);
                }
            }

            if ($norm === 'update-manifest.json') {
                $m = json_decode((string)$zip->getFromIndex($i), true);
                if (is_array($m)) $manifest = $m;
                continue; // метаданные не копируем в корень сайта
            }

            $first = explode('/', $norm)[0];
            if ($first === 'index.html' || $first === '.htaccess' || $first === '_next' || $first === 'backend') {
                $hasSiteMarker = true;
            }

            // медиа не трогаем никогда
            if ($first === 'uploads' || $first === 'exports') {
                $skippedMedia++;
                continue;
            }
            // защищённые пути сервера — двойная страховка к эксклюзиям сборки
            if ($norm === 'backend/UPDATE_ROOT'
                || $norm === 'backend/config.local.php'
                || $norm === 'backend/storage/last-update.json'
                || $norm === 'backend/storage/php-errors.log'
                || $norm === 'backend/storage/secret-keys.php'
                || $norm === 'backend/storage/github-token.txt'
                || $norm === 'backend/storage/github-release-cache.json'
                || $norm === 'backend/storage/deploy-archive-meta.json'
                || preg_match('#^backend/storage/database\.sqlite(\.|-|$)?#', $norm)
                || str_starts_with($norm, 'backend/storage/logs/')
                || str_starts_with($norm, 'backend/storage/chunked-uploads/')) {
                $skippedProtected++;
                continue;
            }

            $stat = $zip->statIndex($i);
            $totalSize += (int)($stat['size'] ?? 0);
            $allowed[] = $norm;
        }

        if (!$allowed) {
            $zip->close();
            $reject('В архиве нет файлов для обновления', 422);
        }
        if (!$hasSiteMarker) {
            $zip->close();
            $reject('Это не архив сайта «Лакомки»: нет index.html / .htaccess / _next / backend', 422);
        }
        if (count($allowed) > self::MAX_FILES || $totalSize > self::MAX_UNCOMPRESSED) {
            $zip->close();
            $reject('Архив слишком большой для обновления', 422);
        }

        /* ---------- распаковка во временную папку → перенос ---------- */
        $tmp = $root . '/.update-tmp-' . time();
        if (!@mkdir($tmp, 0755, true)) {
            $zip->close();
            $reject('Не удалось создать временную папку в корне сайта — проверьте права на запись', 500);
        }

        if (!$zip->extractTo($tmp, $allowed)) {
            self::rrmdir($tmp);
            $zip->close();
            $reject('Распаковка не удалась (место на диске или права?)', 500);
        }
        $zip->close();

        $applied = 0;
        $failed = [];
        foreach ($allowed as $rel) {
            $src = $tmp . '/' . $rel;
            $dst = $root . '/' . $rel;
            if (!is_file($src)) { $failed[] = $rel; continue; }
            $dir = dirname($dst);
            if (!is_dir($dir) && !@mkdir($dir, 0755, true)) { $failed[] = $rel; continue; }
            if (@rename($src, $dst) || (@copy($src, $dst) && @unlink($src))) {
                $applied++;
                @chmod($dst, 0644);
            } else {
                $failed[] = $rel;
            }
        }
        self::rrmdir($tmp);

        if ($applied === 0) {
            $reject('Ни один файл не обновлён — скорее всего, нет прав на запись в корень сайта', 500, ['failed' => array_slice($failed, 0, 20)]);
        }

        /* ---------- журнал обновления ---------- */
        $info = [
            'applied_at' => date('c'),
            'mode'       => $target['mode'],
            'files'      => $applied,
            'failed'     => count($failed),
            'version'    => $manifest['version']  ?? null,
            'built_at'   => $manifest['built_at'] ?? null,
            'source'     => basename($fileName),
        ];
        $journalDir = $root . '/backend/storage';
        if (!is_dir($journalDir)) @mkdir($journalDir, 0755, true);
        @file_put_contents($journalDir . '/last-update.json', json_encode($info, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));

        ChunkedUpload::removeFile($fileName);

        jsonResponse(['data' => [
            'ok'                 => true,
            'applied_at'         => $info['applied_at'],
            'mode'               => $info['mode'],
            'files'              => $info['files'],
            'failed'             => $info['failed'],
            'failed_list'        => array_slice($failed, 0, 20),
            'version'            => $info['version'],
            'built_at'           => $info['built_at'],
            'skipped_media'      => $skippedMedia,
            'skipped_protected'  => $skippedProtected,
        ]]);
    }

    /* ============================================================
       ДЕПЛОЙ-АРХИВ (полный пакет: витрина + ВСЕ медиа + backend)
       Скачивается из админки (Настройки → «Обновление») той же
       живучей панелью, что и экспорт товаров: Range → 206.
       ============================================================ */

    /** Кандидаты расположения lakomka-deploy-static.zip (в порядке приоритета). */
    private static function deployArchiveCandidates(): array
    {
        $root = dirname(self::backendDir());
        return [
            $root . '/download/lakomka-deploy-static.zip',        // канонический вывод build-static.sh
            $root . '/download/for-deploy/lakomka-deploy-static.zip',
            $root . '/lakomka/deploy/lakomka-deploy-static.zip',  // копия в клоне репозитория
        ];
    }

    private static function resolveDeployArchive(): ?string
    {
        foreach (self::deployArchiveCandidates() as $p) {
            if (is_file($p) && filesize($p) > 0) {
                return $p;
            }
        }
        return null;
    }

    /** GET /api/admin/site-update/deploy-archive — сведения о деплой-архиве. */
    public static function deployArchive(): void
    {
        Auth::requireEditor();

        $path = self::resolveDeployArchive();
        if ($path === null) {
            jsonResponse(['data' => ['exists' => false]]);
        }

        $size = (int)filesize($path);
        $mtime = (int)filemtime($path);

        // sha256 пересчитываем только когда файл изменился (116МБ — не мгновение)
        $cacheFile = self::backendDir() . '/storage/deploy-archive-meta.json';
        $meta = is_file($cacheFile) ? json_decode((string)file_get_contents($cacheFile), true) : null;
        if (!is_array($meta) || ($meta['size'] ?? null) !== $size
            || ($meta['mtime'] ?? null) !== $mtime || empty($meta['sha256'])) {
            $meta = ['size' => $size, 'mtime' => $mtime, 'sha256' => hash_file('sha256', $path) ?: null];
            if (!is_dir(dirname($cacheFile))) {
                @mkdir(dirname($cacheFile), 0755, true);
            }
            @file_put_contents($cacheFile, json_encode($meta, JSON_UNESCAPED_UNICODE));
        }

        jsonResponse(['data' => [
            'exists' => true,
            'name'   => basename($path),
            'size'   => $size,
            'mtime'  => $mtime,
            'sha256' => $meta['sha256'],
        ]]);
    }

    /** GET /api/admin/site-update/deploy-archive/download — отдача архива. */
    public static function deployArchiveDownload(): void
    {
        Auth::requireEditor();

        $path = self::resolveDeployArchive();
        if ($path === null) {
            jsonResponse(['error' => 'Деплой-архив не найден — соберите его: MODE=full bash scripts/build-static.sh'], 404);
        }

        $size = filesize($path);
        if ($size === false) {
            jsonResponse(['error' => 'Не удалось прочитать файл'], 500);
        }

        @set_time_limit(0);
        while (ob_get_level() > 0) { ob_end_clean(); }

        header_remove('Content-Type');
        header('Content-Type: application/zip');
        header('Content-Disposition: attachment; filename="' . basename($path) . '"');
        header('Cache-Control: no-store');
        header('Accept-Ranges: bytes'); // нативная докачка браузером + многопоточная панель загрузок

        // ── Range-запрос (один диапазон) → 206: панель загрузок качает кусками ──
        $range = $_SERVER['HTTP_RANGE'] ?? '';
        if ($range !== '' && preg_match('/^bytes=(\d*)-(\d*)$/i', trim($range), $m) === 1
            && ($m[1] !== '' || $m[2] !== '')) {
            $start = $m[1] === '' ? null : (int) $m[1];
            $end = $m[2] === '' ? null : (int) $m[2];

            if ($start === null) {
                // суффиксный формат bytes=-N: последние N байт
                $len = min((int) $m[2], $size);
                $start = $size - $len;
                $end = $size - 1;
            } else {
                if ($start >= $size) {
                    http_response_code(416);
                    header('Content-Range: bytes */' . $size);
                    exit;
                }
                $end = ($end === null || $end >= $size) ? $size - 1 : $end;
            }

            $length = $end - $start + 1;
            http_response_code(206);
            header('Content-Range: bytes ' . $start . '-' . $end . '/' . $size);
            header('Content-Length: ' . $length);

            // readfile не умеет seek — отдаём слайс кусками по 8МБ
            $fh = fopen($path, 'rb');
            if ($fh === false) {
                jsonResponse(['error' => 'Не удалось открыть файл'], 500);
            }
            try {
                fseek($fh, $start);
                $chunkSize = 8 * 1024 * 1024;
                $remaining = $length;
                while ($remaining > 0 && !feof($fh)) {
                    $chunk = fread($fh, (int) min($chunkSize, $remaining));
                    if ($chunk === false || $chunk === '') {
                        break;
                    }
                    echo $chunk;
                    $remaining -= strlen($chunk);
                    flush();
                }
            } finally {
                fclose($fh);
            }
            exit;
        }

        header('Content-Length: ' . $size);
        readfile($path);
        exit;
    }

    /* ============================================================
       ОБНОВЛЕНИЕ С GITHUB (релизы репозитория Sayikoro/lakomka)
       Кнопка «Проверить обновления (ГИТ)» — в админке и на /update.
       Проверка: api.github.com/releases/latest (кеш 60 с; при сбое
       API отдаётся устаревший кеш с пометкой). Версия берётся из тега
       релиза (v<версия>), размер файла — из contents API.
       ZIP обновления живёт В ДЕРЕВЕ тега: updates/lakomka-update-<версия>.zip.
       Скачивание — напрямую github.com/…/raw/<tag>/updates/<asset>, МИМО API
       (без rate-limit); резервный путь — tar.gz тега с codeload.github.com
       (PharData) на случай недоступности raw. Репозиторий захардкожен,
       tag/asset строго валидируются.
       Целостность: sha256 от клиента (если передан) + ZipArchive +
       update-manifest.json с ожидаемой версией; затем файл идёт в штатный
       apply() — те же проверки Zip Slip и маркеров сайта.
       ============================================================ */

    private const GH_REPO = 'Sayikoro/lakomka';
    private const GH_CACHE_TTL = 60; // секунды

    /** 2026.10.30-1530 → 2026.10.30.1530 — чтобы сравнивалось как версия. */
    private static function normVersion(?string $v): string
    {
        $v = strtolower(trim((string)$v));
        if ($v === '') return '0';
        $v = str_replace('-', '.', $v);
        $v = (string)preg_replace('/[^0-9.]/', '', $v);
        return trim($v, '.') ?: '0';
    }

    private static function versionNewer(string $a, string $b): bool
    {
        return version_compare(self::normVersion($a), self::normVersion($b), '>');
    }

    /** GET к api.github.com → [код, тело, заголовки(нижний регистр)].
      * Токен необязателен (backend/storage/github-token.txt) — поднимает
      * лимит запросов на общедоступных хостингах (60/час на IP без него). */
    private static function ghApiGet(string $url, int $timeout = 15): array
    {
        $auth = self::ghToken();
        $authHeader = $auth !== null ? ['Authorization: Bearer ' . $auth] : [];
        if (function_exists('curl_init')) {
            $headers = [];
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_CONNECTTIMEOUT => 10,
                CURLOPT_TIMEOUT        => $timeout,
                CURLOPT_USERAGENT      => 'lakomka-updater/1.0',
                CURLOPT_HTTPHEADER     => array_merge(['Accept: application/vnd.github+json'], $authHeader),
                CURLOPT_HEADERFUNCTION => function ($ch, string $line) use (&$headers): int {
                    $p = explode(':', $line, 2);
                    if (count($p) === 2) {
                        $headers[strtolower(trim($p[0]))] = trim($p[1]);
                    }
                    return strlen($line);
                },
            ]);
            $body = curl_exec($ch);
            $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
            $err  = curl_error($ch);
            curl_close($ch);
            if ($body === false) return [0, '', ['error' => $err]];
            return [$code, (string)$body, $headers];
        }
        $ctx = stream_context_create(['http' => [
            'method'        => 'GET',
            'timeout'       => $timeout,
            'header'        => "User-Agent: lakomka-updater/1.0\r\nAccept: application/vnd.github+json\r\n"
                . ($auth !== null ? "Authorization: Bearer " . $auth . "\r\n" : ""),
            'ignore_errors' => true,
        ]]);
        $body = @file_get_contents($url, false, $ctx);
        $code = 0;
        foreach (($http_response_header ?? []) as $h) {
            if (preg_match('#^HTTP/\S+\s+(\d+)#', $h, $m)) $code = (int)$m[1];
        }
        return [$code, (string)$body, []];
    }

    /** Необязательный токен GitHub для api.github.com (если хостинг упирается в лимит). */
    private static function ghToken(): ?string
    {
        static $cached = null;
        if ($cached !== null) return $cached['t'] ?? null;
        $f = self::backendDir() . '/storage/github-token.txt';
        $t = is_file($f) ? trim((string)@file_get_contents($f)) : '';
        $cached = $t !== '' ? ['t' => $t] : [];
        return $cached['t'] ?? null;
    }

    /** Ассет lakomka-update-<версия>.zip из релиза (или null). */
    private static function ghUpdateAsset(array $release): ?array
    {
        foreach ($release['assets'] ?? [] as $a) {
            if (!empty($a['name']) && preg_match('/^lakomka-update-(.+)\.zip$/', (string)$a['name'], $m)) {
                $digest = (string)($a['digest'] ?? '');
                return [
                    'name'    => (string)$a['name'],
                    'version' => $m[1],
                    'size'    => (int)($a['size'] ?? 0),
                    'sha256'  => str_starts_with($digest, 'sha256:') ? substr($digest, 7) : null,
                ];
            }
        }
        return null;
    }

    /** Размер файла updates/<name> в дереве тега (contents API) или null. */
    private static function ghFileInfo(string $tag, string $assetName): ?array
    {
        $url = 'https://api.github.com/repos/' . self::GH_REPO . '/contents/updates/'
            . rawurlencode($assetName) . '?ref=' . rawurlencode($tag);
        [$code, $body] = self::ghApiGet($url);
        if ($code !== 200) return null;
        $j = json_decode($body, true);
        if (!is_array($j) || !isset($j['size'])) return null;
        return ['size' => (int)$j['size']];
    }

    /**
     * GET /api/admin/site-update/github-check
     * Последний релиз на GitHub и есть ли архив новее текущей версии.
     */
    public static function githubCheck(): void
    {
        Auth::requireEditor();

        $target = self::resolveTarget();
        $versionPath = $target['root'] !== ''
            ? $target['root'] . '/backend/version.json'
            : self::backendDir() . '/version.json';
        $current = self::readJson($versionPath);
        $currentVersion = isset($current['version']) ? (string)$current['version'] : null;

        $base = [
            'mode'            => $target['mode'],
            'repo'            => self::GH_REPO,
            'current_version' => $currentVersion,
        ];

        $cacheFile = self::backendDir() . '/storage/github-release-cache.json';
        $cached = self::readJson($cacheFile);
        // ?fresh=1 — миновать кеш (явный клик по кнопке; после установки обновления)
        $bypass = ($_GET['fresh'] ?? '') === '1';
        if (!$bypass && is_array($cached) && isset($cached['saved_at'], $cached['payload'])
            && (time() - (int)$cached['saved_at']) < self::GH_CACHE_TTL) {
            jsonResponse(['data' => ['cached' => true, 'stale' => false] + $cached['payload'] + $base]);
        }

        [$code, $body, $hdr] = self::ghApiGet('https://api.github.com/repos/' . self::GH_REPO . '/releases/latest');
        if ($code === 0) {
            $err = (string)($hdr['error'] ?? 'нет соединения');
            $stale = is_array($cached) && isset($cached['payload']);
            if ($stale) {
                jsonResponse(['data' => ['cached' => true, 'stale' => true,
                    'warning' => 'GitHub недоступен с сервера (' . $err . ') — показан результат прошлой проверки.'] + $cached['payload'] + $base]);
            }
            jsonResponse(['error' => 'GitHub недоступен с сервера (' . $err . '). Проверьте исходящие соединения хостинга.'], 502);
        }
        if ($code === 403) {
            $stale = is_array($cached) && isset($cached['payload']);
            if ($stale) {
                jsonResponse(['data' => ['cached' => true, 'stale' => true,
                    'warning' => 'Лимит запросов к GitHub исчерпан — показан результат прошлой проверки.'] + $cached['payload'] + $base]);
            }
            jsonResponse(['error' => 'GitHub ограничил количество запросов с вашего сервера (лимит API). Попробуйте через несколько минут.'], 502);
        }
        if ($code === 404) {
            $noReleases = ['cached' => false, 'stale' => false, 'release' => null, 'asset' => null,
                'update_available' => false, 'message' => 'На GitHub ещё нет релизов.'] + $base;
            @file_put_contents($cacheFile, json_encode(['saved_at' => time(), 'payload' => $noReleases], JSON_UNESCAPED_UNICODE));
            jsonResponse(['data' => $noReleases]);
        }
        if ($code !== 200) {
            jsonResponse(['error' => 'GitHub ответил ' . $code . ' на запрос релиза.'], 502);
        }

        $release = json_decode($body, true);
        if (!is_array($release)) {
            jsonResponse(['error' => 'GitHub вернул неожиданный ответ.'], 502);
        }

        $asset = self::ghUpdateAsset($release);
        if ($asset === null && preg_match('/^v([0-9A-Za-z._\-]+)$/', (string)($release['tag_name'] ?? ''), $tm)) {
            // ZIP обновления живёт в дереве тега: updates/lakomka-update-<версия>.zip
            $tagVersion = $tm[1];
            $assetName = 'lakomka-update-' . $tagVersion . '.zip';
            $info = self::ghFileInfo((string)$release['tag_name'], $assetName);
            $asset = $info === null ? null : [
                'name'    => $assetName,
                'version' => $tagVersion,
                'size'    => $info['size'],
                'sha256'  => null,
            ];
        }
        $data = [
            'cached' => false,
            'stale'  => false,
            'release' => [
                'tag'          => (string)($release['tag_name'] ?? ''),
                'name'         => (string)($release['name'] ?? ''),
                'published_at' => $release['published_at'] ?? null,
                'html_url'     => (string)($release['html_url'] ?? ''),
                'notes'        => (string)($release['body'] ?? ''),
            ],
            'asset' => $asset,
            'update_available' => $asset !== null
                && ($currentVersion === null || self::versionNewer($asset['version'], $currentVersion)),
        ] + $base;

        @file_put_contents($cacheFile, json_encode(['saved_at' => time(), 'payload' => $data], JSON_UNESCAPED_UNICODE));
        jsonResponse(['data' => $data]);
    }

    /**
     * POST /api/admin/site-update/github-download
     * JSON: { tag: "v2026.10.30-1530", asset: "lakomka-update-2026.10.30-1530.zip" }
     * Скачивает ассет релиза в хранилище (как чанк-загрузку), проверяет
     * целостность и возвращает file_name для site-update/apply.
     */
    public static function githubDownload(): void
    {
        Auth::requireSuperAdmin();
        @set_time_limit(600);

        $data = json_decode((string)file_get_contents('php://input'), true) ?? [];
        $tag = (string)($data['tag'] ?? '');
        $assetName = (string)($data['asset'] ?? '');

        if (!preg_match('/^lakomka-update-(.+)\.zip$/', $assetName, $m)) {
            jsonResponse(['error' => 'Ожидался файл lakomka-update-<версия>.zip'], 422);
        }
        $version = $m[1];
        // tag/asset — только буквы/цифры/точка/дефис, без «..» (repo захардкожен)
        foreach ([$tag, $assetName] as $part) {
            if ($part === '' || !preg_match('/^[A-Za-z0-9._\-]+$/', $part) || str_contains($part, '..')) {
                jsonResponse(['error' => 'Некорректные параметры релиза'], 422);
            }
        }

        // raw-ссылка на файл в дереве тега (repo захардкожен)
        $url = 'https://github.com/' . self::GH_REPO
            . '/raw/' . rawurlencode($tag) . '/updates/' . rawurlencode($assetName);

        // имя в хранилище — под шаблон ChunkedUpload::resolveFile (латиница/цифры/дефис)
        $safeVersion = trim((string)preg_replace('/[^a-z0-9]+/', '-', strtolower($version)), '-');
        $fileName = 'github-' . $safeVersion . '.zip';

        $dir = ChunkedUpload::storageDir();
        ChunkedUpload::cleanupOld();
        $dest = $dir . '/' . $fileName;
        $tmp = $dest . '.part';
        if (is_file($tmp)) @unlink($tmp);

        $err = '';
        if (!self::httpDownloadToFile($url, $tmp, $err)) {
            // резервный путь: tar.gz всего тега (codeload) → вынимаем updates/<asset>
            $err2 = '';
            if (!self::downloadFromTagTarball($tag, 'updates/' . $assetName, $tmp, $err2)) {
                @unlink($tmp);
                jsonResponse(['error' => 'Не удалось скачать архив с GitHub: ' . $err
                    . ($err2 !== '' ? ' (резерв: ' . $err2 . ')' : '')], 502);
            }
        }
        clearstatcache(true, $tmp);
        if (!is_file($tmp) || filesize($tmp) === 0) {
            @unlink($tmp);
            jsonResponse(['error' => 'Скачался пустой файл — повторите попытку позже.'], 502);
        }

        $fail = function (string $msg, int $status = 422) use ($tmp): void {
            @unlink($tmp);
            jsonResponse(['error' => $msg], $status);
        };

        // sha256 из digest релиза, если GitHub его отдал
        if (!empty($data['sha256']) && is_string($data['sha256'])) {
            $expected = strtolower((string)$data['sha256']);
            $actual = hash_file('sha256', $tmp) ?: '';
            if ($expected !== '' && $actual !== $expected) {
                $fail('Контрольная сумма архива не совпала (sha256) — файл повреждён при скачивании.', 502);
            }
        }

        // архив должен открываться и содержать манифест с ожидаемой версией
        $zip = new ZipArchive();
        if ($zip->open($tmp) !== true) {
            $fail('Скачанный файл не является ZIP-архивом — повторите попытку позже.', 502);
        }
        $manifestIdx = $zip->locateName('update-manifest.json', ZipArchive::FL_NODIR);
        if ($manifestIdx === false) {
            $zip->close();
            $fail('В архиве нет update-manifest.json — это не пакет обновления сайта.', 422);
        }
        $manifest = json_decode((string)$zip->getFromIndex($manifestIdx), true);
        $zip->close();
        if (!is_array($manifest) || (string)($manifest['version'] ?? '') !== $version) {
            $fail('Версия в манифесте архива не совпадает с версией релиза.', 422);
        }

        if (!@rename($tmp, $dest)) {
            @unlink($tmp);
            jsonResponse(['error' => 'Не удалось сохранить архив в хранилище — проверьте права на backend/storage.'], 500);
        }

        jsonResponse(['data' => [
            'ok'        => true,
            'file_name' => $fileName,
            'version'   => $version,
            'size'      => (int)filesize($dest),
            'sha256'    => hash_file('sha256', $dest) ?: null,
        ]]);
    }

    /** Резервное скачивание: tar.gz тега (codeload) → извлечь updates/<файл>. */
    private static function downloadFromTagTarball(string $tag, string $path, string $dest, string &$err = ''): bool
    {
        if (!class_exists('PharData')) {
            $err = 'PharData недоступен';
            return false;
        }
        $tgz = $dest . '.tgz';
        $url = 'https://codeload.github.com/' . self::GH_REPO . '/tar.gz/refs/tags/' . rawurlencode($tag);
        if (!self::httpDownloadToFile($url, $tgz, $err)) {
            @unlink($tgz);
            return false;
        }
        try {
            $phar = new \PharData($tgz); // .tgz распаковывается прозрачно (zlib)
            $content = $phar[$path]->getContent();
        } catch (\Throwable $e) {
            @unlink($tgz);
            $err = 'тег скачан, но файла в нём нет (' . $e->getMessage() . ')';
            return false;
        }
        @unlink($tgz);
        if ($content === '' || file_put_contents($dest, $content) === false) {
            $err = 'не удалось сохранить извлечённый файл';
            return false;
        }
        return true;
    }

    /** Скачивание $url в файл $to: cURL (редиректы включены) или stream-обёртка. */
    private static function httpDownloadToFile(string $url, string $to, string &$err = ''): bool
    {
        if (function_exists('curl_init')) {
            $fh = fopen($to, 'wb');
            if ($fh === false) {
                $err = 'не удалось создать временный файл на сервере';
                return false;
            }
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_FILE            => $fh,
                CURLOPT_FOLLOWLOCATION  => true,
                CURLOPT_MAXREDIRS       => 5,
                CURLOPT_CONNECTTIMEOUT  => 15,
                CURLOPT_TIMEOUT         => 600,
                CURLOPT_USERAGENT       => 'lakomka-updater/1.0',
                CURLOPT_FAILONERROR     => false,
            ]);
            $ok = curl_exec($ch);
            $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
            $cerr = curl_error($ch);
            curl_close($ch);
            fclose($fh);
            if ($ok === false) {
                $err = 'соединение не состоялось (' . $cerr . ')';
                return false;
            }
            if ($code >= 400) {
                $err = 'GitHub ответил ' . $code . ($code === 404 ? ' (релиз или файл не найден)' : '');
                return false;
            }
            return true;
        }
        if (!ini_get('allow_url_fopen')) {
            $err = 'на сервере нет ни cURL, ни allow_url_fopen';
            return false;
        }
        $ctx = stream_context_create(['http' => [
            'method'        => 'GET',
            'timeout'       => 600,
            'header'        => "User-Agent: lakomka-updater/1.0\r\n",
            'ignore_errors' => true,
        ]]);
        $in = @fopen($url, 'rb', false, $ctx);
        if ($in === false) {
            $err = 'не удалось открыть соединение';
            return false;
        }
        $out = fopen($to, 'wb');
        if ($out === false) {
            fclose($in);
            $err = 'не удалось создать временный файл на сервере';
            return false;
        }
        stream_copy_to_stream($in, $out);
        fclose($in);
        fclose($out);
        return true;
    }

    private static function readJson(string $path): ?array
    {
        if (!is_file($path)) return null;
        $j = json_decode((string)file_get_contents($path), true);
        return is_array($j) ? $j : null;
    }

    private static function rrmdir(string $dir): void
    {
        if (!is_dir($dir)) return;
        $it = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS),
            RecursiveIteratorIterator::CHILD_FIRST
        );
        foreach ($it as $item) {
            $item->isDir() ? @rmdir($item->getPathname()) : @unlink($item->getPathname());
        }
        @rmdir($dir);
    }
}
