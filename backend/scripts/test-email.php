<?php
require __DIR__ . '/../src/Database.php';
require __DIR__ . '/../src/Mailer.php';

$to = $argv[1] ?? 'test@example.com';

$mailer = new Mailer();
$order = [
    'order_number'    => 'ЛК-ТЕСТ-0001',
    'customer_name'   => 'Иван Тестов',
    'customer_phone'  => '+7 (999) 000-00-00',
    'delivery_method' => 'city',
    'address'         => 'ул. Ленина, 1, кв. 5',
    'comment'         => 'Позвонить за час',
    'total_kopecks'   => 296000,
];
$items = [
    ['product_name' => 'ВЕСЁЛЫЕ ГОРКИ', 'qty' => 1, 'price_kopecks' => 103000],
    ['product_name' => 'ВОЛШЕБНОЕ ПУТЕШЕСТВИЕ', 'qty' => 2, 'price_kopecks' => 96500],
];

$mailer->sendOrderToCustomer($order, $items, $to);
$mailer->sendOrderToAdmin($order, $items);

echo "OK test-message obrabotan\n";
