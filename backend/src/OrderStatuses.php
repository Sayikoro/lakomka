<?php

/**
 * Task 152: единый источник статусов заказа на бэкенде.
 * Whitelist в AdminOrdersController::updateStatus и labels в exportCsv
 * берутся отсюда; фронтовый источник — src/lib/order-status.ts.
 * Жёсткая гарантия целостности — CHECK в schema.sql (orders.status).
 */
class OrderStatuses
{
    public const ALL = ['new', 'confirmed', 'paid', 'shipped', 'done', 'cancelled'];

    public const LABELS = [
        'new'       => 'Новый',
        'confirmed' => 'Подтверждён',
        'paid'      => 'Оплачен',
        'shipped'   => 'Отправлен',
        'done'      => 'Выполнен',
        'cancelled' => 'Отменён',
    ];
}
