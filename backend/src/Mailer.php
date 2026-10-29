<?php

require_once __DIR__ . '/../lib/PHPMailer/Exception.php';
require_once __DIR__ . '/../lib/PHPMailer/PHPMailer.php';
require_once __DIR__ . '/../lib/PHPMailer/SMTP.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception as MailException;

class Mailer
{
    private array $settings;
    private string $driver;

    /** Ошибка последней попытки отправки SMTP (для честного отчёта в админке) */
    public string $lastError = '';

    public function __construct()
    {
        $pdo = Database::get();
        $rows = $pdo->query('SELECT key, value FROM settings')->fetchAll();
        $this->settings = [];
        foreach ($rows as $r) {
            $this->settings[$r['key']] = $r['value'];
        }
        $this->driver = $this->settings['mail_driver'] ?? 'log';
    }

    private function setting(string $key, string $default = ''): string
    {
        $v = $this->settings[$key] ?? '';
        return $v !== '' ? $v : $default;
    }

    /* ============================================================
       ПИСЬМА О ЗАКАЗЕ (создание)
       ============================================================ */
    public function sendOrderToCustomer(array $order, array $items, ?string $email): bool
    {
        if (!$email) return true; // некуда слать — не считаем ошибкой
        $subject = "Заказ {$order['order_number']} — Лакомка";
        $html = $this->renderOrderHtml($order, $items, false);
        return $this->send($email, $order['customer_name'], $subject, $html);
    }

    public function sendOrderToAdmin(array $order, array $items): bool
    {
        $email = $this->setting('admin_email');
        if ($email === '') return true;
        $subject = "Новый заказ {$order['order_number']} — {$this->fmtPrice($order['total_kopecks'])}";
        $html = $this->renderOrderHtml($order, $items, true);
        return $this->send($email, 'Администратор', $subject, $html);
    }

    /* ============================================================
       ПИСЬМО О СМЕНЕ СТАТУСА
       Шлём только для confirmed / shipped / cancelled.
       Для new / paid / done — молчим.
       ============================================================ */
    public function sendOrderStatusChanged(
        array $order,
        string $newStatus,
        ?string $email
    ): void {
        if (!$email) return;

        // Какие статусы клиенту не сообщаем
        $silent = ['new', 'paid', 'done'];
        if (in_array($newStatus, $silent, true)) return;

        $labels = [
            'confirmed' => [
                'subject' => "Ваш заказ {$order['order_number']} подтверждён",
                'greeting' => 'Заказ подтверждён',
                'body' => 'Менеджер подтвердил ваш заказ. Мы свяжемся с вами для согласования доставки.',
            ],
            'shipped' => [
                'subject' => "Заказ {$order['order_number']} отправлен",
                'greeting' => 'Заказ в пути',
                'body' => 'Ваш заказ отправлен. Ожидайте звонка от курьера или уведомления от транспортной компании.',
            ],
            'cancelled' => [
                'subject' => "Заказ {$order['order_number']} отменён",
                'greeting' => 'Заказ отменён',
                'body' => 'К сожалению, ваш заказ был отменён. Если это ошибка — свяжитесь с нами по телефону.',
            ],
        ];

        if (!isset($labels[$newStatus])) return;

        $label = $labels[$newStatus];
        $html = $this->renderStatusHtml($order, $label['greeting'], $label['body']);
        $this->send($email, $order['customer_name'], $label['subject'], $html);
    }

    /* ============================================================
       ОТПРАВКА
       ============================================================ */
    /** true — письмо ушло (или записано в log-драйвер); false — SMTP-ошибка (текст в lastError) */
    private function send(string $toEmail, string $toName, string $subject, string $html): bool
    {
        if ($this->driver === 'log') {
            $this->logMail($toEmail, $subject, $html);
            return true;
        }

        $mail = new PHPMailer(true);
        try {
            $mail->isSMTP();
            $mail->Host       = $this->setting('smtp_host');
            $mail->Port       = (int)$this->setting('smtp_port', '587');
            $mail->SMTPAuth   = true;
            $mail->Username   = $this->setting('smtp_user');
            $mail->Password   = $this->setting('smtp_pass');
            $secure = $this->setting('smtp_secure');
            if ($secure !== '') $mail->SMTPSecure = $secure;
            $mail->CharSet = 'UTF-8';

            $mail->setFrom(
                $this->setting('from_email'),
                $this->setting('from_name', 'Лакомка')
            );
            $mail->addAddress($toEmail, $toName);

            $mail->isHTML(true);
            $mail->Subject = $subject;
            $mail->Body    = $html;
            $mail->AltBody = strip_tags($html);

            $mail->send();
            return true;
        } catch (MailException $e) {
            // Заказы не должны падать из-за почты: ошибку запоминаем и пишем в лог сервера,
            // статус «не отправлено» фиксируется в orders.email_sent вызывающим кодом
            $this->lastError = $mail->ErrorInfo;
            error_log('[mail] failed to ' . $toEmail . ': ' . $this->lastError);
            return false;
        }
    }

    private function logMail(string $toEmail, string $subject, string $html): void
    {
        $logFile = __DIR__ . '/../storage/mail.log';
        $entry =
            "================ " . date('c') . " ================\n" .
            "TO: $toEmail\n" .
            "SUBJECT: $subject\n" .
            "------\n" .
            $html . "\n\n";
        @file_put_contents($logFile, $entry, FILE_APPEND);
    }

    /* ============================================================
       ШАБЛОНЫ
       ============================================================ */
    private function renderStatusHtml(array $o, string $greeting, string $body): string
    {
        $siteUrl = rtrim($this->setting('site_url', 'http://localhost:3000'), '/');
        $name = htmlspecialchars($o['customer_name']);

        return <<<HTML
<!DOCTYPE html>
<html lang="ru">
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#3a3a3a;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <div style="background:#fff;border-radius:20px;padding:24px;">
      <h1 style="margin:0 0 8px;font-size:20px;color:#3a3a3a;">$greeting</h1>
      <p style="margin:0 0 20px;color:#666;">$name, $body</p>

      <p style="margin:0 0 8px;"><strong>Номер заказа:</strong> {$o['order_number']}</p>
      <p style="margin:0 0 8px;"><strong>Сумма:</strong> {$this->fmtPrice($o['total_kopecks'])}</p>

      <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">

      <p style="margin:0;font-size:13px;color:#999;">
        Сайт: <a href="$siteUrl" style="color:#0274be;">$siteUrl</a><br>
        Компания «Лакомка» · +7 (4212) 78 96 21
      </p>
    </div>
  </div>
</body>
</html>
HTML;
    }

    private function renderOrderHtml(array $o, array $items, bool $forAdmin): string
    {
        $siteUrl = rtrim($this->setting('site_url', 'http://localhost:3000'), '/');

        $deliveryLabels = [
            'pickup' => 'Самовывоз',
            'city'   => 'Доставка по Хабаровску',
            'region' => 'Доставка за городом',
            'tk'     => 'Отправка ТК',
        ];
        $delivery = $deliveryLabels[$o['delivery_method']] ?? $o['delivery_method'];

        $rows = '';
        foreach ($items as $it) {
            $sum = $it['price_kopecks'] * $it['qty'];
            $rows .= '<tr>'
                . '<td style="padding:8px 0;border-bottom:1px solid #eee;">' . htmlspecialchars($it['product_name']) . '</td>'
                . '<td style="padding:8px 0;border-bottom:1px solid #eee;text-align:center;white-space:nowrap;">' . $it['qty'] . '</td>'
                . '<td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap;">' . $this->fmtPrice($sum) . '</td>'
                . '</tr>';
        }

        $greeting = $forAdmin ? 'Новый заказ' : 'Спасибо за заказ, ' . htmlspecialchars($o['customer_name']) . '!';
        $intro = $forAdmin
            ? 'Поступил новый заказ с сайта.'
            : 'Ваш заказ принят. Менеджер свяжется с вами в рабочее время для подтверждения.';

        $addressRow = '';
        if (!empty($o['address'])) {
            $addressRow = '<p style="margin:4px 0;"><strong>Адрес:</strong> ' . htmlspecialchars($o['address']) . '</p>';
        }

        $commentRow = '';
        if (!empty($o['comment'])) {
            $commentRow = '<p style="margin:4px 0;"><strong>Комментарий:</strong> ' . htmlspecialchars($o['comment']) . '</p>';
        }

        return <<<HTML
<!DOCTYPE html>
<html lang="ru">
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#3a3a3a;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <div style="background:#fff;border-radius:20px;padding:24px;">
      <h1 style="margin:0 0 8px;font-size:20px;color:#3a3a3a;">$greeting</h1>
      <p style="margin:0 0 20px;color:#666;">$intro</p>

      <p style="margin:0 0 8px;"><strong>Номер заказа:</strong> {$o['order_number']}</p>
      <p style="margin:0 0 8px;"><strong>Сумма:</strong> {$this->fmtPrice($o['total_kopecks'])}</p>

      <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">

      <p style="margin:4px 0;"><strong>Имя:</strong> {$o['customer_name']}</p>
      <p style="margin:4px 0;"><strong>Телефон:</strong> {$o['customer_phone']}</p>
      <p style="margin:4px 0;"><strong>Способ доставки:</strong> $delivery</p>
      $addressRow
      $commentRow

      <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">

      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr style="color:#888;font-size:12px;text-transform:uppercase;">
            <th style="text-align:left;padding-bottom:6px;">Товар</th>
            <th style="text-align:center;padding-bottom:6px;">Кол-во</th>
            <th style="text-align:right;padding-bottom:6px;">Сумма</th>
          </tr>
        </thead>
        <tbody>$rows</tbody>
      </table>

      <p style="margin:20px 0 0;font-size:18px;font-weight:600;text-align:right;">
        Итого: {$this->fmtPrice($o['total_kopecks'])}
      </p>

      <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">

      <p style="margin:0 0 8px;font-size:13px;color:#999;">
        Сайт: <a href="$siteUrl" style="color:#0274be;">$siteUrl</a>
      </p>
      <p style="margin:0;font-size:13px;color:#999;">
        Компания «Лакомка» · +7 (4212) 78 96 21
      </p>
    </div>
  </div>
</body>
</html>
HTML;
    }

    private function fmtPrice(int $kopecks): string
    {
        return number_format($kopecks / 100, 0, ',', ' ') . ' ₽';
    }
}