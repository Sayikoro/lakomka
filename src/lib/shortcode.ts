/* ============================================================
   Шорткоды витрины (Task 146).

   Галерея ставится в любой блок текстом-шорткодом, как в
   WordPress: [gallery слаг]. Парсер терпим к пробелам, кавычкам
   и регистру, понимает формы:
     [gallery fabriki] · [gallery id=fabriki] · [gallery id="fabriki"]
   Поле настроек допускает и «голый» слаг (fabriki) — если строка
   похожа на слаг и без скобок, считаем её шорткодом.
   ============================================================ */

/** Слаг галереи: латиница/цифры/дефис, как на бэкенде */
export const GALLERY_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Галерея блока фабрик по умолчанию (посеяна в репозитории:
 *  public/uploads/galleries/fabriki — 18 логотипов). Если владелец
 *  удалит галерею или очистит настройку — витрина вернётся к
 *  встроенному набору логотипов из mock-data. */
export const DEFAULT_BRANDS_GALLERY = "fabriki";

/**
 * Достать слаг галереи из шорткода [gallery …] (или «голого» слага).
 * Возвращает null, если в тексте шорткода нет.
 */
export function parseGalleryShortcode(text: string | undefined | null): string | null {
  const raw = (text ?? "").trim();
  if (raw === "") return null;

  // [gallery …] / [Галерея …] — регистр и пробелы не важны
  const m = /\[gallery\s+(?:id\s*=\s*)?["']?([^\]\s"']+)["']?\s*\]/i.exec(raw);
  if (m) {
    const slug = m[1].toLowerCase();
    return GALLERY_SLUG_RE.test(slug) ? slug : null;
  }

  // «Голый» слаг без скобок — тоже принимаем (поле настроек)
  const bare = raw.toLowerCase();
  if (GALLERY_SLUG_RE.test(bare)) return bare;

  return null;
}

/**
 * Разбить текст на сегменты для рендера: обычные строки и галереи.
 * Несколько шорткодов в одном тексте поддержаны.
 */
export type TextSegment =
  | { kind: "text"; value: string }
  | { kind: "gallery"; slug: string };

export function splitByGalleryShortcode(text: string): TextSegment[] {
  const out: TextSegment[] = [];
  const re = /\[gallery\s+(?:id\s*=\s*)?["']?([^\]\s"']+)["']?\s*\]/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const slug = m[1].toLowerCase();
    if (m.index > last) {
      out.push({ kind: "text", value: text.slice(last, m.index) });
    }
    if (GALLERY_SLUG_RE.test(slug)) {
      out.push({ kind: "gallery", slug });
    } else {
      out.push({ kind: "text", value: m[0] }); // битый слаг — покажем как текст
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", value: text.slice(last) });
  return out;
}
