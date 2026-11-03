"use client";

/**
 * Картинки с прелоадером: пока картинка грузится, на её месте —
 * скелетон с бегущим бликом (.img-skeleton в globals.css).
 * После загрузки картинка плавно проявляется (opacity-переход).
 *
 *   <SmartImage … />  — обёртка next/image (fill/width/height);
 *                        родитель должен быть position:relative и т.п.
 *   <SmartImg … />    — обёртка обычного <img>; рисует свой
 *                        positioned-контейнер (wrapperClassName).
 *
 * Важно: картинки из кеша браузера могут «загрузиться» ДО монтирования
 * React — событие onLoad тогда не придёт никогда. Поэтому после
 * монтирования проверяем img.complete: если картинка уже готова,
 * скелетон убираем сразу.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Image, { type ImageProps } from "next/image";

/* Task 116: самовосстановление битых картинок. Если файл по ссылке
 * отсутствует (404 — например, после массовой оптимизации база смотрит
 * на .webp, которого на сервере нет, а исходный jpg лежит рядом),
 * пробуем ту же папку, то же имя, другие расширения, пока что-то не
 * откроется. Работает ТОЛЬКО для /uploads/**, максимум по одному разу
 * на каждый вариант. */
const IMG_FALLBACK_EXTS = ["webp", "jpg", "jpeg", "png"] as const;

function nextFallbackSrc(src: string, tried: string[]): string | null {
  const clean = src.split("?")[0];
  const m = /^(\/uploads\/.+\/)([^/]+)\.(webp|jpe?g|png)$/i.exec(clean);
  if (!m) return null;
  const dir = m[1];
  const stem = m[2];
  const ext = m[3].toLowerCase();
  for (const e of IMG_FALLBACK_EXTS) {
    if (e === ext) continue;
    const cand = `${dir}${stem}.${e}`;
    if (!tried.includes(cand)) return cand;
  }
  return null;
}

type SmartImageProps = Omit<ImageProps, "onLoad" | "onError"> & {
  /** Доп. классы на скелетоне (например скругление) */
  skeletonClassName?: string;
  onLoad?: () => void;
  /** LCP-картинка: без скелетона и с opacity-100 уже в SSR-разметке —
   * браузер рисует её, как только пришли байты, не дожидаясь
   * гидратации (иначе на мобиле LCP откладывается на секунды). */
  startVisible?: boolean;
};

export function SmartImage({
  skeletonClassName = "",
  onLoad,
  className,
  startVisible = false,
  ...rest
}: SmartImageProps) {
  const [loaded, setLoaded] = useState(startVisible);
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  /* Task 116: текущий src может заменяться на сиблинга с другим
     расширением, если основной файл 404 */
  const [curSrc, setCurSrc] = useState(rest.src);
  const [tried, setTried] = useState<string[]>([]);
  const [prevPropSrc, setPrevPropSrc] = useState(rest.src);
  /* Проп src сменился (карусель/новый товар) — сбрасываем фолбэк-цепочку.
     Официальный паттерн React «adjusting state when a prop changes». */
  if (prevPropSrc !== rest.src) {
    setPrevPropSrc(rest.src);
    setCurSrc(rest.src);
    setTried([]);
  }

  const handleLoad = useCallback(() => {
    setLoaded(true);
    onLoad?.();
  }, [onLoad]);

  const handleError = useCallback(() => {
    const cand = nextFallbackSrc(String(curSrc), tried);
    if (cand) {
      setTried([...tried, cand]);
      setFailed(false);
      setLoaded(false);
      setCurSrc(cand);
      return;
    }
    setFailed(true);
  }, [curSrc, tried]);

  /* Картинка могла догрузиться до гидратации: и успех из кеша (onLoad не
     придёт), и ОШИБКА из кеша (onError не придёт — например, файл 404,
     а React ещё не навесил обработчики). Оба случая добираем вручную. */
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) {
      handleError();
      return;
    }
    if (img && img.complete && img.naturalWidth > 0) {
      setLoaded(true);
      onLoad?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {!loaded && !failed && (
        <span
          aria-hidden
          className={`img-skeleton pointer-events-none absolute inset-0 z-10 block ${skeletonClassName}`}
        />
      )}
      <Image
        {...rest}
        src={curSrc}
        ref={imgRef}
        onLoad={handleLoad}
        onError={handleError}
        className={`${className ?? ""} transition-opacity duration-500 ease-out ${
          loaded || failed ? "opacity-100" : "opacity-0"
        }`}
      />
    </>
  );
}

type SmartImgProps = Omit<
  React.ImgHTMLAttributes<HTMLImageElement>,
  "onLoad" | "onError"
> & {
  src: string;
  alt: string;
  /** Классы позиционируемой обёртки (relative + скругление и т.п.) */
  wrapperClassName?: string;
  /** Классы скелетона внутри обёртки */
  skeletonClassName?: string;
  onLoad?: () => void;
  onError?: React.ReactEventHandler<HTMLImageElement>;
};

export function SmartImg({
  src,
  alt,
  className = "",
  wrapperClassName = "",
  skeletonClassName = "",
  onLoad,
  onError,
  ...rest
}: SmartImgProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  /* Task 116: текущий src — может заменяться на сиблинга с другим
     расширением, когда основной файл 404 (ссылки в базе уехали на .webp,
     а файл на сервере остался jpg) */
  const [curSrc, setCurSrc] = useState(src);
  const [tried, setTried] = useState<string[]>([]);
  const [prevPropSrc, setPrevPropSrc] = useState(src);
  /* Проп src сменился (карусель/новый товар) — сбрасываем фолбэк-цепочку */
  if (prevPropSrc !== src) {
    setPrevPropSrc(src);
    setCurSrc(src);
    setTried([]);
  }

  const handleLoad = useCallback(() => {
    setLoaded(true);
    onLoad?.();
  }, [onLoad]);

  const handleError = useCallback(
    (e?: React.SyntheticEvent<HTMLImageElement, Event>) => {
      const cand = nextFallbackSrc(curSrc, tried);
      if (cand) {
        setTried([...tried, cand]);
        setFailed(false);
        setLoaded(false);
        setCurSrc(cand);
        return;
      }
      setFailed(true); // всё перепробовали — пустой фон
      if (e) onError?.(e);
    },
    [curSrc, tried, onError]
  );

  /* Картинка из кеша: и успех (onLoad не придёт), и ошибка до гидратации
     (onError не придёт) — добираем оба случая вручную (Task 116) */
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) {
      handleError();
      return;
    }
    if (img && img.complete && img.naturalWidth > 0) {
      setLoaded(true);
      onLoad?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Смена src (карусель, новый random) — снова показываем скелетон */
  useEffect(() => {
    const img = imgRef.current;
    if (img) {
      if (img.complete && img.naturalWidth > 0) setLoaded(true);
      else setLoaded(false);
    }
  }, [src]);

  return (
    <span
      className={`relative block overflow-hidden ${wrapperClassName}`}
      /* скелетон не должен «распирать» контейнер, если картинка ещё не задала размер */
      style={{ minHeight: rest.width && rest.height ? undefined : "1px" }}
    >
      {!loaded && !failed && (
        <span
          aria-hidden
          className={`img-skeleton pointer-events-none absolute inset-0 z-10 block ${skeletonClassName}`}
        />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        {...rest}
        ref={imgRef}
        src={curSrc}
        alt={alt}
        onLoad={handleLoad}
        onError={handleError}
        className={`${className} transition-opacity duration-500 ease-out ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
      />
    </span>
  );
}
