"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Snowfall } from "./Snowfall";
import { useT } from "@/components/texts/TextsProvider";
import type { SnowSettings } from "@/lib/settings";
import { DEFAULT_FRONT_SETTINGS } from "@/lib/settings";
import { DEFAULT_SNOW_SETTINGS, parseSnowConfig } from "@/lib/snow";
import { SmartImage } from "@/components/ui/SmartImg";

interface HeroProps {
  /** Основная картинка (используется, когда слайдер выключен или слайдов нет) */
  image: string;
  /** Слайды слайдера (url) */
  slides: string[];
  /** Слайдер включён в настройках */
  slider: boolean;
  /** Снегопад в Hero-блоке (настройки из админки, запечённые при рендере) */
  snow?: SnowSettings;
}

const AUTOPLAY_MS = 5000;

export function Hero({ image, slides, slider, snow }: HeroProps) {
  const t = useT();
  const [active, setActive] = useState(0);
  const touchX = useRef<number | null>(null);

  /* Живые настройки витрины: при статическом деплое hero (картинка/слайды/
     слайдер) и снег ЗАПЕКАЮТСЯ в HTML при сборке. После монтирования
     подтягиваем свежий конфиг с /api/settings/public: загрузили картинку
     hero в админке → обновили главную (F5) → картинка на месте, пересборка
     сайта не нужна. */
  const [heroLive, setHeroLive] = useState<{
    image: string;
    slides: string[];
    slider: boolean;
  } | null>(null);

  /* Снегопад: серверный конфиг может быть запечён при сборке (статический
     деплой) — после монтирования подтягиваем свежие настройки с API, чтобы
     включение снега в админке работало без пересборки сайта. */
  const [snowLive, setSnowLive] = useState<SnowSettings>(snow ?? DEFAULT_SNOW_SETTINGS);
  useEffect(() => {
    setSnowLive(snow ?? DEFAULT_SNOW_SETTINGS); // проп изменился (навигация) — сброс
    setHeroLive(null);
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api";
    let cancelled = false;
    fetch(`${apiUrl}/settings/public`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled || !json?.data) return;
        if (json.data.snow) {
          setSnowLive(parseSnowConfig(json.data.snow));
        }
        const d = json.data;
        setHeroLive({
          image: typeof d.hero_image === "string" ? d.hero_image : "",
          slides: Array.isArray(d.hero_slides)
            ? (d.hero_slides as Array<{ url?: string } | string>)
                .map((s) => (typeof s === "string" ? s : (s?.url ?? "")))
                .filter((u: string) => !!u)
            : [],
          slider: Boolean(d.hero_slider_enabled),
        });
      })
      .catch(() => {
        /* сеть недоступна — остаются запечённые конфиги */
      });
    return () => {
      cancelled = true;
    };
  }, [snow, image, slides, slider]);

  /* Эффективный hero: пока API не ответил — запечённые пропсы;
     после — живые значения (пустая картинка = дефолтная). */
  const effImage = heroLive
    ? heroLive.image || DEFAULT_FRONT_SETTINGS.hero_image
    : image;
  const effSlides = heroLive ? heroLive.slides : slides;
  const effSlider = heroLive ? heroLive.slider : slider;
  const list = (effSlider && effSlides.length > 1 ? effSlides : [effImage]).filter(Boolean);

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
          <SmartImage
            src={src}
            alt=""
            fill
            priority={i === 0}
            sizes="100vw"
            className="object-cover"
            skeletonClassName="bg-[#1d2430]"
          />
        </div>
      ))}

      {/* Затемнение: ровное + винтетки сверху и снизу (текст теперь по центру) */}
      <div
        className="absolute inset-0 bg-black/20"
        aria-hidden
      />
      <div
        className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/45"
        aria-hidden
      />

      {/* Текст сверху по центру (отступ 10vh — чтобы нижний край не залезал на овечку) */}
      <div className="relative mx-auto flex h-full w-full max-w-[1200px] flex-col items-center px-4 pt-[10vh] text-center supports-[height:1svh]:pt-[10svh]">
        <p className="font-hero text-[min(8.6vw,42px)] uppercase leading-[1.05] tracking-[0.11em] text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.45)] sm:text-[64px] sm:tracking-[6px]">
          {t("home_hero_line1")}
        </p>
        <p className="font-hero text-[min(8.6vw,42px)] uppercase leading-[1.05] tracking-[0.11em] text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.45)] sm:text-[64px] sm:tracking-[6px]">
          {t("home_hero_line2")}
        </p>
        <p className="font-display mt-3 text-[min(11vw,52px)] leading-none text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.45)] sm:text-[84px]">
          {t("home_hero_line3")}
        </p>
      </div>

      {/* Кнопка внизу по центру (над точками слайдера) */}
      <Link
        href="/catalog"
        className="absolute bottom-16 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-8 py-[20px] text-[14px] font-semibold uppercase leading-[13px] text-white transition hover:bg-[var(--color-primary-hover)] sm:bottom-20"
        style={{ border: "2px solid transparent" }}
      >
        {t("home_hero_button")}
      </Link>

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

      {/* Снегопад — только внутри Hero-блока (canvas обрезается overflow-hidden).
          Идёт последним: рисуется поверх текста, но под кнопкой и точками (z-10).
          Конфиг — живой (snowLive): на статическом сайте подтягивается с API. */}
      {snowLive.enabled && (
        <Snowfall
          count={snowLive.count}
          countMobile={snowLive.count_mobile}
          speed={snowLive.speed}
          size={snowLive.size}
          color={snowLive.color}
          flake={snowLive.flake}
        />
      )}
    </section>
  );
}
