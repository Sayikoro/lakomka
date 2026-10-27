import Link from "next/link";
import { CopyrightYear } from "./CopyrightYear";
import { IconMax, IconMail, IconWhatsapp } from "./contact-icons";
import { PdfOpenButton, ViewCatalogsButton } from "@/components/pdf/PdfButtons";

/* Ссылки-каналы — те же, что в попапе «Связаться с нами» (ContactDrawer) */
const CHANNELS = [
  {
    label: "МАКС",
    href: "https://max.ru/u/f9LHodD0cOJg4EvnSb7cUdUogKqeA_9T8M_MuCXCPoxDbs7F3d9kBA5Lbuc",
    icon: <IconMax className="h-5 w-5" />,
  },
  {
    label: "Электронная почта",
    href: "mailto:Klakomka2016@mail.ru",
    icon: <IconMail className="h-[22px] w-[22px]" />,
  },
  {
    label: "WhatsApp",
    href: "https://web.whatsapp.com/send/?phone=79141582464",
    icon: <IconWhatsapp className="h-[22px] w-[22px]" />,
  },
];

const linkCls =
  "transition-colors hover:text-[var(--color-primary)] underline-offset-4 hover:underline";

export function Footer() {
  return (
    <footer className="mt-20 bg-[var(--color-bg-soft)] border-t border-[var(--color-border)]">
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-10 px-4 py-12 sm:px-6 md:grid-cols-3 md:gap-8">
        {/* Левая колонка — реквизиты компании */}
        <div className="text-[13px] leading-relaxed text-[var(--color-muted)]">
          <p className="text-[15px] font-semibold text-[var(--color-heading)]">
            ООО Компания «Лакомка», 2015 – <CopyrightYear />
          </p>
          <p className="mt-2">ИНН 2724199105</p>
          <p>ОГРН 1152724000978</p>
          <p className="mt-4">
            Юридический адрес:
            <br />
            680031, Хабаровский край, город Хабаровск, ул. Карла Маркса, д. 186б
          </p>
        </div>

        {/* Центральная колонка — связь и документы */}
        <div className="flex flex-col items-center gap-5 text-center">
          <div className="flex items-center gap-4">
            {CHANNELS.map((c) => (
              <a
                key={c.label}
                href={c.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={c.label}
                title={c.label}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-primary)] text-white shadow-[0_8px_20px_-8px_rgba(27,126,194,0.7)] transition-transform duration-200 hover:scale-90"
              >
                {c.icon}
              </a>
            ))}
          </div>

          <div className="space-y-1 font-semibold text-[var(--color-heading)]">
            <p>
              <a href="tel:+74212789621" className={linkCls}>
                +7 (4212) 78 96 21
              </a>
            </p>
            <p>
              <a href="tel:+79141582464" className={linkCls}>
                +7 914 158 24 64
              </a>
            </p>
          </div>

          <div className="space-y-1 text-[13px] text-[var(--color-muted)]">
            {/* Сертификат соответствия — PDF-вьювер (файл загружается в админке, раздел «PDF») */}
            <p>
              <PdfOpenButton alias="certificate" fallbackTitle="Сертификат соответствия" className={linkCls}>
                Сертификат соответствия
              </PdfOpenButton>
            </p>
            <p>
              <Link href="/privacy" className={linkCls}>
                Политика конфиденциальности
              </Link>
            </p>
          </div>
        </div>

        {/* Правая колонка — каталоги и подпись */}
        <div className="flex flex-col items-start gap-1.5 text-[13px] text-[var(--color-muted)] md:items-end">
          <p>
            {/* Попап с двумя печатными каталогами в PDF-вьювере с перелистыванием */}
            <ViewCatalogsButton className="text-left font-semibold text-[var(--color-heading)] underline-offset-4 hover:text-[var(--color-primary)] hover:underline md:text-right">
              Посмотреть каталоги
            </ViewCatalogsButton>
          </p>
          <p>
            <Link href="/catalogs" className={linkCls}>
              Скачать каталоги
            </Link>
          </p>
          <p className="mt-auto pt-6 text-[13px] text-[var(--color-muted)]">
            Сделано{" "}
            <span className="font-semibold text-[var(--color-heading)]">ShabanOFF Design</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
