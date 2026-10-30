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
