import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Политика конфиденциальности",
  description:
    "Как ООО Компания «Лакомка» собирает, использует и защищает персональные данные покупателей.",
  robots: { index: true, follow: true },
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-[900px] px-4 py-10">
      <nav className="mb-6 text-sm text-[var(--color-muted)]">
        <Link href="/" className="hover:text-[var(--color-primary)]">
          Главная
        </Link>
        <span className="mx-2">/</span>
        <span className="text-[var(--color-heading)]">Политика конфиденциальности</span>
      </nav>

      <article className="rounded-[var(--radius-card)] bg-white p-8 prose-sm">
        <h1 className="mb-2 text-[32px] font-medium text-[var(--color-heading)]">
          Политика конфиденциальности
        </h1>
        <p className="mb-8 text-sm text-[var(--color-muted)]">
          Действует с 1 января 2026 года
        </p>

        <div className="space-y-6 text-sm leading-relaxed text-[var(--color-body)]">
          <section>
            <h2 className="mb-3 text-lg font-semibold text-[var(--color-heading)]">
              1. Общие положения
            </h2>
            <p>
              Настоящая политика определяет порядок обработки и защиты персональных данных
              покупателей интернет-магазина «{SITE.name}» (далее — Магазин), расположенного
              по адресу <a href={SITE.url} className="text-[var(--color-primary)] underline">{SITE.url}</a>.
            </p>
            <p className="mt-3">
              Оператор персональных данных: {SITE.legalName}, ИНН {SITE.inn},
              адрес: {SITE.address.postalCode}, {SITE.address.region}, {SITE.address.city},{" "}
              {SITE.address.street}.
            </p>
            <p className="mt-3">
              Используя сайт и оформляя заказ, вы соглашаетесь с условиями настоящей
              политики и даёте согласие на обработку персональных данных в объёме,
              необходимом для исполнения заказа.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-[var(--color-heading)]">
              2. Какие данные мы собираем
            </h2>
            <p>При оформлении заказа мы запрашиваем:</p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>имя (для обращения и оформления доставки);</li>
              <li>номер телефона (для связи по заказу);</li>
              <li>email — по желанию (для отправки копии заказа);</li>
              <li>адрес доставки — если выбрана доставка курьером или ТК;</li>
              <li>комментарий к заказу — по желанию.</li>
            </ul>
            <p className="mt-3">
              Автоматически собираются технические данные: IP-адрес, тип браузера,
              время посещения. Они нужны для защиты от мошенничества и анализа работы сайта.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-[var(--color-heading)]">
              3. Зачем мы обрабатываем данные
            </h2>
            <ul className="list-disc space-y-1 pl-6">
              <li>связаться с вами по вопросам заказа — подтверждение, уточнение, доставка;</li>
              <li>передать заказ в службу доставки или транспортную компанию;</li>
              <li>отправить письмо с номером и составом заказа;</li>
              <li>исполнять требования законодательства (например, при возврате).</li>
            </ul>
            <p className="mt-3">
              Мы <b>не</b> используем ваши данные для рекламных рассылок без отдельного
              согласия, не передаём их третьим лицам, кроме службы доставки.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-[var(--color-heading)]">
              4. Как мы защищаем данные
            </h2>
            <p>
              Персональные данные покупателей хранятся в зашифрованном виде
              (шифр AES-256-GCM). Ключ шифрования хранится отдельно от базы данных
              и не передаётся третьим лицам. Доступ к расшифрованным данным имеют только
              уполномоченные сотрудники Магазина.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-[var(--color-heading)]">
              5. Cookies
            </h2>
            <p>
              Сайт использует только технически необходимые cookies:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>
                <b>lakomka-cart</b> — содержимое корзины (хранится в localStorage браузера);
              </li>
              <li>
                <b>lakomka-cookie-consent</b> — отметка о согласии с этой политикой;
              </li>
              <li>
                <b>admin_token</b> — сессия администратора (только для сотрудников).
              </li>
            </ul>
            <p className="mt-3">
              Аналитических и рекламных cookies мы не используем. Сторонних счётчиков
              (Google Analytics, Яндекс.Метрика, VK Pixel) на сайте нет.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-[var(--color-heading)]">
              6. Ваши права
            </h2>
            <p>Вы вправе в любой момент:</p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>запросить копию своих персональных данных;</li>
              <li>потребовать исправления неточных данных;</li>
              <li>потребовать удаления данных (если нет законных оснований для их хранения);</li>
              <li>отозвать согласие на обработку.</li>
            </ul>
            <p className="mt-3">
              Для этого напишите на{" "}
              <a href={`mailto:${SITE.email}`} className="text-[var(--color-primary)] underline">
                {SITE.email}
              </a>{" "}
              или позвоните по телефону {SITE.phone}. Мы отвечаем в течение 10 рабочих дней.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-[var(--color-heading)]">
              7. Сроки хранения
            </h2>
            <p>
              Данные о заказах храним 3 года — на случай обращения по гарантии или возврату.
              По истечении этого срока заказы удаляются. Cookies корзины удаляются
              автоматически через 30 дней или при очистке браузера.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-[var(--color-heading)]">
              8. Изменения политики
            </h2>
            <p>
              Мы можем обновлять эту политику. Дата последнего изменения указана вверху
              страницы. При существенных изменениях предупредим на главной странице.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-[var(--color-heading)]">
              9. Контакты
            </h2>
            <p>
              {SITE.legalName}<br />
              ИНН {SITE.inn}<br />
              Адрес: {SITE.address.postalCode}, {SITE.address.region}, {SITE.address.city},{" "}
              {SITE.address.street}<br />
              Телефон: {SITE.phone}<br />
              Email:{" "}
              <a href={`mailto:${SITE.email}`} className="text-[var(--color-primary)] underline">
                {SITE.email}
              </a>
            </p>
          </section>
        </div>
      </article>
    </div>
  );
}