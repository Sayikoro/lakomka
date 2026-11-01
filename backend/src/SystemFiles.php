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
     * Каталог uploads сайта для корня $siteRoot: в деплой-пакете uploads
     * лежит прямо в корне, в репозитории/дев-режиме — в public/uploads
     * (см. Paths::publicRoot). heal() вызывается и оттуда, и оттуда,
     * поэтому раскладку определяем по факту, а не по окружению.
     */
    public static function uploadsDir(string $siteRoot): string
    {
        return is_dir($siteRoot . '/public')
            ? $siteRoot . '/public/uploads'
            : $siteRoot . '/uploads';
    }

    /**
     * Самовосстановление при старте API (Task 120): дешёвая проверка — все
     * ли код-референсные файлы витрины на месте. Если да (обычный случай),
     * возвращаем [] без единой копии; если чего-то не хватает — дозаписываем
     * через heal(). Благодаря этому файлы витрины восстанавливаются САМИ
     * при первом же запросе к API после обновления кода — ждать применения
     * пакета обновления не нужно (файлы могли быть утеряны ещё ДО выхода
     * версии с защитой).
     */
    public static function ensureHealed(): array
    {
        $siteRoot = dirname(__DIR__, 2); // backend/src → backend → корень сайта
        $uploads = self::uploadsDir($siteRoot);
        if (!is_dir($uploads)) {
            // uploads ещё не существует — heal() создаст недостающее
            return self::heal($siteRoot);
        }
        foreach (self::REFERRED as $rel) {
            if (!is_file($uploads . '/' . $rel)) {
                return self::heal($siteRoot);
            }
        }
        return []; // все на месте — быстрый путь без копирования
    }

    /**
     * Дописать отсутствующие системные файлы в uploads/ сайта из копий
     * backend/assets/system-uploads. Вызывается после успешного применения
     * обновления и при старте API (ensureHealed); существующие файлы не
     * трогает. Возвращает список восстановленных путей (uploads/…).
     */
    public static function heal(string $siteRoot): array
    {
        $restored = [];
        $assets = $siteRoot . '/backend/assets/system-uploads';
        if (!is_dir($assets)) return $restored;
        $uploads = self::uploadsDir($siteRoot);

        $it = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($assets, FilesystemIterator::SKIP_DOTS),
            RecursiveIteratorIterator::LEAVES_ONLY
        );
        foreach ($it as $f) {
            $abs = (string)$f;
            $rel = str_replace('\\', '/', ltrim(substr($abs, strlen($assets)), '/\\'));
            $dst = $uploads . '/' . $rel;
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
