"use client";

import { useEffect, useRef, useState } from "react";

/* ============================================================
   Снегопад в Hero-блоке на главной — как в оригинале (плагин
   particle-fall): у каждой снежинки случайная прозрачность
   (0.35–0.9) и размер (40–160% базы) → иллюзия разных слоёв,
   покачивание (wobble), дрейф и вращение.
   Плотность настраивается отдельно для компьютеров и телефонов
   (админка → Настройки → Снегопад). Canvas рисуется внутри
   Hero (absolute) и обрезается его overflow-hidden — снег не
   выходит за пределы блока.
   ============================================================ */

export interface SnowfallConfig {
  /** Количество снежинок на компьютерах (ширина ≥ 768px) */
  count: number;
  /** Количество снежинок на телефонах/планшетах (< 768px) */
  countMobile: number;
  /** Скорость падения (множитель) */
  speed: number;
  /** Базовый размер снежинки, px */
  size: number;
  /** Цвет-подкраска снежинки, hex (#rrggbb) */
  color: string;
  /** URL своей SVG-снежинки (пусто — встроенная) */
  flake: string;
}

const DEFAULT_FLAKE = "/uploads/snowflake/snowflake.svg";
/** Порог «мобильного» устройства — совпадает с Tailwind md (768px) */
const MOBILE_QUERY = "(max-width: 767px)";

interface Particle {
  x: number;
  y: number;
  baseSize: number;
  speed: number;
  opacity: number;
  drift: number;
  wobble: number;
  wobbleAmp: number;
  wobbleSpd: number;
  rotation: number;
  rotationSpd: number;
}

function createParticle(w: number, h: number, randomY: boolean, size: number, speed: number): Particle {
  const sizeVar = 0.4 + Math.random() * 1.2; // 40–160% от базы — как в оригинале
  const pSize = Math.max(2, size * sizeVar);
  return {
    x: Math.random() * w,
    y: randomY ? Math.random() * h : -pSize - Math.random() * 100,
    baseSize: pSize,
    speed: (0.5 + Math.random() * 0.8) * speed,
    /* Случайная прозрачность 0.35–0.9 — эффект слоёв из оригинала */
    opacity: 0.35 + Math.random() * 0.55,
    drift: (Math.random() - 0.5) * 1.2,
    wobble: Math.random() * Math.PI * 2,
    wobbleAmp: 0.3 + Math.random() * 0.7,
    wobbleSpd: 0.008 + Math.random() * 0.018,
    rotation: Math.random() * Math.PI * 2,
    rotationSpd: (Math.random() - 0.5) * 0.04,
  };
}

export function Snowfall({ count, countMobile, speed, size, color, flake }: SnowfallConfig) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  /* Плотность зависит от устройства: следим за шириной экрана */
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const activeCount = isMobile ? countMobile : count;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || activeCount <= 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    /* Уважаем reduced-motion: не анимируем снег */
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    let animId = 0;
    let disposed = false;
    let flakeImg: HTMLImageElement | null = null;
    let blobUrl: string | null = null;

    function sizeCanvas() {
      const rect = canvas!.getBoundingClientRect();
      const newW = Math.max(1, Math.floor(rect.width));
      const newH = Math.max(1, Math.floor(rect.height));
      if (canvas!.width !== Math.floor(rect.width * dpr) || canvas!.height !== Math.floor(rect.height * dpr)) {
        canvas!.width = Math.floor(rect.width * dpr);
        canvas!.height = Math.floor(rect.height * dpr);
        ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      w = newW;
      h = newH;
    }

    const particles: Particle[] = [];
    sizeCanvas();
    for (let i = 0; i < activeCount; i++) {
      particles.push(createParticle(w, h, true, size, speed));
    }

    function drawParticle(p: Particle) {
      const half = p.baseSize / 2;
      ctx!.save();
      ctx!.globalAlpha = p.opacity;
      ctx!.translate(p.x, p.y);
      ctx!.rotate(p.rotation);
      if (flakeImg) {
        ctx!.drawImage(flakeImg, -half, -half, p.baseSize, p.baseSize);
        /* Подкраска цветом из настроек: красим только непрозрачные пиксели */
        if (color) {
          ctx!.globalCompositeOperation = "source-atop";
          ctx!.fillStyle = color;
          ctx!.fillRect(-half, -half, p.baseSize, p.baseSize);
          ctx!.globalCompositeOperation = "source-over";
        }
      } else {
        const radius = Math.max(1, half);
        ctx!.beginPath();
        ctx!.arc(0, 0, radius, 0, Math.PI * 2);
        ctx!.fillStyle = color || "rgba(245,245,245,0.9)";
        ctx!.fill();
      }
      ctx!.restore();
    }

    function animate() {
      if (disposed) return;
      sizeCanvas();
      ctx!.clearRect(0, 0, w, h);
      for (const p of particles) {
        p.y += p.speed;
        p.wobble += p.wobbleSpd;
        p.x += p.drift + Math.sin(p.wobble) * p.wobbleAmp;
        p.rotation += p.rotationSpd;
        /* Перенос за краями блока */
        if (p.y > h + p.baseSize) {
          p.y = -p.baseSize - Math.random() * 40;
          p.x = Math.random() * w;
        }
        if (p.x > w + p.baseSize) p.x = -p.baseSize;
        if (p.x < -p.baseSize) p.x = w + p.baseSize;
        drawParticle(p);
      }
      animId = requestAnimationFrame(animate);
    }

    function onResize() {
      sizeCanvas();
    }
    window.addEventListener("resize", onResize);

    /* Загружаем SVG-снежинку: fetch → blob → Image (как в оригинале).
       Готовая картинка просто подключается к уже идущей анимации. */
    const src = flake || DEFAULT_FLAKE;
    fetch(src)
      .then((res) => {
        if (!res.ok) throw new Error("flake fetch failed");
        return res.text();
      })
      .then((svgText) => {
        blobUrl = URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml;charset=utf-8" }));
        return new Promise<HTMLImageElement | null>((resolve) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null);
          img.src = blobUrl!;
        });
      })
      .then((img) => {
        if (img && !disposed) flakeImg = img; // без снежинки рисуем кружки-фолбэк
      })
      .catch(() => {
        /* остаёмся на кружках-фолбэке */
      });

    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", onResize);
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [activeCount, speed, size, color, flake]);

  if (Math.max(count, countMobile) <= 0) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pf-canvas pointer-events-none absolute inset-0 z-[6] block h-full w-full"
    />
  );
}
