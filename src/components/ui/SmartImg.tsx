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

type SmartImageProps = Omit<ImageProps, "onLoad" | "onError"> & {
  /** Доп. классы на скелетоне (например скругление) */
  skeletonClassName?: string;
  onLoad?: () => void;
};

export function SmartImage({
  skeletonClassName = "",
  onLoad,
  className,
  ...rest
}: SmartImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const handleLoad = useCallback(() => {
    setLoaded(true);
    onLoad?.();
  }, [onLoad]);

  /* Картинка могла догрузиться до гидратации (кеш) — onLoad уже не придёт */
  useEffect(() => {
    const img = imgRef.current;
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
        ref={imgRef}
        onLoad={handleLoad}
        onError={() => setFailed(true)}
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

  const handleLoad = useCallback(() => {
    setLoaded(true);
    onLoad?.();
  }, [onLoad]);

  /* Картинка из кеша могла загрузиться до гидратации */
  useEffect(() => {
    const img = imgRef.current;
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
        src={src}
        alt={alt}
        onLoad={handleLoad}
        onError={(e) => {
          setFailed(true); // ошибка: убираем скелетон, показываем пустой фон
          onError?.(e);
        }}
        className={`${className} transition-opacity duration-500 ease-out ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
      />
    </span>
  );
}
