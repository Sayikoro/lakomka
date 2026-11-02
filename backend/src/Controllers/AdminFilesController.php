<?php

require_once __DIR__ . '/../ChunkedUpload.php';
require_once __DIR__ . '/../Paths.php';
require_once __DIR__ . '/../MediaOptimizer.php';
require_once __DIR__ . '/../AdminLog.php';

class AdminFilesController
{
    /* ============================================================
       ФАЙЛОВЫЙ МЕНЕДЖЕР (проводник)
       GET  /api/admin/files[?path=section/sub/dir] — список папки
            (без path — корень: разделы как «диски»)
       POST /api/admin/files/delete                 — {path} файл ИЛИ
            папка (рекурсивно); media — только просмотр (403)
       GET  /api/admin/files/download?path=...      — отдать файл
            (Content-Length + attachment) для разделов без публичного URL
       Путь всегда «section/относительный/путь». Защита: только
       реальные пути внутри корня раздела (realpath, traversal — 404).
       ============================================================ */

    private static function sections(): array
    {
        return [
            'exports' => [
                'title' => 'Экспортные архивы (ZIP)',
                // Paths сам разбирается с раскладкой (dev public/ vs деплой-пакет)
                // и создаёт папку при отсутствии — иначе «Раздел недоступен».
                'dir' => Paths::exportsDir(),
                'public' => '/exports',
                'deletable' => true,
                'hint' => 'Готовые ZIP из экспорта товаров. Старше 2 часов чистятся автоматически — удаляйте смело, новый соберётся заново.',
            ],
            'imports' => [
                'title' => 'Импортные архивы (загрузки)',
                // тот же каталог, куда chunked-загрузки склеивают ZIP (создаётся сам)
                'dir' => ChunkedUpload::storageDir(),
                'public' => null,
                'deletable' => true,
                'hint' => 'ZIP, загруженные для импорта. Брошенные загрузки старше 24 часов чистятся автоматически.',
            ],
            'media' => [
                'title' => 'Медиа товаров',
                'dir' => Paths::uploadsRoot(),
                'public' => '/uploads',
                'deletable' => false,
                'hint' => 'Картинки и видео товаров. Нужны сайту — удаление сломает карточки. Только контроль объёма.',
            ],
            'backups' => [
                'title' => 'Дампы базы данных',
                'dir' => Paths::backupsDir(),
                'public' => null,
                'deletable' => true,
                'hint' => 'Автоматические копии базы SQLite: снимок создаётся перед каждой миграцией схемы. Скачивайте кнопкой «Скачать», старые можно удалять — хранятся последние 10.',
            ],
        ];
    }

    /** Все URL файлов, используемые товарами (product_images + products.video_url).
     *  Возвращаются и «как в базе», и нормализованные («//» → «/») — в старых
     *  базах встречаются битые варианты (Task 89). Нужен для проверки
     *  «можно ли переименовать/трогать файл в media» (Task 93). */
    private static function usedUrls(PDO $pdo): array
    {
        $urls = [];
        try {
            foreach ($pdo->query('SELECT DISTINCT url FROM product_images') as $r) {
                $u = (string)$r['url'];
                if ($u !== '') { $urls[$u] = true; $urls[preg_replace('#/+#', '/', $u) ?? $u] = true; }
            }
        } catch (PDOException) {
            // таблицы может не быть на свежей базе
        }
        try {
            foreach ($pdo->query('SELECT DISTINCT video_url FROM products WHERE video_url IS NOT NULL') as $r) {
                $u = (string)$r['video_url'];
                if ($u !== '') { $urls[$u] = true; $urls[preg_replace('#/+#', '/', $u) ?? $u] = true; }
            }
        } catch (PDOException) {
            // старая схема без products.video_url — пропускаем
        }
        /* Task 116: витринные настройки тоже держат файлы (hero-слайды,
           снежинка). Без этого «Неиспользуемые» считали их мусором,
           а удаление ломало бы витрину. */
        try {
            foreach ($pdo->query("SELECT key, value FROM settings WHERE key IN ('hero_image','snow_flake','hero_slides')") as $r) {
                $raw = (string)$r['value'];
                if ($raw === '') continue;
                if ($r['key'] === 'hero_slides') {
                    $slides = json_decode($raw, true);
                    if (!is_array($slides)) continue;
                    foreach ($slides as $s) {
                        if (!is_array($s)) continue;
                        foreach (['url', 'image'] as $fld) {
                            $u = (string)($s[$fld] ?? '');
                            if ($u !== '') { $urls[$u] = true; $urls[preg_replace('#/+#', '/', $u) ?? $u] = true; }
                        }
                    }
                } elseif (str_starts_with($raw, '/uploads/')) {
                    $urls[$raw] = true;
                    $urls[preg_replace('#/+#', '/', $raw) ?? $raw] = true;
                }
            }
        } catch (PDOException) {
            // нет таблицы settings — пропускаем
        }
        return $urls;
    }

    /** Контекст товаров для медиа-списков (Task 122): привязки URL → товар,
     *  «используемые» видео, обложка (первая картинка) каждого товара и карта
     *  папок products/<папка> → товар. Один-два SQL-запроса на вызов.
     *  byUrl хранит id товара по нормализованному URL и его нижнему регистру;
     *  videoUsed — то же для множества «занятых» видео (product_images
     *  media_type=video + products.video_url). */
    private static function productContext(PDO $pdo): array
    {
        $norm = static fn (string $u): string => preg_replace('#/+#', '/', $u) ?? $u;
        $products = [];   // id => ['id','name','slug','legacy','thumb']
        $byUrl = [];      // url (и lc) => id товара
        $videoUsed = [];  // url (и lc) => true
        try {
            foreach ($pdo->query("SELECT product_id, url, media_type FROM product_images ORDER BY sort_order, id") as $r) {
                $u = $norm((string)$r['url']);
                if ($u === '') continue;
                $pid = (int)$r['product_id'];
                if (!isset($products[$pid])) $products[$pid] = ['id' => $pid, 'name' => null, 'slug' => null, 'legacy' => null, 'thumb' => null];
                $byUrl[$u] = $pid; $byUrl[strtolower($u)] = $pid;
                if ((string)$r['media_type'] === 'video') {
                    $videoUsed[$u] = true; $videoUsed[strtolower($u)] = true;
                } elseif ($products[$pid]['thumb'] === null && str_starts_with($u, '/uploads/')) {
                    $products[$pid]['thumb'] = $u;
                }
            }
        } catch (PDOException) {
            // нет таблицы — контекст ограничен продуктами
        }
        try {
            foreach ($pdo->query('SELECT id, name, slug, legacy_slug, video_url FROM products') as $r) {
                $pid = (int)$r['id'];
                if (!isset($products[$pid])) $products[$pid] = ['id' => $pid, 'name' => null, 'slug' => null, 'legacy' => null, 'thumb' => null];
                $products[$pid]['name'] = (string)$r['name'];
                $products[$pid]['slug'] = (string)$r['slug'];
                $products[$pid]['legacy'] = (string)($r['legacy_slug'] ?? '');
                $vu = $norm((string)($r['video_url'] ?? ''));
                if ($vu !== '') {
                    $videoUsed[$vu] = true; $videoUsed[strtolower($vu)] = true;
                    $byUrl[$vu] = $pid; $byUrl[strtolower($vu)] = $pid;
                }
            }
        } catch (PDOException) {
            // старая схема — пропускаем
        }
        /* Карта папок: товары лежат в products/<sanitized-slug> (импорт),
           исторически — <slug>-<id> (WC-импорт) и с legacy_slug. */
        $byFolder = [];
        foreach ($products as $p) {
            if ($p['name'] === null) continue;
            foreach ([ (string)($p['slug'] ?? ''), (string)($p['legacy'] ?? '') ] as $s) {
                $safe = preg_replace('/[^a-z0-9\-]/', '', strtolower($s)) ?? '';
                if ($safe === '') continue;
                $byFolder[$safe] = $p['id'];
                $byFolder[$safe . '-' . $p['id']] = $p['id'];
            }
        }
        return ['videoUsed' => $videoUsed, 'byUrl' => $byUrl, 'byFolder' => $byFolder, 'products' => $products];
    }

    /** Товар для медиа-файла: сначала привязка из базы (product_images /
     *  products.video_url), затем папка (products/<папка>, в т.ч. «slug-id»
     *  и «<ствол папки>-<id>»). null — файл ни к кому не привязан и папка
     *  не похожа на папку товара. */
    private static function productFor(array $ctx, string $url, string $folder): ?array
    {
        $norm = preg_replace('#/+#', '/', $url) ?? $url;
        $pid = $ctx['byUrl'][$norm] ?? $ctx['byUrl'][strtolower($norm)] ?? null;
        if ($pid === null && $folder !== '') {
            $base = strtolower(basename($folder));
            $pid = $ctx['byFolder'][$base] ?? null;
            if ($pid === null && preg_match('/^(.*)-(\\d+)$/', $base, $m)) {
                $pid = $ctx['byFolder'][$m[1]] ?? null;
                if ($pid === null) {
                    foreach ($ctx['products'] as $p) {
                        if ((int)$p['id'] === (int)$m[2]
                            && str_starts_with(strtolower((string)$p['slug']), $m[1])) {
                            $pid = (int)$p['id'];
                            break;
                        }
                    }
                }
            }
        }
        if ($pid === null) return null;
        $p = $ctx['products'][$pid] ?? null;
        if ($p === null || $p['name'] === null) return null;
        return ['id' => (int)$p['id'], 'name' => (string)$p['name'], 'slug' => (string)$p['slug'], 'thumb' => $p['thumb']];
    }

    /** Используется ли файл/папка (хоть один файл внутри) товарами.
     *  $url — ПУБЛИЧНЫЙ URL файла или папки («/uploads/путь», БЕЗ ключа
     *  раздела — ровно в том виде, в каком путь лежит в базе). */
    private static function isUsedByProducts(array $usedUrls, string $url, bool $isDir): bool
    {
        if ($isDir) {
            $prefix = rtrim($url, '/') . '/';
            foreach (array_keys($usedUrls) as $u) {
                if (str_starts_with($u, $prefix)) return true;
            }
            return false;
        }
        return isset($usedUrls[$url]);
    }

    /** Разбор и защита пути: «section/rel/path» → абсолютные пути. */
    private static function resolve(string $rawPath): array
    {
        $rawPath = str_replace('\\', '/', trim($rawPath));
        $rawPath = preg_replace('#/+#', '/', $rawPath) ?? '';
        $rawPath = trim($rawPath, '/');

        $parts = $rawPath === '' ? [] : explode('/', $rawPath);
        foreach ($parts as $p) {
            if ($p === '' || $p === '.' || $p === '..') {
                jsonResponse(['error' => 'Некорректный путь'], 400);
            }
        }

        $key = $parts[0] ?? '';
        $cfg = self::sections()[$key] ?? null;
        if (!$cfg) jsonResponse(['error' => 'Неизвестный раздел'], 404);

        $root = realpath($cfg['dir']);
        if (!$root) jsonResponse(['error' => 'Раздел недоступен'], 404);

        $rel = implode('/', array_slice($parts, 1));
        $abs = $rel === '' ? $root : $root . '/' . $rel;

        // containment-проверка (на случай симлинков и т.п.)
        $real = realpath($abs);
        if ($real === false || !( $real === $root || str_starts_with($real, $root . DIRECTORY_SEPARATOR) )) {
            jsonResponse(['error' => 'Не найдено'], 404);
        }

        return [$cfg, $key, $root, $real, $rel];
    }

    /* ── СПИСОК ПАПКИ ── */

    public static function list(PDO $pdo): void
    {
        Auth::requireEditor();

        $path = (string)($_GET['path'] ?? '');

        // КОРЕНЬ: разделы как «диски»
        if ($path === '') {
            $entries = [];
            foreach (self::sections() as $key => $cfg) {
                $dir = $cfg['dir'];
                $total = is_dir($dir) ? self::dirSize($dir) : 0;
                $entries[] = [
                    'name' => $cfg['title'],
                    'key' => $key,
                    'type' => 'dir',
                    'size' => $total,
                    'mtime' => is_dir($dir) ? (@filemtime($dir) ?: 0) : 0,
                    'deletable' => false,
                    'public_url' => null,
                ];
            }
            jsonResponse(['data' => [
                'path' => '',
                'title' => 'Файлы',
                'hint' => 'Разделы: экспортные и импортные архивы, медиа товаров.',
                'deletable' => false,
                'entries' => $entries,
                'total_size' => array_sum(array_column($entries, 'size')),
                'files_count' => 0,
            ]]);
        }

        [$cfg, $key, $root, $abs, $rel] = self::resolve($path);
        if (!is_dir($abs)) jsonResponse(['error' => 'Это не папка'], 404);

        $entries = [];
        $totalFiles = 0;
        $totalSize = 0;
        $bigTree = ($key === 'media'); // у медиа не считаем размер каждой папки (тысячи файлов)
        /* Task 93: в защищённых разделах (media) помечаем, какие файлы/
         *  папки реально используются товарами — их переименовывать нельзя,
         *  свободные можно. Один запрос на всё содержимое папки. */
        $usedUrls = $cfg['deletable'] ? [] : self::usedUrls($pdo);

        foreach (scandir($abs, SCANDIR_SORT_ASCENDING) ?: [] as $name) {
            if ($name === '.' || $name === '..') continue;
            /* Корзина удалённых файлов не видна в общем списке (Task 100) */
            if ($key === 'media' && $rel === '' && $name === '.trash') continue;
            $full = $abs . '/' . $name;
            /* публичный URL записи (для media — «/uploads/…» без ключа раздела:
             * именно в таком виде пути лежат в product_images/products.video_url) */
            $pubUrl = $cfg['public']
                ? rtrim($cfg['public'], '/') . '/' . ($rel === '' ? $name : $rel . '/' . $name)
                : null;
            if (is_dir($full)) {
                $entries[] = [
                    'name' => $name,
                    'type' => 'dir',
                    'size' => $bigTree ? 0 : self::dirSize($full),
                    'mtime' => @filemtime($full) ?: 0,
                    'deletable' => $cfg['deletable'],
                    'referenced' => $cfg['deletable'] ? null : self::isUsedByProducts($usedUrls, (string)$pubUrl, true),
                    'public_url' => $pubUrl,
                ];
            } elseif (is_file($full)) {
                $size = @filesize($full) ?: 0;
                $totalFiles++;
                $totalSize += $size;
                $entries[] = [
                    'name' => $name,
                    'type' => 'file',
                    'size' => $size,
                    'mtime' => @filemtime($full) ?: 0,
                    'deletable' => $cfg['deletable'],
                    'referenced' => $cfg['deletable'] ? null : self::isUsedByProducts($usedUrls, (string)$pubUrl, false),
                    'ext' => strtolower(pathinfo($name, PATHINFO_EXTENSION)),
                    'public_url' => $pubUrl,
                ];
            }
        }

        // папки сверху, дальше по имени (натуральная сортировка)
        usort($entries, static function ($a, $b) {
            if ($a['type'] !== $b['type']) return $a['type'] === 'dir' ? -1 : 1;
            return strnatcasecmp((string)$a['name'], (string)$b['name']);
        });

        jsonResponse(['data' => [
            'path' => $key . ($rel === '' ? '' : '/' . $rel),
            'section' => $key,
            'title' => basename($abs),
            'hint' => $cfg['hint'],
            'deletable' => $cfg['deletable'],
            'entries' => $entries,
            'total_size' => $totalSize,
            'files_count' => $totalFiles,
        ]]);
    }

    /* ── ПОИСК ВСЕХ ВИДЕО (медиа-галерея, режим «Видео») ──
       GET /api/admin/files/videos[?folder=видео/май]
       Рекурсивно ищет видео (mp4/webm/mov/m4v) под /uploads — или только
       в заданной подпапке. Папка берётся из ?folder= (мгновенный отклик
       в UI) или из настройки gallery_video_folder (пусто = искать везде).
       Плоский список, новее сверху. Ошибок «папка не найдена» НЕТ:
       нет папки — просто пустой список; при пустой настройке видео
       ищутся по всему /uploads в любом случае. */
    public static function videos(PDO $pdo): void
    {
        Auth::requireEditor();

        $param = $_GET['folder'] ?? null;
        if ($param === null) {
            $stmt = $pdo->prepare("SELECT value FROM settings WHERE key = 'gallery_video_folder'");
            $stmt->execute();
            $param = (string)($stmt->fetchColumn() ?: '');
        }
        $folder = trim(str_replace('\\', '/', (string)$param), " /\t\n\r\0\x0B");
        $folder = preg_replace('#/+#', '/', $folder) ?? '';
        if ($folder !== '' && preg_match('#(^|/)\.\.(/|$)#', $folder)) {
            jsonResponse(['error' => 'Путь к папке видео: внутри /uploads, без «..»'], 422);
        }

        $root = realpath(Paths::uploadsRoot());
        $base = $root === false ? false : ($folder === '' ? $root : realpath($root . '/' . $folder));
        $entries = [];
        if ($root !== false && $base !== false && is_dir($base)
            && ($base === $root || str_starts_with($base, $root . DIRECTORY_SEPARATOR))) {
            $exts = ['mp4', 'webm', 'mov', 'm4v'];
            /* Task 122: контекст товаров — «используемые» видео, состояние
               файла (нули/битый заголовок БЕЗ ffmpeg) и товар (название +
               обложка) для каждой записи. */
            $ctx = self::productContext($pdo);
            $it = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator(
                    $base,
                    FilesystemIterator::SKIP_DOTS | FilesystemIterator::CURRENT_AS_PATHNAME
                ),
                RecursiveIteratorIterator::LEAVES_ONLY
            );
            foreach ($it as $file) {
                $ext = strtolower(pathinfo((string)$file, PATHINFO_EXTENSION));
                if (!in_array($ext, $exts, true)) continue;
                $rel = ltrim(substr((string)$file, strlen($root)), '/\\');
                $dir = dirname($rel);
                $url = '/uploads/' . str_replace(DIRECTORY_SEPARATOR, '/', $rel);
                $folderName = $dir === '.' ? '' : $dir;
                $entries[] = [
                    'name'   => basename((string)$file),
                    'folder' => $folderName,
                    'path'   => 'media/' . $rel,
                    'url'    => $url,
                    'size'   => @filesize((string)$file) ?: 0,
                    'mtime'  => @filemtime((string)$file) ?: 0,
                    'used'   => isset($ctx['videoUsed'][$url]) || isset($ctx['videoUsed'][strtolower($url)]),
                    'status' => MediaOptimizer::videoHealth((string)$file),
                    'product' => self::productFor($ctx, $url, $folderName),
                ];
            }
            usort($entries, static fn (array $a, array $b): int => $b['mtime'] <=> $a['mtime']);
            if (count($entries) > 1000) $entries = array_slice($entries, 0, 1000);
        }

        jsonResponse(['data' => [
            'folder'  => $folder,
            'count'   => count($entries),
            'entries' => $entries,
        ]]);
    }

    /* ── СПИСОК КАРТИНОК ПОД /uploads (массовая оптимизация в WebP) ──
       GET /api/admin/files/images[?folder=]
       Тот же обход дерева, что у videos(): jpg/jpeg/png с размерами.
       Папка pdfs исключена — обложки каталогов жёстко именуются {alias}.jpg
       в PdfController, конвертация сломала бы ссылки на них.
       used — картинка подключена к товарам (product_images). */
    public static function images(PDO $pdo): void
    {
        Auth::requireEditor();

        $param = $_GET['folder'] ?? '';
        $folder = trim(str_replace('\\', '/', (string)$param), " /\t\n\r\0\x0B");
        $folder = preg_replace('#/+#', '/', $folder) ?? '';
        if ($folder !== '' && preg_match('#(^|/)\.\.(/|$)#', $folder)) {
            jsonResponse(['error' => 'Путь к папке картинок: внутри /uploads, без «..»'], 422);
        }

        $root = realpath(Paths::uploadsRoot());
        $base = $root === false ? false : ($folder === '' ? $root : realpath($root . '/' . $folder));
        $entries = [];
        if ($root !== false && $base !== false && is_dir($base)
            && ($base === $root || str_starts_with($base, $root . DIRECTORY_SEPARATOR))) {
            /* Ссылки из БД — одним запросом, чтобы честно пометить используемые */
            $referenced = [];
            try {
                foreach ($pdo->query("SELECT url FROM product_images WHERE media_type = 'image'") as $r) {
                    $norm = preg_replace('#/+#', '/', (string)$r['url']) ?? '';
                    $referenced[strtolower($norm)] = true;
                }
            } catch (PDOException) {
                // нет таблицы — считаем все картинки неиспользуемыми
            }
            /* Task 122: товар (название + обложка) для каждой картинки */
            $ctx = self::productContext($pdo);

            $exts = ['jpg', 'jpeg', 'png'];
            $it = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator(
                    $base,
                    FilesystemIterator::SKIP_DOTS | FilesystemIterator::CURRENT_AS_PATHNAME
                ),
                RecursiveIteratorIterator::LEAVES_ONLY
            );
            foreach ($it as $file) {
                $f = (string)$file;
                $rel = ltrim(substr($f, strlen($root)), '/\\');
                /* .trash и pdfs — мимо: корзина восстанавливается по именам,
                   обложки PDF привязаны к имени .jpg (см. комментарий выше) */
                if (strcasecmp(substr($rel, 0, 7), '.trash/') === 0
                    || strcasecmp(substr($rel, 0, 5), 'pdfs/') === 0) {
                    continue;
                }
                $ext = strtolower(pathinfo($f, PATHINFO_EXTENSION));
                if (!in_array($ext, $exts, true)) continue;
                $url = '/uploads/' . str_replace(DIRECTORY_SEPARATOR, '/', $rel);
                $dir = dirname($rel);
                $entries[] = [
                    'name'   => basename($f),
                    'folder' => $dir === '.' ? '' : $dir,
                    'url'    => $url,
                    'size'   => @filesize($f) ?: 0,
                    'mtime'  => @filemtime($f) ?: 0,
                    'used'   => isset($referenced[strtolower($url)]),
                    'product' => self::productFor($ctx, $url, $dir === '.' ? '' : $dir),
                ];
            }
            usort($entries, static fn (array $a, array $b): int => $b['mtime'] <=> $a['mtime']);
            if (count($entries) > 2000) $entries = array_slice($entries, 0, 2000);
        }

        jsonResponse(['data' => [
            'folder'  => $folder,
            'count'   => count($entries),
            'entries' => $entries,
        ]]);
    }

    /* ── ЗАГРУЗКА ФАЙЛА В ХРАНИЛИЩЕ (медиа и др. разделы) ──
       POST /api/admin/files/upload  JSON:
         { file_path: "up-xxxx.zip" (собранный chunk-файл из storage/chunked-uploads),
           original_name: "фото.jpg", target: "media[/подпапка]" }
       Файл переезжает из chunked-хранилища в целевую папку раздела:
       санитайз имени, дедупликация (name-1.ext), whitelist расширений,
       проверка MIME по содержимому. Ответ: {name, path, url, size}. */

    /** Разрешённые расширения → допустимые MIME (finfo) / семейства */
    private static function allowedExts(): array
    {
        return [
            'jpg'  => ['image/jpeg'],
            'jpeg' => ['image/jpeg'],
            'png'  => ['image/png'],
            'webp' => ['image/webp'],
            'gif'  => ['image/gif'],
            'avif' => ['image/avif', 'image/heif'],
            'mp4'  => ['video/mp4'],
            'webm' => ['video/webm'],
            'mov'  => ['video/quicktime', 'video/mp4'],
            'm4v'  => ['video/x-m4v', 'video/mp4'],
            'pdf'  => ['application/pdf'],
        ];
    }

    private static function maxBytesFor(string $ext): int
    {
        // Task 111: видео 512 MB → 1 GB — потолок чанковой загрузки поднят
        // до 1 ГБ, прежний лимит стал «ложным дном» ниже него
        if (in_array($ext, ['mp4', 'webm', 'mov', 'm4v'], true)) return 1024 * 1024 * 1024;
        if ($ext === 'pdf') return 64 * 1024 * 1024;
        return 32 * 1024 * 1024; // картинки
    }

    public static function upload(): void
    {
        Auth::requireEditor();

        $data = json_decode((string)file_get_contents('php://input'), true) ?? [];
        $filePath     = (string)($data['file_path'] ?? '');
        $originalName = (string)($data['original_name'] ?? '');
        $target       = (string)($data['target'] ?? '');

        // 1) источник — собранный chunk-файл
        $src = ChunkedUpload::resolveFile($filePath);
        if (!$src) {
            jsonResponse(['error' => 'Загруженный файл не найден (сессия загрузки истекла?)'], 422);
        }

        // 2) целевая папка (любой раздел, корень раздела разрешён)
        if ($target === '') jsonResponse(['error' => 'Не указана папка назначения'], 400);
        [$cfg, $key, $root, $abs, $rel] = self::resolve($target);
        if (!is_dir($abs)) jsonResponse(['error' => 'Папка назначения не найдена'], 404);

        // 3) расширение и лимит
        $ext = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
        $allowed = self::allowedExts();
        if ($ext === '' || !isset($allowed[$ext])) {
            jsonResponse(['error' => 'Формат не поддерживается: .' . $ext . ' (можно: '
                . implode(', ', array_keys($allowed)) . ')'], 422);
        }
        $size = @filesize($src) ?: 0;
        $max = self::maxBytesFor($ext);
        if ($size > $max) {
            jsonResponse(['error' => 'Файл больше ' . round($max / 1024 / 1024) . ' МБ'], 422);
        }

        // 4) MIME по содержимому (доверяем файлу, а не имени)
        $mime = @mime_content_type($src) ?: '';
        if (!in_array($mime, $allowed[$ext], true)) {
            jsonResponse(['error' => "Содержимое файла не похоже на .$ext (определено: $mime)"], 422);
        }

        // 5) санитайз имени: буквы/цифры/точка/дефис/пробел/подчёркивание (unicode)
        $base = self::sanitizeName(pathinfo($originalName, PATHINFO_FILENAME));
        if ($base === '') $base = 'file';
        $name = $base . '.' . $ext;

        // 6) дедупликация: photo.jpg → photo-1.jpg → photo-2.jpg …
        $dest = $abs . '/' . $name;
        if (is_file($dest)) {
            $n = 1;
            do {
                $name = $base . '-' . $n . '.' . $ext;
                $dest = $abs . '/' . $name;
                $n++;
            } while (is_file($dest) && $n < 1000);
        }

        // 7) переезд (тот же диск → rename; на всякий случай — копия)
        if (!@rename($src, $dest)) {
            if (!@copy($src, $dest)) {
                jsonResponse(['error' => 'Не удалось сохранить файл в хранилище'], 500);
            }
            @unlink($src);
        }
        @chmod($dest, 0644);

        /* 8) ОПТИМИЗАТОР: картинки jpg/png → webp, видео mov/m4v → mp4.
            При любой ошибке файл остаётся как есть. Имя может смениться
            (расширение/суффикс) — ответ отдаёт итоговые значения. */
        $optNote = '';
        if ($key === 'media') {
            if (in_array($ext, ['jpg', 'jpeg', 'png'], true)) {
                $opt = MediaOptimizer::optimizeImageFile($dest);
                if ($opt['converted']) {
                    $name = $opt['name'];
                    $dest = dirname($dest) . '/' . $name;
                    $optNote = $opt['note'];
                }
            } elseif (in_array($ext, ['mov', 'm4v'], true)) {
                $opt = MediaOptimizer::optimizeVideoFile($dest);
                if ($opt['converted']) {
                    $name = $opt['name'];
                    $dest = dirname($dest) . '/' . $name;
                    $optNote = $opt['note'];
                }
            }
        }

        jsonResponse(['data' => [
            'name'   => $name,
            'path'   => $key . ($rel === '' ? '' : '/' . $rel) . '/' . $name,
            'url'    => $cfg['public'] ? $cfg['public'] . '/' . ($rel === '' ? $name : $rel . '/' . $name) : null,
            'size'   => @filesize($dest) ?: 0,
            'optimized' => $optNote,
        ]]);
    }

    /* ── СОЗДАНИЕ ПАПКИ ──
       POST /api/admin/files/mkdir  JSON: { path: "раздел[/родитель]", name: "Имя" }
       Папку можно создавать в любом разделе (в media — для организации
       медиа по папкам; удаление в media по-прежнему запрещено). */
    public static function mkdir(): void
    {
        Auth::requireEditor();

        $data = json_decode((string)file_get_contents('php://input'), true) ?? [];
        $parent = (string)($data['path'] ?? '');
        $name   = (string)($data['name'] ?? '');

        if ($parent === '') {
            jsonResponse(['error' => 'Откройте раздел — папки создаются внутри разделов'], 400);
        }

        [$cfg, $key, $root, $abs, $rel] = self::resolve($parent);
        if (!is_dir($abs)) jsonResponse(['error' => 'Родительская папка не найдена'], 404);

        $safe = self::sanitizeName($name);
        if ($safe === '') {
            jsonResponse(['error' => 'Некорректное имя папки'], 422);
        }

        $dest = $abs . '/' . $safe;
        if (file_exists($dest)) {
            jsonResponse(['error' => 'Папка или файл с таким именем уже есть'], 409);
        }
        if (!@mkdir($dest, 0755)) {
            jsonResponse(['error' => 'Не удалось создать папку (права?)'], 500);
        }

        jsonResponse(['data' => [
            'name' => $safe,
            'path' => $key . ($rel === '' ? '' : '/' . $rel) . '/' . $safe,
        ]]);
    }

    /* ── ПЕРЕИМЕНОВАНИЕ (файл или папка) ──
       POST /api/admin/files/rename  JSON: { path: "раздел/…/старое", name: "Новое имя" }
       В своих разделах (exports/imports/backups) — всегда можно.
       В media (файлы товаров) — только если файл/папку не использует
       ни один товар (проверка по product_images + products.video_url):
       переименование используемого файла сломало бы ссылки (Task 93). */
    public static function rename(PDO $pdo): void
    {
        $payload = Auth::requireEditor();

        $data = json_decode((string)file_get_contents('php://input'), true) ?? [];
        $path = (string)($data['path'] ?? '');
        $name = (string)($data['name'] ?? '');

        [$cfg, $key, $root, $abs, $rel] = self::resolve($path);

        $isDir = is_dir($abs);
        if (!$cfg['deletable']) {
            /* публичный URL без ключа раздела (media → «/uploads/…») */
            $pubUrl = rtrim((string)($cfg['public'] ?? ''), '/') . '/' . $rel;
            if (self::isUsedByProducts(self::usedUrls($pdo), $pubUrl, $isDir)) {
                jsonResponse(['error' => 'Файл используется в товарах — переименование сломает ссылки. Сначала отвяжите его от товаров.'], 403);
            }
        }
        if ($rel === '') {
            jsonResponse(['error' => 'Нельзя переименовать сам раздел'], 400);
        }

        $safe = self::sanitizeName($name);
        if ($safe === '') {
            jsonResponse(['error' => 'Некорректное имя'], 422);
        }

        $dest = dirname($abs) . '/' . $safe;
        if ($dest !== $abs && file_exists($dest)) {
            jsonResponse(['error' => 'Папка или файл с таким именем уже есть'], 409);
        }
        if ($dest === $abs) {
            jsonResponse(['data' => ['ok' => true, 'path' => $path, 'name' => basename($abs)]]);
        }
        if (!@rename($abs, $dest)) {
            jsonResponse(['error' => 'Не удалось переименовать'], 500);
        }

        $newRel = ltrim(substr($dest, strlen($root)), '/');
        AdminLog::add($pdo, AdminLog::actor($payload), 'files.rename', "{$key}/{$rel} → {$safe}");
        jsonResponse(['data' => [
            'ok'   => true,
            'name' => $safe,
            'path' => $key . '/' . $newRel,
        ]]);
    }

    /* ── УДАЛЕНИЕ (файл или папка рекурсивно) ── */

    /* ── УДАЛЕНИЕ С КОРЗИНОЙ (Task 100) ──
       В разделе media удаление НЕ стирает файл, а перемещает его в
       /uploads/.trash/<id>/ (рядом meta.json с исходным путём) — можно
       восстановить или удалить навсегда из «Корзины». В остальных
       разделах (экспорт/импорт/бэкапы — одноразовые) удаление обычное.
       Путь вида media/.trash/… — полное удаление из корзины. */
    public static function delete(PDO $pdo = null): void
    {
        $payload = Auth::requireEditor();
        $pdo = $pdo ?? Database::get();

        $data = json_decode((string)file_get_contents('php://input'), true) ?? [];
        $path = (string)($data['path'] ?? '');

        [$cfg, $key, $root, $abs, $rel] = self::resolve($path);

        if ($rel === '') jsonResponse(['error' => 'Нельзя удалить сам раздел'], 400);

        /* Корзина media: разрешаем полное удаление из /uploads/.trash */
        if ($key === 'media' && str_starts_with($rel, '.trash/')) {
            if (!is_dir($abs) && !is_file($abs)) jsonResponse(['error' => 'Не найдено'], 404);
            is_dir($abs) ? self::rrmdir($abs) : @unlink($abs);
            @unlink(dirname($abs) . '/meta.json');
            AdminLog::add($pdo, AdminLog::actor($payload), 'files.trash-purge', $rel);
            jsonResponse(['data' => ['ok' => true, 'purged' => true]]);
        }

        if (!$cfg['deletable'] && $key !== 'media') {
            jsonResponse(['error' => 'Этот раздел только для просмотра'], 403);
        }

        if (!is_dir($abs) && !is_file($abs)) {
            jsonResponse(['error' => 'Не найдено'], 404);
        }

        if ($key === 'media') {
            /* Используемый товаром файл/папку в корзину нельзя — сломает
               карточки (та же защита, что у переименования, Task 93/100). */
            $pubUrl = rtrim((string)($cfg['public'] ?? ''), '/') . '/' . $rel;
            if (self::isUsedByProducts(self::usedUrls($pdo), $pubUrl, is_dir($abs))) {
                jsonResponse(['error' => 'Файл используется в товарах — сначала отвяжите его от товаров.'], 403);
            }
            /* Task 118: системные файлы витрины (снежинка, логотип, иконки
               шагов) и папки с ними — не удалять, на них ссылается код. */
            if (SystemFiles::isReferred($rel) || SystemFiles::referredInside($rel)) {
                jsonResponse(['error' => 'Системный файл витрины — удалять нельзя (нужен снегопаду/шапке/шагам на главной).'], 403);
            }
            $itemId = self::trashMove($root, $abs, $rel);
            AdminLog::add($pdo, AdminLog::actor($payload), 'files.delete',
                "media/{$rel} → корзина ({$itemId})");
            jsonResponse(['data' => ['ok' => true, 'trashed' => true, 'item' => $itemId]]);
        }

        if (is_dir($abs)) {
            self::rrmdir($abs);
        } else {
            @unlink($abs);
        }
        AdminLog::add($pdo, AdminLog::actor($payload), 'files.delete', "{$key}/{$rel}");

        jsonResponse(['data' => ['ok' => true]]);
    }

    /* ── КОРЗИНА ФАЙЛОВ (Task 100) ── */

    private static function trashDir(): string
    {
        $dir = Paths::uploadsRoot() . '/.trash';
        Paths::ensureDir($dir);
        return $dir;
    }

    /** Переместить файл/папку в корзину. Возвращает id позиции. */
    private static function trashMove(string $root, string $abs, string $rel): string
    {
        $itemId = date('Ymd-His') . '-' . substr(md5($rel . microtime()), 0, 6);
        $itemDir = self::trashDir() . '/' . $itemId;
        Paths::ensureDir($itemDir);

        $dest = $itemDir . '/' . basename($rel);

        /* meta.json ДО переноса (Task 130): если процесс умрёт между
           переименованием и записью meta, позиция оставалась навсегда
           «без meta.json» — не видна и не восстановима. Теперь orig/имя
           известны заранее, перенос может оборваться безопасно. */
        @file_put_contents($itemDir . '/meta.json', json_encode([
            'orig'     => $rel,
            'name'     => basename($rel),
            'is_dir'   => is_dir($abs),
            'moved_at' => date('c'),
        ], JSON_UNESCAPED_UNICODE));
        if (!@rename($abs, $dest)) {
            /* rename через устройства не проходит — копия + удаление */
            if (is_dir($abs)) {
                if (!@mkdir($dest, 0777, true)) throw new RuntimeException('trash mkdir failed');
                foreach (new RecursiveIteratorIterator(
                    new RecursiveDirectoryIterator($abs, FilesystemIterator::SKIP_DOTS),
                    RecursiveIteratorIterator::LEAVES_ONLY
                ) as $f) {
                    $t = $dest . '/' . substr($f->getPathname(), strlen($abs) + 1);
                    $td = dirname($t);
                    if (!is_dir($td)) @mkdir($td, 0777, true);
                    @copy($f->getPathname(), $t);
                }
                self::rrmdir($abs);
            } else {
                if (!@copy($abs, $dest)) throw new RuntimeException('trash copy failed');
                @unlink($abs);
            }
        }

        return $itemId;
    }

    /** GET /api/admin/files/trash — содержимое корзины (позиции старше 30 дней чистятся).
     *  Task 130: каждая позиция получает «свой» подарок — product{name,slug,thumb}
     *  (папка products/<папка> узнаётся через productContext, как в списках видео/
     *  картинок), чтобы владелец находил битые файлы по названию подарка, а не по
     *  безликим «video-0.mov». Позиции без meta.json тоже показываются (имя берём
     *  из содержимого) — их можно скачать и стереть, восстановить нельзя. */
    public static function trashList(): void
    {
        Auth::requireEditor();

        $trash = self::trashDir();
        $items = [];
        $ctx = null;      // контекст товаров — лениво, только если есть позиции
        $pdo = null;
        foreach (scandir($trash, SCANDIR_SORT_ASCENDING) ?: [] as $id) {
            if ($id === '.' || $id === '..') continue;
            $itemDir = $trash . '/' . $id;
            if (!is_dir($itemDir)) continue;
            $meta = json_decode((string)@file_get_contents($itemDir . '/meta.json'), true);

            /* Автоочистка: 30 дней в корзине — позиция удаляется */
            $movedTs = is_array($meta)
                ? (strtotime((string)($meta['moved_at'] ?? '')) ?: (@filemtime($itemDir) ?: time()))
                : (@filemtime($itemDir) ?: time());
            if (time() - $movedTs > 30 * 86400) {
                self::rrmdir($itemDir);
                continue;
            }

            /* Содержимое позиции: имя/размер; заодно — живые позиции без meta */
            $size = 0;
            $firstName = '';
            $entries = 0;
            foreach (scandir($itemDir, SCANDIR_SORT_ASCENDING) ?: [] as $n) {
                if ($n === '.' || $n === '..' || $n === 'meta.json') continue;
                $p = $itemDir . '/' . $n;
                $size += is_dir($p) ? self::dirSize($p) : (@filesize($p) ?: 0);
                $entries++;
                if ($firstName === '') $firstName = $n;
            }

            if (!is_array($meta)) {
                /* Позиция без meta.json (обрыв записи до Task 130): показать,
                   чтобы владелец мог скачать файл или стереть позицию */
                if ($entries === 0) { @rmdir($itemDir); continue; }
                $items[] = [
                    'id'       => $id,
                    'name'     => $firstName,
                    'orig'     => '',
                    'is_dir'   => is_dir($itemDir . '/' . $firstName),
                    'size'     => $size,
                    'moved_at' => date('c', $movedTs),
                    'product'  => null,
                    'no_meta'  => true,
                ];
                continue;
            }

            $orig = (string)($meta['orig'] ?? '');
            /* Подарок позиции: по исходному пути products/<папка>/… */
            $product = null;
            if ($orig !== '') {
                $folder = (bool)($meta['is_dir'] ?? false)
                    ? $orig
                    : (str_contains($orig, '/') ? preg_replace('#/[^/]*$#', '', $orig) : '');
                if ($folder !== '') {
                    if ($pdo === null) $pdo = Database::get();
                    if ($ctx === null) $ctx = self::productContext($pdo);
                    $product = self::productFor($ctx, '/uploads/' . $orig, $folder);
                }
            }

            $items[] = [
                'id'       => $id,
                'name'     => (string)($meta['name'] ?? $id),
                'orig'     => $orig,
                'is_dir'   => (bool)($meta['is_dir'] ?? false),
                'size'     => $size,
                'moved_at' => date('c', $movedTs),
                'product'  => $product === null ? null : [
                    'name'  => $product['name'],
                    'slug'  => $product['slug'],
                    'thumb' => $product['thumb'],
                ],
            ];
        }

        /* Новее сверху */
        usort($items, static fn($a, $b) => strcmp((string)$b['id'], (string)$a['id']));
        jsonResponse(['data' => ['items' => $items]]);
    }

    /** POST /api/admin/files/restore {id} — вернуть файл/папку из корзины.
     *  Task 130: крепкая версия — внятная ошибка для позиции без meta.json,
     *  фолбэк на единственный файл позиции (если имя в meta не совпало —
     *  именно так выглядело «Файл в корзине не найден» у владельца), и
     *  копия+удаление, если rename не проходит (другая ФС/права). */
    public static function trashRestore(PDO $pdo): void
    {
        $payload = Auth::requireEditor();

        $data = json_decode((string)file_get_contents('php://input'), true) ?? [];
        $id = preg_replace('/[^a-z0-9\-]/i', '', (string)($data['id'] ?? ''));
        if ($id === '') jsonResponse(['error' => 'Не указана позиция'], 422);

        $itemDir = self::trashDir() . '/' . $id;
        if (!is_dir($itemDir)) {
            jsonResponse(['error' => 'Позиция не найдена — возможно, уже восстановлена или очищена'], 404);
        }
        $meta = json_decode((string)@file_get_contents($itemDir . '/meta.json'), true);
        if (!is_array($meta)) {
            jsonResponse(['error' => 'У позиции нет meta.json (путь неизвестен). Скачайте файл из корзины кнопкой «⬇» и загрузите заново.'], 404);
        }

        $orig = (string)$meta['orig'];
        if (str_contains($orig, '..') || str_starts_with($orig, '/')) {
            jsonResponse(['error' => 'Некорректный путь в корзине'], 422);
        }

        $root = realpath(Paths::uploadsRoot());
        if ($root === false) {
            jsonResponse(['error' => 'Хранилище uploads недоступно'], 500);
        }
        $target = $root . '/' . $orig;
        $finalTarget = $target;

        if (file_exists($finalTarget)) {
            /* На месте уже появился новый файл/папка — возвращаем рядом с суффиксом */
            $dirName = pathinfo($target, PATHINFO_DIRNAME);
            $base = basename($target);
            $ext = pathinfo($target, PATHINFO_EXTENSION);
            $stem = $ext !== '' ? substr($base, 0, -(strlen($ext) + 1)) : $base;
            $i = 1;
            do {
                $candidate = $dirName . '/' . $stem . '-restored' . ($i > 1 ? "-{$i}" : '') . ($ext !== '' ? ".{$ext}" : '');
                $i++;
            } while (file_exists($candidate) && $i < 100);
            $finalTarget = $candidate;
        }

        $tdir = dirname($finalTarget);
        if (!is_dir($tdir) && !@mkdir($tdir, 0777, true) && !is_dir($tdir)) {
            jsonResponse(['error' => 'Не удалось создать папку для возврата: ' . $tdir], 500);
        }

        $src = $itemDir . '/' . (string)($meta['name'] ?? '');
        if ((string)($meta['name'] ?? '') === '' || (!is_file($src) && !is_dir($src))) {
            /* Фолбэк: в позиции ровно один элемент — возвращаем его, даже если
               имя в meta не совпало с реальным содержимым */
            $entries = [];
            foreach (scandir($itemDir, SCANDIR_SORT_ASCENDING) ?: [] as $n) {
                if ($n === '.' || $n === '..' || $n === 'meta.json') continue;
                $entries[] = $n;
            }
            if (count($entries) === 1) {
                $src = $itemDir . '/' . $entries[0];
            } else {
                jsonResponse(['error' => 'Файл в корзине не найден (позиция ' . $id . ')'], 404);
            }
        }
        if (!@rename($src, $finalTarget)) {
            /* rename не прошёл (права/другая ФС) — копия + удаление оригинала */
            $copied = is_dir($src) ? self::copyRecursive($src, $finalTarget) : @copy($src, $finalTarget);
            if (!$copied) {
                jsonResponse(['error' => 'Не удалось вернуть файл — не хватило прав на ' . $finalTarget], 500);
            }
            is_dir($src) ? self::rrmdir($src) : @unlink($src);
        }
        @unlink($itemDir . '/meta.json');
        @rmdir($itemDir);

        $rel = ltrim(substr($finalTarget, strlen($root)), '/');
        AdminLog::add($pdo, AdminLog::actor($payload), 'files.restore', "{$id} → {$rel}");
        jsonResponse(['data' => ['ok' => true, 'path' => $rel]]);
    }

    /** POST /api/admin/files/trash-empty — очистить корзину целиком (Task 130).
     *  Одно обычное подтверждение на фронте, без перечисления позиций. */
    public static function trashEmpty(): void
    {
        $payload = Auth::requireEditor();

        $trash = self::trashDir();
        $removed = 0;
        foreach (scandir($trash, SCANDIR_SORT_ASCENDING) ?: [] as $id) {
            if ($id === '.' || $id === '..') continue;
            $itemDir = $trash . '/' . $id;
            if (is_dir($itemDir)) {
                self::rrmdir($itemDir);
                if (!is_dir($itemDir)) $removed++;
            } else {
                @unlink($itemDir);
                $removed++;
            }
        }
        AdminLog::add(Database::get(), AdminLog::actor($payload), 'files.trash-empty', "позиций: {$removed}");
        jsonResponse(['data' => ['ok' => true, 'removed' => $removed]]);
    }

    /* ── НЕИСПОЛЬЗУЕМЫЕ ФАЙЛЫ (Task 103) ──
       GET /api/admin/files/unused — файлы в /uploads, не привязанные
       ни к одному товару (product_images + products.video_url). Корзина
       (.trash) не учитывается. */
    public static function unused(PDO $pdo): void
    {
        Auth::requireEditor();

        $root = realpath(Paths::uploadsRoot());
        if ($root === false) jsonResponse(['data' => ['items' => [], 'total_size' => 0]]);

        $used = self::usedUrls($pdo);
        $items = [];
        $total = 0;
        $it = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS),
            RecursiveIteratorIterator::LEAVES_ONLY
        );
        $count = 0;
        foreach ($it as $f) {
            if (++$count > 20000) break;
            $abs = $f->getPathname();
            /* корзина и служебные файлы не участвуют */
            if (str_contains($abs, DIRECTORY_SEPARATOR . '.trash' . DIRECTORY_SEPARATOR)) continue;
            if (basename($abs) === 'meta.json') continue;
            $rel = ltrim(substr($abs, strlen($root)), '/\\');
            $rel = str_replace('\\', '/', $rel);
            /* pdfs/ — обложки и сами каталоги: привязаны к pdfs-таблице
               по имени ({alias}.jpg зашито в PdfController), в БД ссылок
               на них нет. Считать их «мусором» нельзя (Task 116). */
            if (strcasecmp(substr($rel, 0, 5), 'pdfs/') === 0) continue;
            /* Task 118: на эти файлы ссылается КОД витрины (снежинка,
               логотип, иконки шагов) — в БД их нет, но удалять нельзя. */
            if (SystemFiles::isReferred($rel)) continue;
            $url = '/uploads/' . $rel;
            if (isset($used[$url])) continue;
            $size = @filesize($abs) ?: 0;
            $total += $size;
            if (count($items) < 5000) {
                $items[] = [
                    'path' => $rel,
                    'url'  => $url,
                    'size' => $size,
                    'mtime' => @filemtime($abs) ?: 0,
                ];
            }
        }

        jsonResponse(['data' => [
            'items' => $items,
            'total_size' => $total,
            'total_files' => $count > 20000 ? '>20000' : count($items),
        ]]);
    }

    /** POST /api/admin/files/unused-purge {paths: [rel,…]} — убрать неиспользуемые
     *  файлы В КОРЗИНУ (.trash, восстановимо 30 дней — Task 116; раньше было
     *  безвозвратное unlink). Каждый путь перепроверяется: если файл успел
     *  привязаться — пропускаем. */
    public static function unusedPurge(PDO $pdo): void
    {
        $payload = Auth::requireEditor();

        $data = json_decode((string)file_get_contents('php://input'), true) ?? [];
        $paths = (array)($data['paths'] ?? []);
        if ($paths === []) jsonResponse(['error' => 'Не выбраны файлы'], 422);
        if (count($paths) > 5000) jsonResponse(['error' => 'Слишком много путей'], 422);

        $root = realpath(Paths::uploadsRoot());
        $used = self::usedUrls($pdo);
        $deleted = 0;
        $skipped = 0;
        foreach ($paths as $p) {
            $rel = ltrim(str_replace('\\', '/', (string)$p), '/');
            if ($rel === '' || str_contains($rel, '..') || str_starts_with($rel, '.trash')
                || strcasecmp(substr($rel, 0, 5), 'pdfs/') === 0
                || SystemFiles::isReferred($rel)) { /* Task 118: системные файлы витрины */
                $skipped++;
                continue;
            }
            $abs = $root . '/' . $rel;
            $real = realpath($abs);
            if ($real === false || !str_starts_with($real, $root . DIRECTORY_SEPARATOR) || !is_file($real)) {
                $skipped++;
                continue;
            }
            if (isset($used['/uploads/' . $rel])) {
                $skipped++; /* успел привязаться — не трогаем */
                continue;
            }
            try {
                self::trashMove($root, $real, $rel);
                $deleted++; /* не unlink, а в корзину — восстановимо (Task 116) */
            } catch (RuntimeException) {
                $skipped++;
            }
        }

        AdminLog::add($pdo, AdminLog::actor($payload), 'files.unused-purge',
            "в корзину {$deleted}, пропущено {$skipped}");
        jsonResponse(['data' => ['ok' => true, 'deleted' => $deleted, 'skipped' => $skipped]]);
    }

    /* ── ПОЧИНИТЬ БИТЫЕ ССЫЛКИ НА КАРТИНКИ (Task 116) ──
       POST /api/admin/files/fix-image-refs
       Сканирует product_images и витринные настройки (hero_image,
       snow_flake, hero_slides): если файла по ссылке НЕТ на диске, а в ТОЙ
       ЖЕ папке лежит картинка с тем же именем, но другим расширением
       (jpg/png/webp) — ссылка переписывается на существующий файл. Если в
       папке ничего подходящего нет — ссылка попадает в «потерянные»
       (честный список, файл придётся перезалить). Ничего не удаляет.
       Лечит последствия массовой оптимизации: база смотрит на .webp,
       которого на диске нет, рядом лежит исходный jpg. */
    public static function fixImageRefs(PDO $pdo): void
    {
        $payload = Auth::requireEditor();

        /* $url приходит в виде «/uploads/…», а склеиваем мы его с КОРНЕМ
           САЙТА (publicRoot) — не с uploadsRoot, иначе получается
           «uploads/uploads/…» и все ссылки казались потерянными. */
        $root = realpath(Paths::publicRoot());
        if ($root === false || !is_dir($root . '/uploads')) {
            jsonResponse(['error' => 'Папка /uploads недоступна'], 500);
        }

        $exts = ['webp', 'jpg', 'jpeg', 'png'];

        $resolve = static function (string $url) use ($root): ?string {
            if (!str_starts_with($url, '/uploads/')) return null;
            /* $url начинается с /uploads/, $root — корень сайта (public):
               склейка даёт public/uploads/… (в первой версии сегмент
               /uploads/ терялся — все ссылки казались потерянными). */
            $real = realpath($root . str_replace('\\', '/', $url));
            return ($real !== false && str_starts_with($real, $root . DIRECTORY_SEPARATOR) && is_file($real))
                ? $real : null;
        };
        $norm = static fn (string $u): string => preg_replace('#/+#', '/', $u) ?? $u;
        /* Существующий сиблинг в ТОЙ ЖЕ папке: тот же ствол, другое расширение. */
        $sibling = static function (string $url) use ($resolve, $exts): ?string {
            $dir = rtrim(dirname($url), '/');
            $stem = pathinfo($url, PATHINFO_FILENAME);
            foreach ($exts as $ext) {
                $cand = $dir . '/' . $stem . '.' . $ext;
                if ($cand === $url) continue;
                if ($resolve($cand) !== null) return $cand;
            }
            return null;
        };
        /* Залечить одну ссылку. Приоритет: 1) файл есть → ок; 2) ссылка
           смотрит на .webp, а рядом исходник jpg/png → ДОКОНВЕРТИРОВАТЬ webp
           на месте (перезаписать ссылки на исходник заодно — retargetImageRefs);
           3) иначе → переписать ссылку на существующий сиблинг;
           4) ничего нет → lost.
           Возвращает [статус, urlДляПереписывания|null, ответ_сервера]:
           ok — трогать не надо; converted — ссылка валидна, файл создан;
           fixed — переписать на urlДляПереписывания; lost — файлов нет. */
        $heal = static function (string $raw) use ($resolve, $norm, $sibling, $pdo): array {
            $url = $norm($raw);
            if ($resolve($url) !== null) return ['ok', null, null];
            $sib = $sibling($url);
            if ($sib === null) return ['lost', null, null];
            $refExt = strtolower(pathinfo($url, PATHINFO_EXTENSION));
            $sibExt = strtolower(pathinfo($sib, PATHINFO_EXTENSION));
            if ($refExt === 'webp' && in_array($sibExt, ['jpg', 'jpeg', 'png'], true)) {
                $opt = MediaOptimizer::optimizeImageFile((string)$resolve($sib));
                if ($opt['converted']) {
                    $newUrl = rtrim(dirname($sib), '/') . '/' . $opt['name'];
                    self::retargetImageRefs($pdo, $sib, $newUrl);
                    return ['converted', $newUrl, null];
                }
            }
            return ['fixed', $sib, null];
        };

        $checked = 0; $unchanged = 0;
        $fixed = []; $lost = []; $converted = [];

        /* product_images */
        try {
            $rows = $pdo->query("SELECT id, url FROM product_images WHERE media_type = 'image' AND url LIKE '%uploads/%'")->fetchAll();
        } catch (PDOException) {
            $rows = [];
        }
        foreach ($rows as $r) {
            $checked++;
            [$st, $to] = $heal((string)$r['url']);
            if ($st === 'ok') { $unchanged++; continue; }
            if ($st === 'converted') {
                $converted[] = ['where' => 'картинка товара #' . $r['id'], 'from' => $r['url'], 'to' => $to];
            } elseif ($st === 'fixed' && $to !== null) {
                $pdo->prepare('UPDATE product_images SET url = ? WHERE id = ?')->execute([$to, (int)$r['id']]);
                $fixed[] = ['where' => 'картинка товара #' . $r['id'], 'from' => $r['url'], 'to' => $to];
            } else {
                $lost[] = ['where' => 'картинка товара #' . $r['id'], 'url' => $r['url']];
            }
        }

        /* settings: hero_image / snow_flake — простые значения; hero_slides — JSON */
        try {
            $st = $pdo->query("SELECT key, value FROM settings WHERE key IN ('hero_image','snow_flake','hero_slides')");
            foreach ($st as $row) {
                $raw = (string)$row['value'];
                if ($raw === '') continue;
                if ($row['key'] === 'hero_slides') {
                    $slides = json_decode($raw, true);
                    if (!is_array($slides)) continue;
                    $changed = false;
                    foreach ($slides as $i => &$s) {
                        if (!is_array($s)) continue;
                        foreach (['url', 'image'] as $fld) {
                            $v = (string)($s[$fld] ?? '');
                            if ($v === '' || !str_starts_with($norm($v), '/uploads/')) continue;
                            $checked++;
                            [$cst, $to] = $heal($v);
                            if ($cst === 'ok') { $unchanged++; continue; }
                            if ($cst === 'converted') {
                                $converted[] = ['where' => 'слайд hero #' . ((int)$i + 1) . " ({$fld})", 'from' => $v, 'to' => $to];
                            } elseif ($cst === 'fixed' && $to !== null) {
                                $s[$fld] = $to; $changed = true;
                                $fixed[] = ['where' => 'слайд hero #' . ((int)$i + 1) . " ({$fld})", 'from' => $v, 'to' => $to];
                            } else {
                                $lost[] = ['where' => 'слайд hero #' . ((int)$i + 1) . " ({$fld})", 'url' => $v];
                            }
                        }
                    }
                    unset($s);
                    if ($changed) {
                        $pdo->prepare("UPDATE settings SET value = ? WHERE key = 'hero_slides'")
                            ->execute([json_encode($slides, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
                    }
                } else {
                    if (!str_starts_with($norm($raw), '/uploads/')) continue;
                    $checked++;
                    [$cst, $to] = $heal($raw);
                    if ($cst === 'ok') { $unchanged++; continue; }
                    if ($cst === 'converted') {
                        $converted[] = ['where' => "настройка {$row['key']}", 'from' => $raw, 'to' => $to];
                    } elseif ($cst === 'fixed' && $to !== null) {
                        $pdo->prepare('UPDATE settings SET value = ? WHERE key = ?')->execute([$to, $row['key']]);
                        $fixed[] = ['where' => "настройка {$row['key']}", 'from' => $raw, 'to' => $to];
                    } else {
                        $lost[] = ['where' => "настройка {$row['key']}", 'url' => $raw];
                    }
                }
            }
        } catch (PDOException) {
            // нет settings — пропускаем
        }

        AdminLog::add($pdo, AdminLog::actor($payload), 'files.fix-image-refs',
            "проверено {$checked}, доконвертировано " . count($converted)
            . ", исправлено " . count($fixed) . ", потеряно " . count($lost));
        jsonResponse(['data' => [
            'ok' => true,
            'checked' => $checked,
            'unchanged' => $unchanged,
            'converted' => $converted,
            'fixed' => $fixed,
            'lost' => $lost,
        ]]);
    }

    /* ── СЖАТИЕ ВИДЕО (кнопка «Сжать» в редакторе товара) ──
       POST /api/admin/files/compress  body: { url: "/uploads/…/file.mov" }
       mov/m4v → mp4 (remux без потери качества, иначе перекодирование),
       mp4 → перекодирование с усилением сжатия. Файл заменяется на диске,
       все привязки (product_images.url, products.video_url) переписываются
       на новый URL — видео остаётся подключённым к тем же товарам. */

    public static function compress(PDO $pdo): void
    {
        Auth::requireEditor();

        $data = json_decode((string)file_get_contents('php://input'), true) ?? [];
        $url = trim((string)($data['url'] ?? ''));

        if ($url === '') jsonResponse(['error' => 'Укажите URL файла'], 422);

        // Только файлы из /uploads/; защита от traversal — как в attach:
        // realpath обязан лежать внутри uploads-корня.
        $rel = str_starts_with($url, '/uploads/') ? substr($url, strlen('/uploads/')) : null;
        if ($rel === null || $rel === '' || str_contains($rel, '..')) {
            jsonResponse(['error' => 'Сжимать можно только файлы из /uploads/'], 422);
        }

        /* Нормализация унаследованных битых ссылок (Task 89): «/uploads//файл.mov»
           (источник ошибки «…/uploads//KAM_v012.mov: No such file or directory»)
           чистится сразу — дальше $url идёт в locateUploaded и в ответ админке.
           ОРИГИНАЛ из запроса сохраняется в $rawUrl: он нужен retargetRefs,
           чтобы переписать и унаследованные битые записи в базе («//»), и чистые.
           Кириллица/пробелы в путях тут ни при чём: они легальны и проходят
           без изменений. */
        $rawUrl = $url;
        $rel = ltrim($rel, '/');
        $url = '/uploads/' . $rel;

        $uploadsRoot = realpath(Paths::uploadsRoot());
        $realFile = $uploadsRoot === false ? false : realpath(Paths::publicRoot() . $url);
        $locatedUrl = $url; // URL, под которым файл реально лежит (для переписывания ссылок)

        /* Файла по точному пути нет — ЖИЗНЕННАЯ ситуация (Task 87):
            файл переместили по FTP, удалили, либо он уже был перекодирован
            параллельным запросом («Сжать» нажали дважды). Раньше отсюда
            уходил 404 или техношум ffmpeg «uploads//file.mov: No such
            file or directory». Теперь ищем файл по всему uploads-дереву. */
        if ($uploadsRoot === false || $realFile === false || !is_file($realFile)) {
            $found = self::locateUploaded($url);
            if ($found === null) {
                jsonResponse(['error' => 'Файл ' . basename($url)
                    . ' не найден в /uploads — возможно, он удалён или уже перекодирован'], 404);
            }
            if (strcasecmp(pathinfo($found['url'], PATHINFO_EXTENSION), 'mp4') === 0
                && strcasecmp(pathinfo($url, PATHINFO_EXTENSION), 'mp4') !== 0) {
                /* Просили mov, а на диске уже лежит mp4 с тем же именем —
                    видео было перекодировано ранее, осталось обновить ссылки. */
                $refs = self::retargetRefs($pdo, $rawUrl, $found['url']);
                $size = @filesize($found['abs']) ?: 0;
                jsonResponse(['data' => [
                    'ok'           => true,
                    'url'          => $found['url'],
                    'old_url'      => $url,
                    'before'       => $size,
                    'after'        => $size,
                    'note'         => 'видео уже было перекодировано ранее — найден готовый '
                        . basename($found['url']) . ', ссылки товаров обновлены',
                    'refs_updated' => $refs,
                ]]);
            }
            $realFile = $found['abs'];
            $locatedUrl = $found['url'];
        }
        if (!is_file($realFile)
            || !str_starts_with($realFile, $uploadsRoot . DIRECTORY_SEPARATOR)) {
            jsonResponse(['error' => 'Файл не найден на сервере'], 404);
        }

        $ext = strtolower(pathinfo($realFile, PATHINFO_EXTENSION));
        if (!in_array($ext, ['mov', 'm4v', 'mp4'], true)) {
            jsonResponse(['error' => 'Сжимать можно видео mov, m4v и mp4'], 422);
        }

        $opt = $ext === 'mp4'
            ? MediaOptimizer::recompressMp4File($realFile)
            : MediaOptimizer::optimizeVideoFile($realFile);

        if (!$opt['converted']) {
            // Честная причина: ffmpeg недоступен / уже сжато / кодек не взялся
            jsonResponse(['error' => $opt['note'] ?: 'Не удалось сжать видео'], 422);
        }

        $newUrl = rtrim(dirname($locatedUrl), '/') . '/' . $opt['name'];

        // Переписываем привязки, чтобы видео осталось у тех же товаров
        // (WHERE — по URL из запроса: именно он записан в базе, даже если
        // файл на диске нашёлся в другой папке и ссылка в базе устарела)
        $refs = self::retargetRefs($pdo, $rawUrl, $newUrl);

        jsonResponse(['data' => [
            'ok'           => true,
            'url'          => $newUrl,
            'old_url'      => $url,
            'before'       => $opt['before'],
            'after'        => $opt['after'],
            'note'         => $opt['note'],
            'refs_updated' => $refs,
        ]]);
    }

    /** Переписать ссылки на файл у товаров (product_images + products.video_url).
        Возвращает число обновлённых строк. Битый вариант с «//» (унаследованный
        из старых версий) тоже переписывается — иначе после сжатия он бы остался
        в базе и продолжал бы рождать ошибку «файл не найден» (Task 89). */
    private static function retargetRefs(PDO $pdo, string $fromUrl, string $toUrl): int
    {
        $refs = 0;
        $norm = preg_replace('#/+#', '/', $fromUrl) ?? $fromUrl;
        $variants = $norm === $fromUrl ? [$fromUrl] : [$fromUrl, $norm];
        $in = implode(',', array_fill(0, count($variants), '?'));

        $upd = $pdo->prepare("UPDATE product_images SET url = ? WHERE url IN ($in)");
        $upd->execute([$toUrl, ...$variants]);
        $refs += $upd->rowCount();

        try {
            $upd2 = $pdo->prepare("UPDATE products SET video_url = ? WHERE video_url IN ($in)");
            $upd2->execute([$toUrl, ...$variants]);
            $refs += $upd2->rowCount();
        } catch (PDOException) {
            // старая схема без products.video_url — пропускаем
        }
        return $refs;
    }

    /* ── ОПТИМИЗАЦИЯ КАРТИНКИ В WEBP (Task 114, «Картинки → WebP») ──
       POST /api/admin/files/compress-image  body: { url: "/uploads/…/file.jpg" }
       jpg/jpeg/png → webp (GD), файл заменяется, ссылки переписываются:
       product_images.url + настройки витрины (hero_image, hero_slides,
       snow_flake). Вебп вышел не меньше оригинала → честный отказ без
       изменений (файл и база не тронуты). */

    public static function compressImage(PDO $pdo): void
    {
        Auth::requireEditor();

        $data = json_decode((string)file_get_contents('php://input'), true) ?? [];
        $url = trim((string)($data['url'] ?? ''));
        if ($url === '') jsonResponse(['error' => 'Укажите URL файла'], 422);

        $rel = str_starts_with($url, '/uploads/') ? substr($url, strlen('/uploads/')) : null;
        if ($rel === null || $rel === '' || str_contains($rel, '..')) {
            jsonResponse(['error' => 'Сжимать можно только файлы из /uploads/'], 422);
        }
        /* pdfs/ — обложки каталогов именуются {alias}.jpg в PdfController;
           конвертация в .webp сломала бы ссылку на обложку. */
        $rel = ltrim($rel, '/');
        if (strcasecmp(substr($rel, 0, 5), 'pdfs/') === 0) {
            jsonResponse(['error' => 'Обложки PDF конвертировать нельзя — имя обложки жёстко зашито в каталогах'], 422);
        }

        /* Task 116: прежний locateUploaded-фолбэк (поиск по имени по всему
           дереву) ДЛЯ КАРТИНОК УДАЛЁН. Имена картинок неуникальны — в папке
           каждого товара лежит свой 0.jpg/1.jpg; если точного файла нет,
           фолбэк конвертировал ПЕРВУЮ попавшуюся чужую картинку с тем же
           именем (удаляя её оригинал!) и переписывал ссылки просящего товара
           на чужую папку — тот самый класс «разные файлы — одно название».
           Очередь оптимизатора всегда присылает точные пути из списка диска,
           а если файла нет — честный 404 и подсказка обновить список. */
        $uploadsRoot = realpath(Paths::uploadsRoot());
        $realFile = ($uploadsRoot !== false)
            ? realpath(Paths::publicRoot() . $url)
            : false;

        if ($uploadsRoot === false || $realFile === false || !is_file($realFile)
            || !str_starts_with($realFile, $uploadsRoot . DIRECTORY_SEPARATOR)) {
            jsonResponse(['error' => 'Файл ' . basename($url)
                . ' не найден на сервере — он уже конвертирован, перемещён или удалён.'
                . ' Закройте окно и откройте список заново — он возьмёт актуальные файлы.'], 404);
        }

        $ext = strtolower(pathinfo($realFile, PATHINFO_EXTENSION));
        if (!in_array($ext, ['jpg', 'jpeg', 'png'], true)) {
            jsonResponse(['error' => 'Конвертировать можно картинки jpg, jpeg и png'], 422);
        }

        $opt = MediaOptimizer::optimizeImageFile($realFile);
        /* Task 116: ссылочные переписывания — ТОЛЬКО когда файл реально
           записан на диск (imagewebp/rename у GD могут молча не пройти на
           переполненной квоте хостинга). Иначе база уедет на .webp, а файла
           не будет — те самые 404 на витрине. */
        $newPath = dirname($realFile) . '/' . $opt['name'];
        if (!$opt['converted'] || !is_file($newPath) || filesize($newPath) === 0) {
            jsonResponse(['error' => ($opt['note'] ?: 'Не удалось конвертировать картинку в WebP')
                . ' — файл не записан, ссылки в базе не тронуты. Проверьте свободное место/права на папке.'], 422);
        }

        $newUrl = rtrim(dirname($url), '/') . '/' . $opt['name'];
        $refs = self::retargetImageRefs($pdo, $url, $newUrl);

        jsonResponse(['data' => [
            'ok'           => true,
            'url'          => $newUrl,
            'old_url'      => $url,
            'before'       => $opt['before'],
            'after'        => $opt['after'],
            'note'         => $opt['note'],
            'refs_updated' => $refs,
        ]]);
    }

    /** Переписать ссылки на КАРТИНКУ: product_images.url и витринные
        настройки (hero_image, hero_slides JSON, snow_flake — только если
        значение начинается с /uploads/). Возвращает число обновлённых мест. */
    private static function retargetImageRefs(PDO $pdo, string $fromUrl, string $toUrl): int
    {
        $refs = 0;
        $variants = self::urlVariants($fromUrl);

        $in = implode(',', array_fill(0, count($variants), '?'));
        $upd = $pdo->prepare("UPDATE product_images SET url = ? WHERE url IN ($in)");
        $upd->execute([$toUrl, ...$variants]);
        $refs += $upd->rowCount();

        foreach (['hero_image', 'snow_flake'] as $key) {
            $sel = $pdo->prepare('SELECT value FROM settings WHERE key = ?');
            $sel->execute([$key]);
            $val = (string)($sel->fetchColumn() ?: '');
            if ($val === '' || !str_starts_with($val, '/uploads/')) continue;
            $newVal = self::swapUrlIn($val, $variants, $toUrl);
            if ($newVal !== $val) {
                $pdo->prepare('UPDATE settings SET value = ? WHERE key = ?')->execute([$newVal, $key]);
                $refs++;
            }
        }

        $sel = $pdo->prepare("SELECT value FROM settings WHERE key = 'hero_slides'");
        $sel->execute();
        $raw = (string)($sel->fetchColumn() ?: '');
        if ($raw !== '') {
            $slides = json_decode($raw, true);
            if (is_array($slides)) {
                $changed = false;
                foreach ($slides as &$s) {
                    if (!is_array($s)) continue;
                    foreach (['url', 'image'] as $field) {
                        $v = (string)($s[$field] ?? '');
                        if ($v === '' || !str_starts_with($v, '/uploads/')) continue;
                        $nv = self::swapUrlIn($v, $variants, $toUrl);
                        if ($nv !== $v) { $s[$field] = $nv; $changed = true; }
                    }
                }
                unset($s);
                if ($changed) {
                    $pdo->prepare("UPDATE settings SET value = ? WHERE key = 'hero_slides'")
                        ->execute([json_encode($slides, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
                    $refs++;
                }
            }
        }

        return $refs;
    }

    /** Варианты одного URL для WHERE IN: как записан в базе + нормализованный. */
    private static function urlVariants(string $url): array
    {
        $norm = preg_replace('#/+#', '/', $url) ?? $url;
        return $norm === $url ? [$url] : [$url, $norm];
    }

    /** Заменить $url (или его нормализованный вариант) в строке-значении.
        Точное совпадение → новый URL; иначе (на всякий случай) не трогаем. */
    private static function swapUrlIn(string $value, array $variants, string $toUrl): string
    {
        foreach ($variants as $v) {
            if ($value === $v) return $toUrl;
        }
        return $value;
    }

    /* ── ZIP-ОТЧЁТ ПО ПРОБЛЕМНЫМ ФАЙЛАМ (Task 122, архитектура импорта) ──
       POST /api/admin/files/media-report-zip  body: { urls: ["/uploads/…", …] }
       Собирает lakomka-media-report-<дата>.zip в разделе exports:
       products.csv (формат импорта: ID;НАЗВАНИЕ;…;КАРТИНКИ;ВИДЕО;…)
       + images/{id}-{n}.{ext} + videos/{id}-v{n}.{ext} для КАЖДОГО товара,
       чей файл попал в отчёт. Владелец заменяет битые файлы в videos/
       (имена сохраняет) и загружает архив через «Импорт товаров» —
       медиа перечисленных товаров перестроится целиком (как при обычном
       импорте: clearMedia + заново), поэтому в CSV и ZIP включаются ВСЕ
       медиа этих товаров, а не только проблемные файлы. */
    public static function mediaReportZip(PDO $pdo): void
    {
        $payload = Auth::requireEditor();

        $data = json_decode((string)file_get_contents('php://input'), true) ?? [];
        $urls = [];
        foreach ((array)($data['urls'] ?? []) as $u) {
            $u = preg_replace('#/+#', '/', trim((string)$u)) ?? '';
            if (str_starts_with($u, '/uploads/') && !str_contains($u, '..')) $urls[] = $u;
        }
        $urls = array_values(array_unique($urls));
        if ($urls === []) jsonResponse(['error' => 'Не указаны файлы отчёта'], 422);
        if (count($urls) > 2000) jsonResponse(['error' => 'Слишком много файлов'], 422);

        /* Файл → товар: привязка из базы, иначе папка products/<папка> */
        $ctx = self::productContext($pdo);
        $productIds = [];
        foreach ($urls as $u) {
            $rel = substr($u, strlen('/uploads/'));
            $folder = dirname($rel);
            $p = self::productFor($ctx, $u, $folder === '.' ? '' : $folder);
            if ($p !== null) $productIds[(int)$p['id']] = true;
        }
        if ($productIds === []) {
            jsonResponse(['error' => 'По этим файлам не найдено товаров — они не привязаны к базе и папки их не опознаны. Такие файлы можно удалить через «Неиспользуемые файлы»'], 422);
        }

        if (!class_exists('ZipArchive')) {
            jsonResponse(['error' => 'Расширение zip не установлено в PHP'], 500);
        }
        $exportsDir = Paths::exportsDir();
        if (!is_dir($exportsDir) && !@mkdir($exportsDir, 0755, true)) {
            jsonResponse(['error' => 'Не удалось создать папку экспорта'], 500);
        }
        $name = 'lakomka-media-report-' . date('Ymd-His') . '.zip';
        $zipPath = $exportsDir . '/' . $name;

        $zip = new ZipArchive();
        if ($zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            jsonResponse(['error' => 'Не удалось создать ZIP-архив'], 500);
        }

        $in = implode(',', array_fill(0, count($productIds), '?'));
        $stmt = $pdo->prepare('SELECT * FROM products WHERE id IN (' . $in . ') ORDER BY id');
        $stmt->execute(array_keys($productIds));
        $rows = $stmt->fetchAll();

        $catMap = [];
        try {
            foreach ($pdo->query('SELECT id, slug FROM categories') as $c) {
                $catMap[(int)$c['id']] = $c['slug'];
            }
        } catch (PDOException) {
            // нет категорий — пустая колонка
        }
        $mediaStmt = $pdo->prepare(
            "SELECT url, media_type FROM product_images
             WHERE product_id = ? ORDER BY media_type DESC, sort_order, id"
        );

        $headers = [
            'ID', 'НАЗВАНИЕ', 'ТИП', 'SLUG', 'SKU',
            'ЦЕНА', 'СТАРАЯ_ЦЕНА', 'ОСТАТОК',
            'ВЕС', 'ДЛИНА', 'ШИРИНА', 'ВЫСОТА',
            'ПРОИЗВОДИТЕЛЬ', 'КАТЕГОРИЯ', 'ОПИСАНИЕ',
            'КАРТИНКИ', 'ВИДЕО', 'РЕЦЕПТ_ВЕС', 'УПАКОВКА',
            'ПОКАЗЫВАТЬ', 'ОПУБЛИКОВАН', 'LEGACY_SLUG',
        ];
        $csv = "\xEF\xBB\xBF" . implode(';', array_map([self::class, 'csvEscape'], $headers)) . "\n";

        $stats = ['videos' => 0, 'images' => 0, 'videos_missing' => 0, 'images_missing' => 0];
        $toReplace = [];
        $publicRoot = (string)Paths::publicRoot();

        foreach ($rows as $p) {
            $mediaStmt->execute([$p['id']]);
            $media = $mediaStmt->fetchAll();

            $imageNames = [];
            $videoNames = [];
            $imageCounter = 0;
            $videoCounter = 0;

            foreach ($media as $m) {
                $url = preg_replace('#/+#', '/', (string)$m['url']) ?? (string)$m['url'];

                if ((string)$m['media_type'] === 'video') {
                    if (str_starts_with($url, '/uploads/')) {
                        $ext = strtolower(pathinfo($url, PATHINFO_EXTENSION)) ?: 'mp4';
                        $zipName = $p['id'] . '-v' . $videoCounter . '.' . $ext;
                        $src = $publicRoot . $url;
                        if (is_file($src)) {
                            $zip->addFile($src, 'videos/' . $zipName);
                            $stats['videos']++;
                            if (in_array($url, $urls, true) && MediaOptimizer::videoHealth($src) !== 'ok') {
                                $toReplace[] = [
                                    'product' => (string)$p['name'],
                                    'zip'     => 'videos/' . $zipName,
                                    'url'     => $url,
                                ];
                            }
                        } else {
                            $stats['videos_missing']++;
                        }
                        $videoNames[] = $zipName;
                        $videoCounter++;
                    } elseif (str_starts_with($url, 'http')) {
                        $videoNames[] = $url;
                    }
                    continue;
                }

                // картинка
                if (str_starts_with($url, '/uploads/')) {
                    $ext = strtolower(pathinfo($url, PATHINFO_EXTENSION)) ?: 'jpg';
                    if ($ext === 'jpeg') $ext = 'jpg';
                    $zipName = $p['id'] . '-' . $imageCounter . '.' . $ext;
                    $src = $publicRoot . $url;
                    if (is_file($src)) {
                        $zip->addFile($src, 'images/' . $zipName);
                        $stats['images']++;
                    } else {
                        $stats['images_missing']++;
                        $imageCounter++;
                        continue;
                    }
                    $imageNames[] = $zipName;
                    $imageCounter++;
                } elseif (str_starts_with($url, 'http')) {
                    $imageNames[] = $url;
                }
            }

            $row = [
                $p['id'], $p['name'], $p['type'], $p['slug'], $p['sku'] ?? '',
                $p['price_kopecks'] > 0 ? number_format($p['price_kopecks'] / 100, 2, '.', '') : '0',
                $p['old_price_kopecks'] ? number_format($p['old_price_kopecks'] / 100, 2, '.', '') : '',
                $p['stock_qty'], $p['weight_g'] ?? '', $p['length_cm'] ?? '',
                $p['width_cm'] ?? '', $p['height_cm'] ?? '',
                $p['manufacturer'] ?? '', $p['category_id'] ? ($catMap[(int)$p['category_id']] ?? '') : '', $p['description'] ?? '',
                implode(',', $imageNames),
                implode(',', $videoNames),
                $p['recipe_weight_g'] ?? '', $p['packaging_material'] ?? '',
                $p['show_in_catalog'], $p['is_published'], $p['legacy_slug'] ?? '',
            ];
            $csv .= implode(';', array_map([self::class, 'csvEscape'], $row)) . "\n";
        }

        $zip->addFromString('products.csv', $csv);
        $zip->close();

        AdminLog::add($pdo, AdminLog::actor($payload), 'files.media-report-zip',
            'товаров ' . count($rows) . ", видео {$stats['videos']}, картинок {$stats['images']}, к замене " . count($toReplace));

        jsonResponse(['data' => [
            'ok'            => true,
            'file'          => $name,
            'download_url'  => '/api/admin/files/download?path=exports/' . rawurlencode($name),
            'size'          => @filesize($zipPath) ?: 0,
            'products'      => array_map(static fn ($p) => ['id' => (int)$p['id'], 'name' => (string)$p['name']], $rows),
            'videos_packed' => $stats['videos'],
            'images_packed' => $stats['images'],
            'videos_missing' => $stats['videos_missing'],
            'images_missing' => $stats['images_missing'],
            'to_replace'    => $toReplace,
        ]]);
    }

    /** Экранирование значения CSV (формат импорта/экспорта: «;», кавычки). */
    private static function csvEscape(string|int|float|null $v): string
    {
        if ($v === null) return '';
        $s = (string)$v;
        if ($s === '') return '';
        if (strpbrk($s, ";,\"\n\r") !== false) {
            return '"' . str_replace('"', '""', $s) . '"';
        }
        return $s;
    }

    /** Поиск файла по всему /uploads, когда точный URL не существует.
        Приоритет: 1) то же имя в любой папке; 2) то же имя без учёта
        регистра; 3) тот же ствол с .mp4 — файл уже был перекодирован.
        Совпадений несколько → берём самый свежий по mtime.
        Возвращает ['url' => '/uploads/…', 'abs' => '…'] или null. */
    private static function locateUploaded(string $url): ?array
    {
        $root = realpath(Paths::uploadsRoot());
        if ($root === false || !is_dir($root)) return null;

        $name = basename($url);                        // KAM_v012.mov
        $stem = pathinfo($name, PATHINFO_FILENAME);    // KAM_v012
        if ($name === '' || $name === '.' || $name === '..') return null;

        $same = [];    // то же имя (KAM_v012.mov в другой папке)
        $ci = [];      // то же имя, регистр отличается (kam_V012.MOV)
        $mp4 = [];     // тот же ствол с .mp4 (уже перекодирован ранее)
        try {
            $it = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS | FilesystemIterator::CURRENT_AS_PATHNAME),
                RecursiveIteratorIterator::LEAVES_ONLY
            );
            foreach ($it as $file) {
                $f = (string)$file;
                $b = basename($f);
                if ($b === $name) $same[] = $f;
                elseif (strcasecmp($b, $name) === 0) $ci[] = $f;
                elseif (strcasecmp(pathinfo($b, PATHINFO_FILENAME), $stem) === 0
                        && strcasecmp(pathinfo($b, PATHINFO_EXTENSION), 'mp4') === 0) {
                    $mp4[] = $f;
                }
            }
        } catch (UnexpectedValueException) {
            return null; // дерево не прочиталось (права и т.п.)
        }

        /* Task 116: НЕОДНОЗНАЧНОСТЬ. Если одно и то же имя лежит в нескольких
           разных папках (0.mov у каждого товара — обычное дело), выбор
           «самого свежего» — это конвертация ЧУЖОГО файла и переписывание
           ссылок просящего товара на чужую папку. Такие имена фолбэк
           больше не угадывает — точный путь знает только запросчик. */
        $multiDir = static function (array $list): bool {
            $dirs = [];
            foreach ($list as $f) { $dirs[dirname($f)] = true; }
            return count($dirs) > 1;
        };
        if ($multiDir($same)) $same = [];
        if ($multiDir($ci)) $ci = [];

        $pick = static function (array $list) use ($root): ?string {
            if ($list === []) return null;
            $best = null; $bestM = -1;
            foreach ($list as $f) {
                $m = @filemtime($f) ?: 0;
                if ($m > $bestM) { $bestM = $m; $best = $f; }
            }
            return $best;
        };
        $abs = $pick($same) ?? $pick($ci) ?? $pick($mp4);
        if ($abs === null) return null;

        $rel = ltrim(substr($abs, strlen($root)), '/\\');
        return [
            'abs' => $abs,
            'url' => '/uploads/' . str_replace(DIRECTORY_SEPARATOR, '/', $rel),
        ];
    }

    /* ── СКАЧИВАНИЕ ФАЙЛА СЕРВЕРОМ (для разделов без публичного URL) ── */

    public static function download(): void
    {
        Auth::requireEditor();

        $path = (string)($_GET['path'] ?? '');
        [$cfg, $key, $root, $abs, $rel] = self::resolve($path);

        if (!is_file($abs)) jsonResponse(['error' => 'Файл не найден'], 404);

        $size = @filesize($abs) ?: 0;
        /* ?as= — переименовать при скачивании (Task 130: корзина отдаёт
           файл именем подарка, а не безликим «video-0.mov») */
        $as = self::sanitizeName((string)($_GET['as'] ?? ''));
        $name = $as !== '' ? $as : basename($abs);

        while (ob_get_level() > 0) { ob_end_clean(); }
        header('Content-Type: application/octet-stream');
        header('Content-Length: ' . $size);
        header('X-Content-Type-Options: nosniff');
        header('Cache-Control: no-store');
        header('Content-Disposition: attachment; filename="' . addslashes($name) . '"');

        set_time_limit(0);
        $fh = fopen($abs, 'rb');
        if (!$fh) exit;
        while (!feof($fh)) {
            echo fread($fh, 1024 * 1024);
            flush();
        }
        fclose($fh);
        exit;
    }

    /* ── внутреннее ── */

    /** Санитайз имени файла/папки: unicode-буквы, цифры, точка, дефис,
      * пробел, подчёркивание; до 100 символов; без точек/пробелов по краям. */
    private static function sanitizeName(string $raw): string
    {
        $base = trim(preg_replace('/[^\p{L}\p{N}._\- ]+/u', '_', $raw) ?? '', " ._");
        $base = mb_substr($base, 0, 100);
        if ($base === '' || $base === '_') return '';
        return $base;
    }

    private static function dirSize(string $dir): int
    {
        $sum = 0;
        foreach (glob($dir . '/*', GLOB_NOSORT) ?: [] as $f) {
            $sum += is_dir($f) ? self::dirSize($f) : (@filesize($f) ?: 0);
        }
        return $sum;
    }

    private static function rrmdir(string $dir): void
    {
        /* scandir вместо glob — glob('/*') не видит точечные файлы
           (.DS_Store и т.п.), из-за них rmdir молча не проходил */
        foreach (scandir($dir, SCANDIR_SORT_NONE) ?: [] as $f) {
            if ($f === '.' || $f === '..') continue;
            is_dir($dir . '/' . $f) ? self::rrmdir($dir . '/' . $f) : @unlink($dir . '/' . $f);
        }
        @rmdir($dir);
    }

    /** Рекурсивная копия папки (фолбэк восстановления, если rename не прошёл). */
    private static function copyRecursive(string $src, string $dst): bool
    {
        if (!is_dir($dst) && !@mkdir($dst, 0777, true) && !is_dir($dst)) return false;
        foreach (scandir($src, SCANDIR_SORT_NONE) ?: [] as $n) {
            if ($n === '.' || $n === '..') continue;
            $s = $src . '/' . $n;
            $t = $dst . '/' . $n;
            if (is_dir($s)) {
                if (!self::copyRecursive($s, $t)) return false;
            } elseif (!@copy($s, $t)) {
                return false;
            }
        }
        return true;
    }
}
