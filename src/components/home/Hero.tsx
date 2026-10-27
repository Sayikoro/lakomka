"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";

interface HeroProps {
  /** Основная картинка (используется, когда слайдер выключен или слайдов нет) */
  image: string;
  /** Слайды слайдера (url) */
  slides: string[];
  /** Слайдер включён в настройках */
  slider: boolean;
}

const AUTOPLAY_MS = 5000;

export function Hero({ image, slides, slider }: HeroProps) {
  const list = (slider && slides.length > 1 ? slides : [image]).filter(Boolean);
  const [active, setActive] = useState(0);
  const touchX = useRef<number | null>(null);

  const go = useCallback(
    (i: number) => {
      if (!list.length) return;
      setActive(((i % list.length) + list.length) % list.length);
    },
    [list.length]
  );

  // Автолистание (таймер сбрасывается при каждом переходе)
  useEffect(() => {
    if (list.length < 2) return;
    const t = setInterval(() => {
      setActive((a) => (a + 1) % list.length);
    }, AUTOPLAY_MS);
    return () => clearInterval(t);
  }, [list.length, active]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current === null) return;
    const dx = (e.changedTouches[0]?.clientX ?? 0) - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) < 40) return;
    go(dx < 0 ? active + 1 : active - 1);
  };

  return (
    <section
      className="sticky top-0 z-0 h-[90vh] overflow-hidden text-white supports-[height:1svh]:h-[90svh]"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      aria-label="Новогодняя коллекция 2027"
    >
      {/* Слайды: кроссфейд */}
      {list.map((src, i) => (
        <div
          key={`${src}-${i}`}
          className="absolute inset-0 transition-opacity duration-700 ease-out"
          style={{ opacity: i === active ? 1 : 0 }}
          aria-hidden={i !== active}
        >
          <Image
            src={src}
            alt=""
            fill
            priority={i === 0}
            sizes="100vw"
            className="object-cover"
          />
        </div>
      ))}

      {/* Затемнение: сильнее справа, где текст */}
      <div
        className="absolute inset-0 bg-gradient-to-l from-black/60 via-black/35 to-black/10"
        aria-hidden
      />

      {/* Текст справа */}
      <div className="relative mx-auto flex h-full w-full max-w-[1200px] items-center px-4 py-20">
        <div className="flex flex-col items-end text-right">
          <p className="font-hero text-[42px] uppercase leading-[1.05] tracking-[4.6px] text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.45)] sm:text-[64px] sm:tracking-[6px]">
            новогодняя
          </p>
          <p className="font-hero text-[42px] uppercase leading-[1.05] tracking-[4.6px] text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.45)] sm:text-[64px] sm:tracking-[6px]">
            коллекция
          </p>
          <p className="font-display mt-3 text-[52px] leading-none text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.45)] sm:text-[84px]">
            2027
          </p>
          <Link
            href="/catalog"
            className="mt-10 inline-flex items-center justify-center rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-8 py-[20px] text-[14px] font-semibold uppercase leading-[13px] text-white transition hover:bg-[var(--color-primary-hover)]"
            style={{ border: "2px solid transparent" }}
          >
            Каталог
          </Link>
        </div>
      </div>

      {/* Точки слайдера */}
      {list.length > 1 && (
        <div className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2">
          {list.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Слайд ${i + 1} из ${list.length}`}
              onClick={(e) => {
                e.preventDefault();
                go(i);
              }}
              className={
                "h-1.5 cursor-pointer rounded-full border-0 p-0 outline-none transition-all duration-300 ease-out " +
                (i === active
                  ? "w-7 bg-white/90"
                  : "w-1.5 bg-white/40 hover:bg-white/70")
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}
