<?php

class MediaOptimizer
{
    /* ============================================================
       ОПТИМИЗАТОР МЕДИА (Task 81)
       Картинки → WebP (GD), видео mov/m4v → mp4 (ffmpeg).
       Вызывается из контроллеров загрузки; ВСЕГДА безопасен:
       любая ошибка → файл остаётся как есть, загрузка не падает.
       ============================================================ */

    /** Максимальная сторона картинки после сжатия (px) */
    public const IMAGE_MAX_DIM = 2000;
    /** Качество WebP (0–100) */
    public const IMAGE_QUALITY = 82;
    /** Защита от OOM: не декодируем картинки больше ~36 Мп */
    private const IMAGE_MAX_PIXELS = 36000000;

    /** @var array<string,bool>|null кэш доступности ffmpeg */
    private static ?array $ffmpegBin = null;

    /* ─────────────────────────── КАРТИНКИ ─────────────────────────── */

    /**
     * Конвертирует картинку в WebP (на месте, с уменьшением до maxDim).
     * Файл перезаписывается ТОЛЬКО если webp вышел не больше оригинала.
     *
     * @return array{converted:bool, name:string, before:int, after:int, note:string}
     *         name — итоговое имя файла (может сменить расширение на .webp)
     */
    public static function optimizeImageFile(string $path, int $maxDim = self::IMAGE_MAX_DIM, int $quality = self::IMAGE_QUALITY): array
    {
        $name = basename($path);
        $before = @filesize($path) ?: 0;
        $noop = ['converted' => false, 'name' => $name, 'before' => $before, 'after' => $before, 'note' => ''];

        if (!is_file($path) || !function_exists('imagewebp')) return $noop;

        $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
        // webp/gif/svg уже не трогаем: webp оптимален, gif может быть анимированным,
        // svg — вектор. Конвертируем jpg/jpeg/png (главные «тяжеловесы»).
        if (!in_array($ext, ['jpg', 'jpeg', 'png'], true)) {
            return $noop;
        }

        $info = @getimagesize($path);
        if (!$info || empty($info[0]) || empty($info[1])) return $noop;
        [$w, $h] = $info;
        if ($w * $h > self::IMAGE_MAX_PIXELS) {
            return ['converted' => false, 'name' => $name, 'before' => $before, 'after' => $before,
                    'note' => 'картинка слишком большая для сжатия, оставлена как есть'];
        }

        // Декодируем (jpeg/png/webp/avif — что умеет GD)
        $raw = @file_get_contents($path);
        if ($raw === false) return $noop;
        if (function_exists('ini_set')) { @ini_set('memory_limit', '512M'); }
        $img = @imagecreatefromstring($raw);
        if (!$img) return $noop; // GD не смог (битый/экзотический файл) — оставляем

        // Уменьшение до maxDim с сохранением пропорций
        $newW = $w; $newH = $h;
        if (max($w, $h) > $maxDim) {
            $scale = $maxDim / max($w, $h);
            $newW = max(1, (int)round($w * $scale));
            $newH = max(1, (int)round($h * $scale));
            $resized = imagecreatetruecolor($newW, $newH);
            if (!$resized) { imagedestroy($img); return $noop; }
            // Сохраняем альфа-канал (прозрачность PNG)
            imagealphablending($resized, false);
            imagesavealpha($resized, true);
            $transparent = imagecolorallocatealpha($resized, 0, 0, 0, 127);
            imagefilledrectangle($resized, 0, 0, $newW, $newH, $transparent);
            imagecopyresampled($resized, $img, 0, 0, 0, 0, $newW, $newH, $w, $h);
            imagedestroy($img);
            $img = $resized;
        } else {
            imagesavealpha($img, true);
        }

        // Кодируем в WebP во временный файл рядом
        $tmp = $path . '.webp-tmp';
        $ok = false;
        $ob = fopen($tmp, 'wb');
        if ($ob) {
            $ok = imagewebp($img, $ob, max(30, min(95, $quality)));
            fclose($ob);
        }
        imagedestroy($img);
        if (!$ok || !is_file($tmp)) {
            @unlink($tmp);
            return $noop;
        }

        $after = @filesize($tmp) ?: 0;
        // Заменяем оригинал только если webp реально не тяжелее (минус ≥5%)
        if ($before > 0 && $after > $before * 0.95) {
            @unlink($tmp);
            return ['converted' => false, 'name' => $name, 'before' => $before, 'after' => $before,
                    'note' => 'webp вышел не меньше оригинала, оставлен исходный формат'];
        }

        $newName = preg_replace('/\.(jpe?g|png)$/i', '', $name) . '.webp';
        $newPath = dirname($path) . '/' . $newName;
        // На случай коллизии имён (photo.jpg + photo.png) — добавляем суффикс
        if ($newPath !== $tmp && is_file($newPath)) {
            $newName = preg_replace('/\.webp$/', '', $newName) . '-' . bin2hex(random_bytes(3)) . '.webp';
            $newPath = dirname($path) . '/' . $newName;
        }
        if (!@rename($tmp, $newPath)) {
            @unlink($tmp);
            return $noop;
        }
        @chmod($newPath, 0644);
        if ($newPath !== $path) @unlink($path);

        return [
            'converted' => true,
            'name'      => $newName,
            'before'    => $before,
            'after'     => $after,
            'note'      => sprintf('%s → %s (%s → %s)', $name, $newName, self::fmt($before), self::fmt($after)),
        ];
    }

    /* ─────────────────────────── ВИДЕО ─────────────────────────── */

    /** Кодеки, которые играют во всех современных браузерах внутри mp4 */
    private const WEB_SAFE_CODECS = ['h264', 'vp8', 'vp9', 'av1'];

    /**
     * mov/m4v → mp4. КАСКАД МЕТОДОВ — от самого быстрого/бережного
     * к самому тяжёлому, первый успешный побеждает:
     *   1) пересборка контейнера без перекодирования (-c copy);
     *   2) пересборка только видео+звук (iPhone-файлы часто содержат
     *      timecode/data-дорожки, из-за которых mp4-муксер отказывается
     *      писать контейнер — «Could not find tag for codec tmcd»);
     *   3) перекодирование в H.264/AAC (HEVC, ProRes, 10-bit, нечётные
     *      размеры — с добивкой размеров до чётных, иначе x264 не возьмёт);
     *   4) перекодирование без звука (когда мешает только аудиодорожка).
     * Результат ремукса дополнительно проверяется на web-совместимый
     * кодек: ffmpeg молча кладёт ProRes/HEVC в mp4, но браузеры такое
     * не воспроизводят — тогда идём дальше по каскаду.
     * При полном провале в note попадает РЕАЛЬНАЯ причина от ffmpeg.
     * mp4/webm не трогаем. Без ffmpeg файл остаётся как есть.
     *
     * @return array{converted:bool, name:string, before:int, after:int, note:string}
     */
    public static function optimizeVideoFile(string $path): array
    {
        // нормализуем разделители: «uploads//file.mov» иначе уезжает в ответ
        // ffmpeg как есть и пугает пользователя двойными слэшами
        $path = preg_replace('#/+#', '/', (string)$path) ?? $path;
        $name = basename($path);
        $before = @filesize($path) ?: 0;
        $noop = ['converted' => false, 'name' => $name, 'before' => $before, 'after' => $before, 'note' => ''];

        if (!is_file($path)) {
            // раньше здесь был молчаливый noop — вызывающий показывал пустое
            // «Не удалось сжать видео», а при гонке двух запросов ffmpeg
            // успевал упасть с техношумом «No such file or directory»
            return ['converted' => false, 'name' => $name, 'before' => $before, 'after' => $before,
                    'note' => 'файл не найден на диске — возможно, он был перемещён, удалён или уже перекодирован'];
        }
        $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
        if (!in_array($ext, ['mov', 'm4v'], true)) return $noop; // mp4/webm уже хороши

        $bin = self::ffmpeg();
        if ($bin === null) {
            return ['converted' => false, 'name' => $name, 'before' => $before, 'after' => $before,
                    'note' => 'ffmpeg на сервере недоступен — видео оставлено в исходном формате'];
        }

        // Место на диске: транскод требует буфер ~1.2× размера исходника
        $free = @disk_free_space(dirname($path));
        if ($free !== false && $before > 0 && $free < $before * 1.2) {
            return ['converted' => false, 'name' => $name, 'before' => $before, 'after' => $before,
                    'note' => 'на диске мало места (свободно ' . self::fmt((int)$free) . ') — сжатие отменено'];
        }

        $newName = preg_replace('/\.(mov|m4v)$/i', '', $name) . '.mp4';
        $dst = dirname($path) . '/' . $newName;
        $i = 1;
        while (is_file($dst) && $i < 1000) {
            $newName = preg_replace('/\.mp4$/', '', $newName) . '-' . $i . '.mp4';
            $dst = dirname($path) . '/' . $newName;
            $i++;
        }

        if (function_exists('set_time_limit')) { @set_time_limit(600); }
        if (function_exists('ini_set')) { @ini_set('memory_limit', '512M'); }

        $escapedSrc = escapeshellarg($path);
        $escapedDst = escapeshellarg($dst);
        // только видео+звук: без timecode/data-дорожек (спеки в кавычках — «?» и «*»
        // в фильтрах для sh спецсимволы, без экранирования команды падают)
        $map = '-map ' . escapeshellarg('0:v:0') . ' -map ' . escapeshellarg('0:a:0?');
        $pad = '-vf ' . escapeshellarg('pad=ceil(iw/2)*2:ceil(ih/2)*2'); // чётные размеры (требование x264/браузеров)

        // [перекодировать?, аргументы ffmpeg, подпись метода]
        $attempts = [
            [false, '-c copy', 'контейнер mov → mp4 (без потери качества)'],
            [false, "$map -c copy", 'контейнер mov → mp4 (без потери качества)'],
            [true,  "$map -c:v libx264 -preset veryfast -crf 26 -pix_fmt yuv420p $pad -c:a aac -b:a 128k", 'перекодировано в H.264'],
            [true,  "$map -an -c:v libx264 -preset veryfast -crf 26 -pix_fmt yuv420p $pad", 'перекодировано в H.264 (без звука)'],
        ];

        $method = null;
        $isRemux = false;
        $lastErr = '';
        foreach ($attempts as [$transcode, $args, $label]) {
            @unlink($dst);
            $cmd = "$bin -y -loglevel error -i $escapedSrc $args -movflags +faststart -f mp4 $escapedDst 2>&1";
            unset($out);
            @exec($cmd, $out, $code);
            $lastErr = self::ffmpegError((array)($out ?? []));
            if ($code !== 0 || !is_file($dst) || @filesize($dst) === 0) {
                @unlink($dst);
                continue;
            }
            if (!$transcode) {
                // Контейнер сменился, но кодек мог остаться неиграбельным
                // для браузеров (ProRes/HEVC ffmpeg кладёт в mp4 молча)
                $codec = self::videoCodec($bin, $dst);
                if ($codec === null || !in_array($codec, self::WEB_SAFE_CODECS, true)) {
                    @unlink($dst);
                    continue;
                }
            }
            $method = $label;
            $isRemux = !$transcode;
            break;
        }

        if ($method === null) {
            $reason = $lastErr !== '' ? ' (ffmpeg: ' . $lastErr . ')' : '';
            return ['converted' => false, 'name' => $name, 'before' => $before, 'after' => $before,
                    'note' => "не удалось перекодировать видео$reason — оставлен исходный файл"];
        }

        $after = @filesize($dst) ?: 0;
        /* Порог роста. Ремуксу разрешаем только контейнерные накладные расходы
           (2% или 128 КБ — у мелких файлов moov/faststart смещают вес на сотни байт).
           Перекодированию mov/m4v разрешаем до +50%: исходный mov браузеры вообще
           НЕ воспроизводят, так что играемый mp4 ценой даже заметно большего
           размера — это выигрыш, а не потеря (лёгкие короткие клипы после
           CRF26 нередко выходят тяжелее сверхлёгкого HEVC-исходника).
           Защита нужна только от патологического раздувания. */
        $overhead = $isRemux ? max($before * 0.02, 128 * 1024) : $before * 0.5;
        if ($before > 0 && $after > $before + $overhead) {
            @unlink($dst);
            return ['converted' => false, 'name' => $name, 'before' => $before, 'after' => $before,
                    'note' => 'mp4 вышел заметно тяжелее оригинала — оставлен исходный файл'];
        }
        @chmod($dst, 0644);
        @unlink($path);

        return [
            'converted' => true,
            'name'      => $newName,
            'before'    => $before,
            'after'     => $after,
            'note'      => sprintf('%s: %s → %s (%s)', $method, $name, $newName, self::fmt($after)),
        ];
    }

    /**
     * Ручное «Сжать» для УЖЕ ГОТОВОГО mp4: перекодирование заново в
     * H.264 veryfast crf26 + AAC 128k + faststart. Файл заменяется
     * ТОЛЬКО если новый вышел хотя бы на 10% меньше (иначе видео
     * считается уже сжатым). Имя файла и URL не меняются — все
     * привязки товаров остаются действительными.
     *
     * @return array{converted:bool, name:string, before:int, after:int, note:string}
     */
    public static function recompressMp4File(string $path): array
    {
        $path = preg_replace('#/+#', '/', (string)$path) ?? $path; // см. optimizeVideoFile
        $name = basename($path);
        $before = @filesize($path) ?: 0;
        $noop = ['converted' => false, 'name' => $name, 'before' => $before, 'after' => $before, 'note' => ''];

        if (!is_file($path)) {
            return ['converted' => false, 'name' => $name, 'before' => $before, 'after' => $before,
                    'note' => 'файл не найден на диске — возможно, он был перемещён, удалён или уже перекодирован'];
        }
        if (strtolower(pathinfo($path, PATHINFO_EXTENSION)) !== 'mp4') return $noop;
        if ($before < 1024 * 1024) {
            return ['converted' => false, 'name' => $name, 'before' => $before, 'after' => $before,
                    'note' => 'файл меньше 1 МБ — сжатие не требуется'];
        }

        $bin = self::ffmpeg();
        if ($bin === null) {
            return ['converted' => false, 'name' => $name, 'before' => $before, 'after' => $before,
                    'note' => 'ffmpeg на сервере недоступен — сжатие невозможно'];
        }

        if (function_exists('set_time_limit')) { @set_time_limit(600); }
        if (function_exists('ini_set')) { @ini_set('memory_limit', '512M'); }

        // Кодируем во временный файл рядом: оригинал не пострадает при сбое,
        // замена — атомарный rename. Каскад из двух попыток: со звуком и без.
        $tmp = dirname($path) . '/.min-tmp-' . bin2hex(random_bytes(4)) . '.mp4';
        $escapedSrc = escapeshellarg($path);
        $escapedTmp = escapeshellarg($tmp);
        $map = '-map ' . escapeshellarg('0:v:0') . ' -map ' . escapeshellarg('0:a:0?');
        $pad = '-vf ' . escapeshellarg('pad=ceil(iw/2)*2:ceil(ih/2)*2');
        $attempts = [
            ["$map -c:v libx264 -preset veryfast -crf 26 -pix_fmt yuv420p $pad -c:a aac -b:a 128k", ''],
            ["$map -an -c:v libx264 -preset veryfast -crf 26 -pix_fmt yuv420p $pad", ' (без звука)'],
        ];

        $lastErr = '';
        $audioNote = '';
        $done = false;
        foreach ($attempts as [$args, $suffix]) {
            @unlink($tmp);
            $cmd = "$bin -y -loglevel error -i $escapedSrc $args -movflags +faststart -f mp4 $escapedTmp 2>&1";
            unset($out);
            @exec($cmd, $out, $code);
            $lastErr = self::ffmpegError((array)($out ?? []));
            if ($code === 0 && is_file($tmp) && @filesize($tmp) > 0) {
                $done = true;
                $audioNote = $suffix;
                break;
            }
            @unlink($tmp);
        }
        if (!$done) {
            $reason = $lastErr !== '' ? ' (ffmpeg: ' . $lastErr . ')' : '';
            return ['converted' => false, 'name' => $name, 'before' => $before, 'after' => $before,
                    'note' => "не удалось перекодировать видео$reason — оставлен исходный файл"];
        }

        $after = @filesize($tmp) ?: 0;
        // Выигрыш меньше 10% — видео уже сжато, замена только ухудшила бы качество
        if ($after > $before * 0.9) {
            @unlink($tmp);
            return ['converted' => false, 'name' => $name, 'before' => $before, 'after' => $before,
                    'note' => 'видео уже хорошо сжато — перекодирование дало бы выигрыш меньше 10%, оставлен исходный файл'];
        }
        if (!@rename($tmp, $path)) {
            @unlink($tmp);
            return $noop;
        }
        @chmod($path, 0644);

        return [
            'converted' => true,
            'name'      => $name,
            'before'    => $before,
            'after'     => $after,
            'note'      => sprintf('%s: перекодировано в H.264%s (%s → %s)', $name, $audioNote, self::fmt($before), self::fmt($after)),
        ];
    }

    /* ─────────────────────────── ВНУТРЕННЕЕ ─────────────────────────── */
    /** Кодек первой видео-дорожки файла (по stderr «ffmpeg -i»); null — не разобрать */
    private static function videoCodec(string $bin, string $file): ?string
    {
        $out = [];
        @exec(escapeshellarg($bin) . ' -hide_banner -i ' . escapeshellarg($file) . ' 2>&1', $out, $code);
        foreach ($out as $line) {
            if (preg_match('/Stream #\d+:\d+.*?: Video: ([a-zA-Z0-9_]+)/', $line, $m)) {
                return strtolower($m[1]);
            }
        }
        return null;
    }

    /** Вытащить корневую причину из вывода ffmpeg (loglevel error):
     *  последняя строка часто лишь обёртка («Conversion failed!»),
     *  настоящая причина — выше. Берём первую содержательную. */
    private static function ffmpegError(array $out): string
    {
        $lines = [];
        foreach ($out as $l) {
            $l = trim(preg_replace('/[\x00-\x1F\x7F]/', '', (string)$l));
            if ($l !== '') $lines[] = $l;
        }
        if ($lines === []) return '';
        if (count($lines) === 1) $pick = $lines[0];
        else {
            $pick = '';
            foreach ($lines as $l) {
                // типовые обёртки-итоги — пропускаем, ищем первопричину
                if (preg_match('/^(Could not write header|Conversion failed|Output file is empty|Stream mapping:)/i', $l)) continue;
                $pick = $l;
                break;
            }
            if ($pick === '') $pick = $lines[0];
        }
        // срезаем техношум «[mov,mp4,m4a,3gp,3g2,mj2 @ 0x5641…]» — оставляем суть
        $pick = preg_replace('/^\[[^\]]*@0x[0-9a-f]+\]\s*/i', '', $pick) ?? $pick;
        return mb_substr($pick, 0, 180);
    }

    /** Найти ffmpeg на сервере; null — если недоступен (exec выключен и т.п.) */
    private static function ffmpeg(): ?string
    {
        if (self::$ffmpegBin === null) {
            self::$ffmpegBin = ['ok' => false];
            if (function_exists('exec')) {
                $candidates = [
                    trim((string)@shell_exec('command -v ffmpeg 2>/dev/null')),
                    '/usr/bin/ffmpeg',
                    '/usr/local/bin/ffmpeg',
                    '/bin/ffmpeg',
                    '/opt/homebrew/bin/ffmpeg',
                ];
                foreach ($candidates as $bin) {
                    if ($bin === '' || !@is_executable($bin)) continue;
                    @exec(escapeshellarg($bin) . ' -version 2>&1', $out, $code);
                    if ($code === 0) {
                        self::$ffmpegBin = ['ok' => $bin];
                        break;
                    }
                }
            }
        }
        $bin = self::$ffmpegBin['ok'] ?? false;
        return is_string($bin) && $bin !== '' ? $bin : null;
    }

    /** Человекочитаемый размер */
    public static function fmt(int $bytes): string
    {
        if ($bytes >= 1024 * 1024) return round($bytes / 1024 / 1024, 1) . ' МБ';
        if ($bytes >= 1024) return round($bytes / 1024) . ' КБ';
        return $bytes . ' Б';
    }
}
