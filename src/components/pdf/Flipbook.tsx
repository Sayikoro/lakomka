"use client";

/**
 * Флипбук — PDF-вьювер с эффектом перелистывания страниц «как в книге».
 * Разворот из двух страниц на широких экранах, одна страница на телефоне.
 * Страницы рендерятся pdf.js в JPEG и листаются CSS 3D-анимацией.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

/** edge = флип касается обложки: открытие (fwd с поз. 0) или закрытие (back на поз. 0) */
type Anim = { dir: "fwd" | "back"; id: number; edge?: boolean } | null;

interface Props {
  url: string;
}

const RENDER_SCALE = 1.6;
const JPEG_QUALITY = 0.82;

function PagePlaceholder() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[repeating-linear-gradient(45deg,#fdfbf7_0px,#fdfbf7_14px,#f7f3ea_14px,#f7f3ea_28px)]">
      <span className="animate-pulse text-sm text-stone-400">…</span>
    </div>
  );
}

export function Flipbook({ url }: Props) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [numPages, setNumPages] = useState(0);
  const [ratio, setRatio] = useState(0.707);
  const [, setPagesVersion] = useState(0);
  const [spread, setSpread] = useState(true);
  const [pos, setPos] = useState(0); // разворот k или страница i (single)
  const [anim, setAnim] = useState<Anim>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  const wrapRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const pagesRef = useRef<(string | null)[]>([]);
  const pendingRef = useRef<Set<number>>(new Set());
  const pumpingRef = useRef(false);
  const pumpRef = useRef<() => void>(() => {});
  const focusRef = useRef(0);
  const animIdRef = useRef(0);
  const posRef = useRef(0);
  const animRef = useRef<Anim>(null);
  const dimsRef = useRef({ numPages: 0, spread: true });

  posRef.current = pos;
  animRef.current = anim;
  dimsRef.current = { numPages, spread };
  // центр приоритета очереди рендера: страница справа в развороте / текущая
  focusRef.current = spread ? 2 * pos : pos;

  /* ── Загрузка документа ── */
  useEffect(() => {
    let cancelled = false;
    let pdf: PDFDocumentProxy | null = null;

    (async () => {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
      const task = pdfjs.getDocument({
        url,
        standardFontDataUrl: "/pdfjs/standard_fonts/",
      });
      pdf = await task.promise;
      if (cancelled) {
        pdf.destroy();
        return;
      }
      const p1 = await pdf.getPage(1);
      const vp = p1.getViewport({ scale: 1 });
      pdfRef.current = pdf;
      pagesRef.current = new Array<string | null>(pdf.numPages).fill(null);
      pendingRef.current.clear();
      setNumPages(pdf.numPages);
      setRatio(vp.width / vp.height);
      setStatus("ready");
    })().catch((e: unknown) => {
      if (cancelled) return;
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setStatus("error");
    });

    return () => {
      cancelled = true;
      pdfRef.current = null;
      pdf?.destroy();
    };
  }, [url]);

  /* ── Замер контейнера ── */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setBox({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [status]);

  const spreadMode = box.w >= 700;

  /* ── Пересчёт позиции при смене режима ── */
  useEffect(() => {
    setPos((p) => (spreadMode ? Math.floor((p + 1) / 2) : 2 * p));
  }, [spreadMode]);

  useEffect(() => {
    setSpread(spreadMode);
  }, [spreadMode]);

  /* ── Рендер страницы в JPEG ── */
  const renderPage = useCallback(async (pdf: PDFDocumentProxy, i: number) => {
    const page = await pdf.getPage(i + 1);
    const viewport = page.getViewport({ scale: RENDER_SCALE });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    pagesRef.current[i] = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    setPagesVersion((v) => v + 1);
  }, []);

  /* ── Очередь рендера с приоритетом ──
     В очередь ставится весь документ (большие — широким окном), а pump()
     выбирает следующую страницу по близости к текущей позиции: сначала
     вперёд по книге, потом назад. За счёт этого при листании страницы
     уже готовы (запас много больше 4), а остаток дочекривается в фоне. */
  const enqueue = useCallback((indices: number[]) => {
    const n = pagesRef.current.length;
    let added = false;
    for (const i of indices) {
      if (i >= 0 && i < n && !pagesRef.current[i] && !pendingRef.current.has(i)) {
        pendingRef.current.add(i);
        added = true;
      }
    }
    if (added) pumpRef.current();
  }, []);

  const pump = useCallback(() => {
    if (pumpingRef.current) return;
    pumpingRef.current = true;
    const run = async () => {
      for (;;) {
        if (!pendingRef.current.size || !pdfRef.current) break;
        const pdf = pdfRef.current;
        let best = -1;
        let bestScore = Infinity;
        const focus = focusRef.current;
        pendingRef.current.forEach((i) => {
          const d = i - focus;
          // вперёд — по порядку, назад — сразу после равного по удалению
          const score = d >= 0 ? d : -d + 0.5;
          if (score < bestScore) {
            bestScore = score;
            best = i;
          }
        });
        if (best < 0) break;
        pendingRef.current.delete(best);
        if (!pagesRef.current[best]) {
          try {
            await renderPage(pdf, best);
          } catch {
            /* ошибка одной страницы не роняет очередь */
          }
        }
      }
    };
    run().finally(() => {
      pumpingRef.current = false;
      if (pendingRef.current.size && pdfRef.current) pumpRef.current();
    });
  }, [renderPage]);

  pumpRef.current = pump;

  /* ── Что ставить в очередь: небольшие каталоги рендерим целиком,
     большие — широким окном вокруг текущей позиции ── */
  useEffect(() => {
    if (!numPages || status !== "ready") return;
    const list: number[] = [];
    if (numPages <= 80) {
      for (let i = 0; i < numPages; i++) list.push(i);
    } else {
      const c = spread ? 2 * pos : pos;
      for (
        let i = Math.max(0, c - 5);
        i <= Math.min(numPages - 1, c + 10);
        i++
      )
        list.push(i);
    }
    enqueue(list);
  }, [pos, spread, numPages, status, enqueue]);

  /* ── Листание ── */
  const next = useCallback(() => {
    if (animRef.current) return;
    const { numPages: n, spread: sp } = dimsRef.current;
    const max = sp ? Math.floor(n / 2) : n - 1;
    if (posRef.current >= max) return;
    animIdRef.current += 1;
    setAnim({ dir: "fwd", id: animIdRef.current, edge: sp && posRef.current === 0 });
    setPos((p) => p + 1);
  }, []);

  const prev = useCallback(() => {
    if (animRef.current) return;
    if (posRef.current <= 0) return;
    const sp = dimsRef.current.spread;
    animIdRef.current += 1;
    setAnim({ dir: "back", id: animIdRef.current, edge: sp && posRef.current === 1 });
    setPos((p) => p - 1);
  }, []);

  /* ── Клавиатура ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev]);

  /* ── Свайп ── */
  const touchX = useRef<number | null>(null);

  function onSceneClick(e: React.MouseEvent) {
    const scene = sceneRef.current;
    if (!scene || animRef.current) return;
    // Закрытая обложка открывается кликом в любое место
    if (spread && pos === 0 && !anim) {
      next();
      return;
    }
    const rect = scene.getBoundingClientRect();
    if (e.clientX - rect.left < rect.width / 2) prev();
    else next();
  }

  /* ── Геометрия ── */
  const pad = 16;
  const availW = Math.max(0, box.w - pad * 2);
  const availH = Math.max(0, box.h - pad * 2);
  let pageW: number;
  if (spread) pageW = Math.min(availW / 2, availH * ratio);
  else pageW = Math.min(availW, availH * ratio);
  pageW = Math.max(pageW, 120);
  const pageH = pageW / ratio;

  /* ── Состояния книги ──
     coverShown — книга закрыта: одна обложка по центру.
     edge-флипы (открытие/закрытие) — сцена двойной ширины со сдвигом,
     чтобы обложка начиналась ровно там, где лежала закрытой. */
  const coverShown = spread && pos === 0 && !anim;
  const sceneWide = spread && (pos > 0 || (!!anim && !!anim.edge));
  const sceneW = spread ? (sceneWide ? pageW * 2 : pageW) : pageW;

  /* ── Контент разворота ── */
  const pageAt = (i: number): string | null =>
    i >= 0 && i < numPages ? pagesRef.current[i] : null;

  /* Базовые страницы под листом (0-based; -2 → половина пустая,
     как у настоящей книги, пока туда не прилетел переворот):
     fwd — под листом слева видна СТАРАЯ левая, справа проявляется новая правая;
     back — слева проявляется новая левая, справа видна СТАРАЯ правая. */
  let leftIdx = spread ? 2 * pos - 1 : -1;
  let rightIdx = spread ? 2 * pos : pos;
  if (anim && spread) {
    if (anim.edge) {
      // Открытие/закрытие обложки: левая половина пуста, как у настоящей
      // книги (левая страница появляется только когда прилетит переворот);
      // справа — стр. 3: при открытии проявляется, при закрытии накрывается
      leftIdx = -2;
      rightIdx = 2;
    } else if (anim.dir === "fwd") {
      leftIdx = pos >= 2 ? 2 * pos - 3 : -2;
      rightIdx = 2 * pos;
    } else {
      leftIdx = pos >= 1 ? 2 * pos - 1 : -2;
      rightIdx = pos >= 1 ? 2 * pos + 2 : 2;
    }
  }
  const leftPage = pageAt(leftIdx);
  const rightPage = pageAt(rightIdx);

  const faceContent = (i: number, plain = false) => {
    const src = pageAt(i);
    if (src) return <img src={src} alt="" draggable={false} />;
    // Лист в полёте: страница не успела отрендериться — серая бумага,
    // картинка проявится на лету, как только догонит очередь
    return plain ? (
      <div className="h-full w-full bg-[linear-gradient(to_bottom,#f4f1ea,#e2ded4)]" />
    ) : (
      <PagePlaceholder />
    );
  };

  /* ── Анимируемый лист ──
     Обложка (edge): открытие — лист «обложка» летит слева (лицо = стр. 1,
     изнанка = стр. 2); закрытие — обратно (лицо = стр. 2, изнанка = обложка). */
  let sheet: React.ReactNode = null;
  if (anim) {
    const fwd = anim.dir === "fwd";
    const cls = spread
      ? fwd
        ? "lb-fwd"
        : "lb-back"
      : fwd
        ? "lb-single-fwd"
        : "lb-single-back";
    let frontIdx: number;
    let backIdx: number;
    if (spread && anim.edge) {
      frontIdx = fwd ? 0 : 1;
      backIdx = fwd ? 1 : 0;
    } else if (spread) {
      frontIdx = fwd ? 2 * pos - 2 : 2 * pos + 1;
      backIdx = fwd ? 2 * pos - 1 : 2 * pos;
    } else {
      frontIdx = fwd ? pos - 1 : pos + 1;
      backIdx = fwd ? pos : pos - 1;
    }
    sheet = (
      <div
        key={anim.id}
        className={`leafbook-sheet ${cls}`}
        onAnimationEnd={() => setAnim((a) => (a && a.id === anim.id ? null : a))}
      >
        <div className="leafbook-face">{faceContent(frontIdx, true)}</div>
        <div className="leafbook-face lb-verso">{faceContent(backIdx, true)}</div>
      </div>
    );
  }

  /* Индикатор страниц */
  let indicator = "";
  if (numPages) {
    if (spread) {
      const parts: number[] = [];
      if (pos === 0) {
        // обложка — справа страница 1
        parts.push(1);
      } else {
        if (2 * pos >= 1 && 2 * pos <= numPages) parts.push(2 * pos);
        if (2 * pos + 1 <= numPages) parts.push(2 * pos + 1);
      }
      indicator = `${parts.join("–")} из ${numPages}`;
    } else {
      indicator = `${pos + 1} из ${numPages}`;
    }
  }

  const maxPos = spread ? Math.floor(numPages / 2) : numPages - 1;

  const arrowCls =
    "pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-stone-700 shadow-[0_6px_18px_-6px_rgba(0,0,0,0.5)] transition hover:bg-white hover:text-[var(--color-primary)] active:scale-95 disabled:pointer-events-none disabled:opacity-35";

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Книга */}
      <div
        ref={wrapRef}
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden"
        onTouchStart={(e) => {
          touchX.current = e.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          if (touchX.current === null) return;
          const dx = (e.changedTouches[0]?.clientX ?? 0) - touchX.current;
          touchX.current = null;
          if (dx <= -48) next();
          else if (dx >= 48) prev();
        }}
      >
        {status === "loading" && (
          <div className="flex flex-col items-center gap-3 text-stone-300">
            <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-white/25 border-t-white" />
            <span className="text-sm">Загружаем документ…</span>
          </div>
        )}
        {status === "error" && (
          <div className="max-w-sm text-center text-sm text-red-200">
            Не удалось открыть PDF: {errorMsg}
          </div>
        )}
        {status === "ready" && (
          <>
            <button
              type="button"
              onClick={prev}
              disabled={pos <= 0 || !!anim}
              aria-label="Предыдущая страница"
              className={`${arrowCls} absolute left-2 top-1/2 z-40 -translate-y-1/2 sm:left-4`}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 5l-7 7 7 7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={next}
              disabled={pos >= maxPos || !!anim}
              aria-label="Следующая страница"
              className={`${arrowCls} absolute right-2 top-1/2 z-40 -translate-y-1/2 sm:right-4`}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 5l7 7-7 7" />
              </svg>
            </button>

            <div
              ref={sceneRef}
              role="presentation"
              className={`leafbook-scene${
                anim?.edge && spread
                  ? anim.dir === "fwd"
                    ? " lb-opening"
                    : " lb-closing"
                  : ""
              }`}
              style={
                {
                  width: sceneW,
                  height: pageH,
                  "--lb-page": `${pageW}px`,
                } as React.CSSProperties
              }
              onClick={onSceneClick}
            >
              {/* Базовый разворот; закрытая книга — одна обложка по центру */}
              {coverShown ? (
                <div className="leafbook-base lb-single">
                  {pageAt(0) ? (
                    <img src={pageAt(0)!} alt="" draggable={false} />
                  ) : (
                    <PagePlaceholder />
                  )}
                  <span className="leafbook-spine lb-left-edge" />
                </div>
              ) : spread ? (
                <>
                  {leftIdx !== -2 && (
                    <div className="leafbook-base lb-left">
                      {leftPage ? (
                        <img src={leftPage} alt="" draggable={false} />
                      ) : (
                        <PagePlaceholder />
                      )}
                      <span className="leafbook-spine lb-left-edge" />
                    </div>
                  )}
                  <div className="leafbook-base lb-right">
                    {rightPage ? (
                      <img src={rightPage} alt="" draggable={false} />
                    ) : (
                      <PagePlaceholder />
                    )}
                    <span className="leafbook-spine lb-right-edge" />
                  </div>
                </>
              ) : (
                <div className="leafbook-base lb-single">
                  {rightPage ? (
                    <img src={rightPage} alt="" draggable={false} />
                  ) : (
                    <PagePlaceholder />
                  )}
                  <span className="leafbook-spine lb-both" />
                </div>
              )}
              {/* Переворачивающийся лист поверх */}
              {sheet}
            </div>
          </>
        )}
      </div>

      {/* Индикатор */}
      <div className="pt-2 text-center text-[13px] text-white/70">
        {status === "ready" && indicator && (
          <>
            Страница {indicator}
            <span className="ml-3 hidden text-white/45 sm:inline">
              (листайте стрелками, кликом или свайпом)
            </span>
          </>
        )}
      </div>
    </div>
  );
}
