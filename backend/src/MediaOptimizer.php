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

    /**
     * mov/m4v → mp4. Сначала пробуем БЕСПЛАТНУЮ пересборку контейнера
     * (-c copy, мгновенно и без потери качества); если внутри кодек,
     * несовместимый с mp4 (HEVC, ProRes и т.п.) — перекодируем в H.264.
     * mp4/webm не трогаем. Без ffmpeg на сервере файл остаётся как есть.
     *
     * @return array{converted:bool, name:string, before:int, after:int, note:string}
     */
    public static function optimizeVideoFile(string $path): array
    {
        $name = basename($path);
        $before = @filesize($path) ?: 0;
        $noop = ['converted' => false, 'name' => $name, 'before' => $before, 'after' => $before, 'note' => ''];

        if (!is_file($path)) return $noop;
        $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
        if (!in_array($ext, ['mov', 'm4v'], true)) return $noop; // mp4/webm уже хороши

        $bin = self::ffmpeg();
        if ($bin === null) {
            return ['converted' => false, 'name' => $name, 'before' => $before, 'after' => $before,
                    'note' => 'ffmpeg на сервере недоступен — видео оставлено в исходном формате'];
        }

        $newName = preg_replace('/\.(mov|m4v)$/i', '', $name) . '.mp4';
        $dst = dirname($path) . '/' . $newName;
        $i = 1;
        while (is_file($dst) && $i < 1000) {
            $newName = preg_replace('/\.mp4$/', '', $newName) . '-' . $i . '.mp4';
            $dst = dirname($path) . '/' . $newName;
            $i++;
        }

        if (function_exists('set_time_limit')) { @set_time_limit(300); }
        if (function_exists('ini_set')) { @ini_set('memory_limit', '512M'); }

        $escapedSrc = escapeshellarg($path);
        $escapedDst = escapeshellarg($dst);

        // Шаг 1: быстрая пересборка контейнера (h264/aac внутри mov → mp4 без перекодирования)
        $cmd = "$bin -y -loglevel error -i $escapedSrc -c copy -movflags +faststart -f mp4 $escapedDst 2>&1";
        @exec($cmd, $out1, $code1);
        if ($code1 !== 0 || !is_file($dst) || @filesize($dst) === 0) {
            @unlink($dst);
            // Шаг 2: перекодирование (HEVC/ProRes/редкие кодеки → H.264/AAC, все браузеры)
            $cmd = "$bin -y -loglevel error -i $escapedSrc"
                 . " -c:v libx264 -preset veryfast -crf 26 -pix_fmt yuv420p"
                 . " -c:a aac -b:a 128k -movflags +faststart -f mp4 $escapedDst 2>&1";
            @exec($cmd, $out2, $code2);
            if ($code2 !== 0 || !is_file($dst) || @filesize($dst) === 0) {
                @unlink($dst);
                return ['converted' => false, 'name' => $name, 'before' => $before, 'after' => $before,
                        'note' => 'не удалось перекодировать видео — оставлен исходный файл'];
            }
            $method = 'перекодировано в H.264';
        } else {
            $method = 'контейнер mov → mp4 (без потери качества)';
        }

        $after = @filesize($dst) ?: 0;
        // Если «сжатие» неожиданно сильно раздуло файл (редко) — оставляем оригинал
        if ($before > 0 && $after > $before) {
            @unlink($dst);
            return ['converted' => false, 'name' => $name, 'before' => $before, 'after' => $before,
                    'note' => 'mp4 вышел тяжелее оригинала — оставлен исходный файл'];
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

    /* ─────────────────────────── ВНУТРЕННЕЕ ─────────────────────────── */

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
