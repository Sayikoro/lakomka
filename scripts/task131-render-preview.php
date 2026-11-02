<?php
/* Task 131: визуальный смоук-тест рендера PDF-страницы карточек.
   Запуск: php scripts/task131-render-preview.php → /tmp/t131/page-000.jpg + test.pdf */
declare(strict_types=1);
$ROOT = dirname(__DIR__);
require $ROOT . '/backend/src/Paths.php';
require $ROOT . '/backend/src/ImgPdf.php';
require $ROOT . '/backend/src/Controllers/AdminProductsController.php';

$out = '/tmp/t131';
@mkdir($out, 0777, true);

/* 6 тестовых картинок: разного цвета и пропорций (шутки ради — цветные прямоугольники) */
$imgs = [];
$palette = [[214,69,65],[46,139,87],[59,130,246],[234,179,8],[168,85,247],[236,72,153]];
$dims = [[400,400],[800,500],[500,800],[600,600],[900,400],[400,700]];
foreach ($palette as $i => [$r,$g,$b]) {
    [$w,$h] = $dims[$i];
    $im = imagecreatetruecolor($w,$h);
    imagefill($im,0,0,imagecolorallocate($im,$r,$g,$b));
    imagefilledrectangle($im, 20,20,$w-20,$h-20, imagecolorallocate($im,255,255,255));
    imagejpeg($im, "$out/img-$i.jpg", 90);
    imagedestroy($im);
    $imgs[] = "$out/img-$i.jpg";
}

$cards = [
    ['name'=>'Набор «Чудо-Фиксиков» большой новогодний','price'=>123400,'img'=>$imgs[0]],
    ['name'=>'Подарок Чебурашка','price'=>99999,'img'=>$imgs[1]],
    ['name'=>'Очень-очень-очень длинное название подарка которое точно не влезет в две строки целиком и должно обрезаться с многоточием','price'=>1234567,'img'=>$imgs[2]],
    ['name'=>'Августин с пряниками','price'=>500,'img'=>null],
    ['name'=>'Чемодан Фиксики','price'=>0,'img'=>$imgs[4]],
    ['name'=>'Пакет Ёлка','price'=>249900,'img'=>$imgs[5]],
];

/* рефлексия к private-методам */
$ref = new ReflectionClass(AdminProductsController::class);
[$fonts] = [$ref->getMethod('pdfFonts')];
$fonts->setAccessible(true);
[$fontReg, $fontBold] = $fonts->invoke(null);

$render = $ref->getMethod('renderPdfCardPage');
$render->setAccessible(true);
$render->invoke(null, $cards, $fontReg, $fontBold, "$out/page-000.jpg");

/* вторая страница: одна карточка (проверка сетки при неполном наборе) */
$render->invoke(null, array_slice($cards, 0, 1), $fontReg, $fontBold, "$out/page-001.jpg");

$pdf = ImgPdf::fromJpegs(["$out/page-000.jpg", "$out/page-001.jpg"]);
file_put_contents("$out/test.pdf", $pdf);
echo "pages jpg: " . strlen(file_get_contents("$out/page-000.jpg")) . " b, pdf: " . strlen($pdf) . " b\n";

/* формат цены */
$fmt = $ref->getMethod('formatPdfPrice'); $fmt->setAccessible(true);
foreach ([123400, 99999, 0, 500, 1234567] as $k) echo $k . ' → ' . $fmt->invoke(null, $k) . "\n";

/* перенос текста */
$wrap = $ref->getMethod('wrapPdfText'); $wrap->setAccessible(true);
$lines = $wrap->invoke(null, 'Очень-очень-очень длинное название подарка которое точно не влезет в две строки целиком и должно обрезаться с многоточием', $fontReg, 29, 510, 2);
echo "wrap lines: " . count($lines) . "\n";
foreach ($lines as $l) echo "  |$l|\n";
