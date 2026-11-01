<?php

/**
 * Системные файлы витрины (Task 118).
 *
 * На эти файлы ссылается КОД витрины (компоненты Next), а не база данных,
 * поэтому сканер «Неиспользуемые файлы» считал их мусором: очистка на
 * рабочем сайте убрала снежинку снегопада (кружки вместо снежинок),
 * логотип шапки и картинки блока «Как мы работаем». Теперь:
 *   1) список защищён: файлы не попадают в отчёт «Неиспользуемые» и
 *      не удаляются ни массовой очисткой, ни точечным удалением;
 *   2) копии едут в архиве обновления (backend/assets/system-uploads/)
 *      и после применения обновления дозаписываются в uploads/, если
 *      файла нет (heal()) — сайт самовосстанавливается.
 *
 * Пополняя список, положите копию файла в backend/assets/system-uploads/
 * с тем же относительным путём.
 */
class SystemFiles
{
    /** Относительные пути внутри uploads/, на которые ссылается код витрины */
    public const REFERRED = [
        'snowflake/snowflake.svg',   // Snowfall.tsx — дефолтная снежинка снегопада
        'brand/logo-lakomka.webp',   // Header.tsx — логотип шапки
        'ico-step1.svg',             // ProcessSteps.tsx — блок «Как мы работаем»
        'ico-step2.svg',
        'ico-step3.svg',
        'process-bg.png',            // ProcessSteps.tsx — фон блока
    ];

    /** Файл витрины, на который ссылается код (rel — путь внутри uploads/) */
    public static function isReferred(string $rel): bool
    {
        return in_array(ltrim(str_replace('\\', '/', $rel), '/'), self::REFERRED, true);
    }

    /** Внутри удаляемой папки есть системный файл витрины? */
    public static function referredInside(string $rel): bool
    {
        $rel = rtrim(ltrim(str_replace('\\', '/', $rel), '/'), '/');
        if ($rel === '') return false;
        foreach (self::REFERRED as $f) {
            if (str_starts_with($f, $rel . '/')) return true;
        }
        return false;
    }

    /**
     * Дописать отсутствующие системные файлы в uploads/ сайта из копий
     * backend/assets/system-uploads. Вызывается после успешного применения
     * обновления; существующие файлы не трогает. Возвращает список
     * восстановленных путей (uploads/…).
     */
    public static function heal(string $siteRoot): array
    {
        $restored = [];
        $assets = $siteRoot . '/backend/assets/system-uploads';
        if (!is_dir($assets)) return $restored;

        $it = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($assets, FilesystemIterator::SKIP_DOTS),
            RecursiveIteratorIterator::LEAVES_ONLY
        );
        foreach ($it as $f) {
            $abs = (string)$f;
            $rel = str_replace('\\', '/', ltrim(substr($abs, strlen($assets)), '/\\'));
            $dst = $siteRoot . '/uploads/' . $rel;
            if (is_file($dst)) continue;
            $dir = dirname($dst);
            if (!is_dir($dir) && !@mkdir($dir, 0755, true)) continue;
            if (@copy($abs, $dst)) {
                @chmod($dst, 0644);
                $restored[] = 'uploads/' . $rel;
            }
        }
        sort($restored);
        return $restored;
    }
}
