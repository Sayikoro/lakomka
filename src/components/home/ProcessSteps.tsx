"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ContactDrawer } from "./ContactDrawer";
import { useT } from "@/components/texts/TextsProvider";
import { SmartImage } from "@/components/ui/SmartImg";

/* Локальные копии белых SVG (красятся в цвет кнопок через CSS mask в StepIcon).
   Заголовки и тексты шагов — из реестра «Текст на страницах» (useT). */
const STEP_ICONS = ["/uploads/ico-step1.svg", "/uploads/ico-step2.svg", "/uploads/ico-step3.svg"];

interface Step {
  n: number;
  icon: string;
  title: string;
  t2: [string, string];
  text: string;
}

/** Заголовок шага в 2 строки для планшета: первое слово / остальное */
function splitTwo(title: string): [string, string] {
  const i = title.indexOf(" ");
  if (i <= 0) return [title, ""];
  return [title.slice(0, i), title.slice(i + 1)];
}

/** Амплитуда параллакса, px. Фон имеет запас ±80px, чтобы не обнажались края */
const PARALLAX_AMP = 64;

/** Иконка шага: белый SVG красится в цвет кнопок через CSS mask */
function StepIcon({ src, className }: { src: string; className?: string }) {
  return (
    <div
      aria-hidden
      className={className}
      style={{
        backgroundColor: "var(--color-primary)",
        WebkitMask: `url("${src}") center / contain no-repeat`,
        mask: `url("${src}") center / contain no-repeat`,
      }}
    />
  );
}

/** Круглый узел таймлайна: белый круг с покрашенной иконкой + бейдж-номер */
function StepNode({ step, size }: { step: Step; size: "md" | "sm" }) {
  const box = size === "md" ? "h-24 w-24" : "h-16 w-16";
  const icon = size === "md" ? "h-12 w-12" : "h-8 w-8";
  const badge = size === "md" ? "h-7 w-7 text-[13px]" : "h-6 w-6 text-[11px]";
  return (
    <div className={`relative shrink-0 rounded-full bg-white shadow-[0_10px_26px_-10px_rgba(0,0,0,0.6)] ${box}`}>
      <div className="flex h-full w-full items-center justify-center">
        <StepIcon src={step.icon} className={icon} />
      </div>
      <span
        className={`absolute -right-1 -top-1 flex items-center justify-center rounded-full border-2 border-white bg-[var(--color-primary)] font-bold text-white ${badge}`}
      >
        {step.n}
      </span>
    </div>
  );
}

export function ProcessSteps() {
  const secRef = useRef<HTMLElement | null>(null);
  const bgRef = useRef<HTMLDivElement | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const t = useT();

  const steps = useMemo<Step[]>(
    () => [
      { n: 1, icon: STEP_ICONS[0], title: t("home_step1_title"), t2: splitTwo(t("home_step1_title")), text: t("home_step1_text") },
      { n: 2, icon: STEP_ICONS[1], title: t("home_step2_title"), t2: splitTwo(t("home_step2_title")), text: t("home_step2_text") },
      { n: 3, icon: STEP_ICONS[2], title: t("home_step3_title"), t2: splitTwo(t("home_step3_title")), text: t("home_step3_text") },
    ],
    [t]
  );

  // Параллакс фона: фон сдвигается по мере прокрутки секции через экран.
  // background-attachment: fixed не работает в iOS Safari, поэтому rAF + transform.
  useEffect(() => {
    const sec = secRef.current;
    const bg = bgRef.current;
    if (!sec || !bg) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    const update = () => {
      raf = 0;
      const r = sec.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      if (r.bottom < -100 || r.top > vh + 100) return; // секция вне экрана
      const progress = (vh - r.top) / (vh + r.height); // 0..1
      const shift = (progress - 0.5) * 2 * PARALLAX_AMP;
      bg.style.transform = `translate3d(0, ${shift.toFixed(1)}px, 0)`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section ref={secRef} className="relative isolate my-6 overflow-hidden">
      {/* Фон-картинка с запасом по вертикали под параллакс-сдвиг */}
      <div
        ref={bgRef}
        aria-hidden
        className="absolute inset-x-0 -top-20 -bottom-20 will-change-transform"
      >
        <SmartImage
          src="/uploads/process-bg.png"
          alt=""
          fill
          sizes="100vw"
          className="object-cover"
          skeletonClassName="bg-[#22314a]"
        />
      </div>

      {/* Оверлей: затемняет картинку под текстом */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/35 to-black/55"
      />

      <div className="relative mx-auto max-w-[1200px] px-4 py-14 sm:px-6 sm:py-16">
        <h2 className="mb-12 text-center text-[24px] font-medium text-white!">
          <span className="inline-block max-w-[92%] rounded-full bg-black/40 px-7 py-2.5 text-center text-[17px] leading-snug uppercase tracking-wide [text-shadow:0_1px_6px_rgba(0,0,0,0.7)] backdrop-blur-[3px] sm:text-[21px] lg:text-[22px]">
            {t("home_process_heading")}
          </span>
        </h2>

        {/* Таймлайн — ПК: горизонтальная линия через узлы, кнопка на линии в конце */}
        <div className="relative hidden lg:block">
          {/* Линия через центры узлов (узел 96px → центр на 48px) */}
          <div
            aria-hidden
            className="absolute left-[10%] right-[10%] top-12 h-[3px] -translate-y-1/2 rounded-full bg-white/50"
          />
          <div className="relative grid grid-cols-4 items-start gap-4">
            {steps.map((s) => (
              <div key={s.n} className="flex flex-col items-center text-center">
                <StepNode step={s} size="md" />
                <h3 className="mt-5 text-[18px] font-semibold text-white! [text-shadow:0_2px_6px_rgba(0,0,0,0.95),0_0_20px_rgba(0,0,0,0.6)]">
                  {s.title}
                </h3>
                <p className="mt-1.5 max-w-[250px] text-[14px] leading-relaxed text-white/90 [text-shadow:0_1px_4px_rgba(0,0,0,0.85)]">
                  {s.text}
                </p>
              </div>
            ))}

            {/* Конец таймлайна — кнопка на линии */}
            <div className="flex flex-col items-center">
              <button
                type="button"
                onClick={() => setContactOpen(true)}
                className="mt-[23px] cursor-pointer rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-7 py-[16px] text-[14px] font-semibold uppercase tracking-wide text-white shadow-[0_10px_26px_-10px_rgba(0,0,0,0.65)] transition hover:bg-[var(--color-primary-hover)]"
              >
                {t("global_contact_button")}
              </button>
              <p className="mt-3 text-[13px] text-white/75">{t("global_contact_reply")}</p>
            </div>
          </div>
        </div>

        {/* Таймлайн — планшет (md…lg): узлы симметрично (1/6, 3/6, 5/6 ширины), заголовки строго в 2 строки,
            текст в блоках по левому краю; вся композиция центрируется (max-w + mx-auto) */}
        <div className="hidden md:block lg:hidden">
          <div className="relative mx-auto max-w-[720px]">
            {/* Линия между центрами крайних узлов: от 1/6 до 5/6 ширины — симметрично */}
            <div
              aria-hidden
              className="absolute left-[16.666%] right-[16.666%] top-12 h-[3px] -translate-y-1/2 rounded-full bg-white/50"
            />
            <div className="relative grid grid-cols-3 items-start">
              {steps.map((s) => (
                <div key={s.n} className="flex flex-col items-center">
                  <StepNode step={s} size="md" />
                  {/* Текстовый блок центрирован под узлом, внутри — выравнивание по левому краю */}
                  <div className="mt-5 w-full max-w-[210px] text-left">
                    <h3 className="text-[17px] font-semibold leading-snug text-white! [text-shadow:0_2px_6px_rgba(0,0,0,0.95),0_0_20px_rgba(0,0,0,0.6)]">
                      {s.t2[0]}
                      <br />
                      {s.t2[1]}
                    </h3>
                    <p className="mt-1.5 text-[14px] leading-relaxed text-white/90 [text-shadow:0_1px_4px_rgba(0,0,0,0.85)]">
                      {s.text}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            {/* Кнопка — в конце таймлайна, по центру */}
            <div className="relative mt-10 flex flex-col items-center">
              <button
                type="button"
                onClick={() => setContactOpen(true)}
                className="cursor-pointer rounded-full bg-[var(--color-primary)] px-10 py-[16px] text-[14px] font-bold uppercase tracking-[0.06em] text-white shadow-[0_14px_32px_-10px_rgba(0,0,0,0.75)] transition hover:bg-[var(--color-primary-hover)] active:scale-95"
              >
                {t("global_contact_button")}
              </button>
              <p className="mt-3 text-[13px] text-white/75">{t("global_contact_reply")}</p>
            </div>
          </div>
        </div>

        {/* Таймлайн — телефон: вертикальная линия слева, кнопка в конце */}
        <div className="relative md:hidden">
          <div
            aria-hidden
            className="absolute bottom-[36px] left-[31px] top-[31px] w-[3px] -translate-x-1/2 rounded-full bg-white/50"
          />
          <div className="relative space-y-8">
            {steps.map((s) => (
              <div key={s.n} className="flex items-start gap-4">
                <StepNode step={s} size="sm" />
                <div className="pt-1">
                  <h3 className="text-[17px] font-semibold text-white! [text-shadow:0_2px_6px_rgba(0,0,0,0.95),0_0_20px_rgba(0,0,0,0.6)]">
                    {s.title}
                  </h3>
                  <p className="mt-1 text-[14px] leading-relaxed text-white/90 [text-shadow:0_1px_4px_rgba(0,0,0,0.85)]">{s.text}</p>
                </div>
              </div>
            ))}
            {/* Конец таймлайна: точка на линии + кнопка */}
            <div className="flex min-h-[72px] items-center gap-4">
              <span
                aria-hidden
                className="ml-[23px] h-4 w-4 shrink-0 rounded-full border-2 border-white bg-[var(--color-primary)] shadow-[0_4px_12px_-4px_rgba(0,0,0,0.6)]"
              />
              <div className="min-w-0">
                <button
                  type="button"
                  onClick={() => setContactOpen(true)}
                  className="cursor-pointer rounded-full bg-[var(--color-primary)] px-8 py-[15px] text-[13px] font-bold uppercase tracking-[0.06em] text-white shadow-[0_14px_30px_-10px_rgba(0,0,0,0.75)] transition hover:bg-[var(--color-primary-hover)] active:scale-95"
              >
                {t("global_contact_button")}
              </button>
                <p className="mt-2 text-[12px] text-white/75">{t("global_contact_reply")}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ContactDrawer open={contactOpen} onClose={() => setContactOpen(false)} />
    </section>
  );
}
