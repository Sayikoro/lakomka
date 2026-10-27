import { mockIcons } from "@/lib/mock-data";

const STEPS = [
  { n: 1, icon: mockIcons.step1, title: "Выберите подарки",   text: "Добавьте наборы в корзину и оформите заказ на сайте." },
  { n: 2, icon: mockIcons.step2, title: "Менеджер свяжется",  text: "В рабочее время подтвердим состав, согласуем оплату и доставку." },
  { n: 3, icon: mockIcons.step3, title: "Получите заказ",     text: "Доставим в согласованное время по Хабаровску или отправим ТК." },
];

export function ProcessSteps() {
  return (
    <section>
      <h2 className="mb-8 text-center text-[24px] font-medium text-[var(--color-heading)]">
        Процесс оформления и обработки заказа
      </h2>
      <div className="grid gap-4 rounded-[var(--radius-card)] bg-[var(--color-bg-soft)] p-[10px] md:grid-cols-3">
        {STEPS.map((s) => (
          <div key={s.n} className="flex flex-col items-center p-4 text-center">
            <img
              src={s.icon}
              alt=""
              width={140}
              height={140}
              loading="lazy"
              className="mb-4 h-[100px] w-[100px] object-contain"
            />
            <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-[var(--radius-btn)] bg-[var(--color-primary)] text-sm font-bold text-white">
              {s.n}
            </div>
            <h3 className="mb-1 text-[18px] font-semibold text-[var(--color-heading)]">
              {s.title}
            </h3>
            <p className="text-[15px] leading-relaxed text-[var(--color-body)]">
              {s.text}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}