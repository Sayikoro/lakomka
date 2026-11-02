<?php

/**
 * Минимальный генератор PDF из готовых JPEG-страниц (Task 131).
 *
 * Никаких шрифтов внутрь PDF не встраивается: страница приходит
 * готовой растровой картинкой (весь текст уже отрисован GD с
 * кириллическим TTF), поэтому структура файла предельно простая
 * и надёжная:
 *   1            Catalog
 *   2            Pages (kids с шагом 3)
 *   3 + 3k       Page      (MediaBox A4, ссылки на content + image)
 *   4 + 3k       Contents  (q ... cm /Im0 Do Q)
 *   5 + 3k       Image XObject (DCTDecode, DeviceRGB)
 *
 * JPEG кладётся в PDF как есть (без перекодирования) — байты страницы
 * становятся телом stream-объекта, Length считается точно.
 */
class ImgPdf
{
    /** A4 в пунктах PDF (72 dpi): 210×297 мм */
    public const PAGE_W = 595.0;
    public const PAGE_H = 842.0;

    /**
     * Собрать PDF из JPEG-файлов.
     * @param string[] $jpegFiles пути к JPEG (один файл = одна страница, порядок как в массиве)
     * @return string байты PDF-документа
     */
    public static function fromJpegs(array $jpegFiles, float $pageW = self::PAGE_W, float $pageH = self::PAGE_H): string
    {
        $files = [];
        foreach ($jpegFiles as $f) {
            if (is_string($f) && is_file($f) && filesize($f) > 0) {
                $files[] = $f;
            }
        }
        if (!$files) {
            throw new InvalidArgumentException('Нет страниц для PDF');
        }

        $n = count($files);
        $w = rtrim(rtrim(number_format($pageW, 2, '.', ''), '0'), '.');
        $h = rtrim(rtrim(number_format($pageH, 2, '.', ''), '0'), '.');

        $objects = [null]; // индекс с 1
        $objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";

        $kids = [];
        for ($k = 0; $k < $n; $k++) {
            $kids[] = (3 + 3 * $k) . ' 0 R';
        }
        $objects[2] = "<< /Type /Pages /Kids [" . implode(' ', $kids) . "] /Count $n >>";

        for ($k = 0; $k < $n; $k++) {
            $pageObj = 3 + 3 * $k;
            $contentObj = $pageObj + 1;
            $imgObj = $pageObj + 2;

            $imgBytes = (string)file_get_contents($files[$k]);
            $size = getimagesize($files[$k]);
            $iw = (int)($size[0] ?? 1);
            $ih = (int)($size[1] ?? 1);

            $objects[$pageObj] = "<< /Type /Page /Parent 2 0 R "
                . "/MediaBox [0 0 $w $h] "
                . "/Resources << /XObject << /Im0 $imgObj 0 R >> >> "
                . "/Contents $contentObj 0 R >>";

            $content = "q $w 0 0 $h 0 0 cm /Im0 Do Q";
            $objects[$contentObj] = "<< /Length " . strlen($content) . " >>\nstream\n$content\nendstream";

            $objects[$imgObj] = "<< /Type /XObject /Subtype /Image "
                . "/Width $iw /Height $ih "
                . "/ColorSpace /DeviceRGB /BitsPerComponent 8 "
                . "/Filter /DCTDecode /Length " . strlen($imgBytes) . " >>\nstream\n"
                . $imgBytes . "\nendstream";
        }

        // Сериализация с точными смещениями xref.
        $pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
        $offsets = [];
        $count = 2 + 3 * $n;
        for ($i = 1; $i <= $count; $i++) {
            $offsets[$i] = strlen($pdf);
            $pdf .= "$i 0 obj\n" . $objects[$i] . "\nendobj\n";
        }

        $xrefPos = strlen($pdf);
        $pdf .= "xref\n0 " . ($count + 1) . "\n";
        $pdf .= "0000000000 65535 f \n";
        for ($i = 1; $i <= $count; $i++) {
            $pdf .= sprintf("%010d 00000 n \n", $offsets[$i]);
        }
        $pdf .= "trailer\n<< /Size " . ($count + 1) . " /Root 1 0 R >>\nstartxref\n$xrefPos\n%%EOF\n";

        return $pdf;
    }
}
