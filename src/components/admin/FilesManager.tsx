"use client";

/* Файловый менеджер админки — как проводник Windows:
 *  - дерево разделов и папок слева (ленивая загрузка),
 *  - хлебные крошки + назад/вперёд/вверх/обновить,
 *  - вид «подробности» (таблица) и «значки» (плитка),
 *  - сортировка по имени/дате/размеру, поиск по текущей папке,
 *  - скачивание в два этапа (прогресс в панели загрузок),
 *  - КОНТЕКСТНОЕ МЕНЮ по правому клику (и долгому тапу на сенсорных
 *    экранах, плюс кнопка «⋯» в строке): открыть/скачать, открыть в
 *    новой вкладке, копировать ссылку, переименовать, удалить, свойства;
 *    на пустом месте — обновить, загрузить файлы, создать папку, свойства папки;
 *  - удаление файлов и папок (media — только просмотр),
 *    с подтверждением и галочкой «Не показывать больше» (localStorage);
 *  - СОЗДАНИЕ СВОИХ ПАПОК (кнопка «Создать папку» + модалка),
 *  - переименование файлов и папок (в media — запрещено, сломает ссылки),
 *  - ЗАГРУЗКА своих файлов в открытую папку (кнопка + drag&drop).
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useDownloads } from "@/components/admin/downloads/Downloads";
import { STORAGE_ACCEPT, uploadToStorage } from "@/lib/file-storage";

interface Entry {
  name: string;
  type: "dir" | "file";
  size: number;
  mtime: number;
  deletable: boolean;
  public_url: string | null;
  ext?: string;
  key?: string; // ключ раздела (в корне)
}

/* Данные для окна «Свойства» (файл, папка или текущий раздел) */
interface PropsInfo {
  entry: Entry;        // для текущей папки — псевдо-Entry
  kind: string;        // «Папка», «Видео»…
  pathDisplay: string; // полный путь
  size: string;
  mtime: string;
  filesCount?: number; // для папок
  publicUrl: string | null;
  deletable: boolean;
}

interface FolderData {
  path: string;
  title: string;
  hint?: string;
  deletable: boolean;
  entries: Entry[];
  total_size: number;
  files_count: number;
  section?: string;
}

type SortKey = "name" | "size" | "mtime";

const SECTION_TITLES: Record<string, string> = {
  exports: "Экспортные архивы",
  imports: "Импортные архивы",
  media: "Медиа товаров",
};

/* «Не показывать больше» у подтверждения удаления — настройка браузера админа.
 * Хранится в localStorage, компоненты читают через useSyncExternalStore
 * (SSR-безопасно, без setState в эффектах, синхронно между вкладками). */
const LS_CONFIRM_DELETE = "lakomka.files.confirmDelete";
const confirmDeleteListeners = new Set<() => void>();

function subscribeConfirmDelete(cb: () => void): () => void {
  confirmDeleteListeners.add(cb);
  window.addEventListener("storage", cb); // синхронизация между вкладками
  return () => {
    confirmDeleteListeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function readConfirmDelete(): boolean {
  try {
    return localStorage.getItem(LS_CONFIRM_DELETE) !== "0";
  } catch {
    return true; // localStorage недоступен — подтверждение остаётся
  }
}

function writeConfirmDelete(on: boolean) {
  try {
    localStorage.setItem(LS_CONFIRM_DELETE, on ? "1" : "0");
  } catch {
    /* localStorage недоступен — флаг проживёт до перезагрузки */
  }
  for (const cb of confirmDeleteListeners) cb();
}

function humanSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return (bytes / 1024 / 1024 / 1024).toFixed(1) + " ГБ";
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + " МБ";
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + " КБ";
  return Math.round(bytes) + " Б";
}

function humanDate(ts: number): string {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function joinPath(a: string, b: string): string {
  return a ? `${a}/${b}` : b;
}

/* Копирование в буфер: clipboard API + запасной путь для http */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* нет clipboard API (например, не-HTTPS) — идём через запасной путь */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function parentPath(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? "" : p.slice(0, i);
}

function typeLabel(e: Entry): string {
  if (e.type === "dir") return "Папка";
  switch (e.ext) {
    case "zip":
      return "Архив ZIP";
    case "csv":
      return "Таблица CSV";
    case "mp4":
    case "mov":
    case "webm":
    case "avi":
      return "Видео";
    case "png":
    case "jpg":
    case "jpeg":
    case "webp":
    case "gif":
      return "Изображение";
    default:
      return "Файл";
  }
}

export function FilesManager() {
  const downloads = useDownloads();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api";

  const [path, setPath] = useState("");
  const [folder, setFolder] = useState<FolderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  /* Загрузка своих файлов в открытую папку (кнопка «Загрузить» + drag&drop) */
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [uploadNote, setUploadNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  /* Создание папок и переименование (как в проводнике) */
  const [mkdirOpen, setMkdirOpen] = useState(false);
  const [mkdirName, setMkdirName] = useState("");
  const [mkdirBusy, setMkdirBusy] = useState(false);
  const [renameFor, setRenameFor] = useState<Entry | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);

  /* Контекстное меню (ПКМ / долгий тап) и окно «Свойства» */
  const [menu, setMenu] = useState<{ x: number; y: number; entry: Entry | null; items: CtxItem[] } | null>(null);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const menuRef = useRef<HTMLDivElement | null>(null);
  const pressTimer = useRef<number | null>(null);
  const lpFiredRef = useRef(false); // подавить клик сразу после долгого тапа
  const [propsInfo, setPropsInfo] = useState<PropsInfo | null>(null);

  /* Удаление: модалка-подтверждение + «Не показывать больше»
   * confirmDelete — из localStorage (useSyncExternalStore), НЕ react-стейт */
  const confirmDelete = useSyncExternalStore(
    subscribeConfirmDelete,
    readConfirmDelete,
    () => true, // SSR: до гидрации считаем, что вопрос показывается
  );
  const [deleteFor, setDeleteFor] = useState<Entry | null>(null);
  const [deleteDontAsk, setDeleteDontAsk] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [backStack, setBackStack] = useState<string[]>([]);
  const [fwdStack, setFwdStack] = useState<string[]>([]);

  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [view, setView] = useState<"details" | "tiles">("details");
  const [filter, setFilter] = useState("");
  const [showSidebar, setShowSidebar] = useState(false);

  const [treeOpen, setTreeOpen] = useState<Record<string, boolean>>({});
  const [treeVersion, setTreeVersion] = useState(0);
  const [roots, setRoots] = useState<Entry[]>([]);
  const cacheRef = useRef(new Map<string, FolderData>());

  // Корневые разделы для дерева (переживает очистку кэша)
  useEffect(() => {
    let alive = true;
    (async () => {
      const cached = cacheRef.current.get("");
      if (cached) {
        setRoots(cached.entries);
        return;
      }
      try {
        const res = await fetch(`${apiUrl}/admin/files`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = await res.json();
        if (alive) setRoots(json.data?.entries ?? []);
      } catch {
        /* дерево необязательно */
      }
    })();
    return () => {
      alive = false;
    };
  }, [treeVersion, apiUrl]);

  const loadFolder = useCallback(
    async (p: string, opts?: { force?: boolean }): Promise<FolderData | null> => {
      const cache = cacheRef.current;
      if (!opts?.force && cache.has(p)) {
        const data = cache.get(p)!;
        setFolder(data);
        setPath(p);
        setError(null);
        return data;
      }
      setLoading(true);
      try {
        const res = await fetch(
          `${apiUrl}/admin/files${p ? `?path=${encodeURIComponent(p)}` : ""}`,
          { credentials: "include", cache: "no-store" },
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(json.error ?? `Ошибка ${res.status}`);
          return null;
        }
        const data: FolderData = json.data;
        cache.set(p, data);
        setFolder(data);
        setPath(p);
        setError(null);
        return data;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ошибка сети");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [apiUrl],
  );

  useEffect(() => {
    void loadFolder("");
  }, [loadFolder]);

  /* Контекстное меню: закрытие по клику мимо, Esc, скроллу, resize, blur */
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onDown = (ev: MouseEvent) => {
      if (menuRef.current && ev.target instanceof Node && !menuRef.current.contains(ev.target)) close();
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") close();
    };
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  /* ── Навигация ── */

  const open = useCallback(
    (p: string) => {
      setBackStack((st) => [...st, path]);
      setFwdStack([]);
      setFilter("");
      setShowSidebar(false);
      void loadFolder(p);
    },
    [path, loadFolder, setShowSidebar],
  );

  const goBack = useCallback(() => {
    setBackStack((st) => {
      if (st.length === 0) return st;
      const prev = st[st.length - 1];
      setFwdStack((f) => [path, ...f]);
      setFilter("");
      void loadFolder(prev);
      return st.slice(0, -1);
    });
  }, [path, loadFolder]);

  const goForward = useCallback(() => {
    setFwdStack((st) => {
      if (st.length === 0) return st;
      const next = st[0];
      setBackStack((b) => [...b, path]);
      setFilter("");
      void loadFolder(next);
      return st.slice(1);
    });
  }, [path, loadFolder]);

  const goUp = useCallback(() => {
    if (path) open(parentPath(path));
  }, [path, open]);

  const refresh = useCallback(() => {
    cacheRef.current.clear();
    setTreeVersion((v) => v + 1);
    void loadFolder(path, { force: true });
  }, [path, loadFolder]);

  /* ── Действия ── */

  function downloadFile(e: Entry) {
    if (e.type !== "dir" && folder) {
      const p = joinPath(folder.path, e.name);
      const url = e.public_url ?? `${apiUrl}/admin/files/download?path=${encodeURIComponent(p)}`;
      downloads.start({ url, name: e.name });
    }
  }

  /* Точка входа «удалить»: либо сразу (флаг выключен), либо через модалку */
  function removeEntry(e: Entry) {
    if (!folder) return;
    if (!confirmDelete) {
      void deleteEntry(e);
      return;
    }
    setDeleteDontAsk(false);
    setDeleteFor(e);
  }

  /* Подтвердили в модалке: запоминаем «не показывать больше» и удаляем */
  function confirmRemoveEntry() {
    if (!deleteFor) return;
    if (deleteDontAsk) writeConfirmDelete(false); // эмит обновит confirmDelete
    const target = deleteFor;
    void deleteEntry(target);
  }

  async function deleteEntry(e: Entry) {
    if (!folder) return;
    const target = joinPath(folder.path, e.name);
    setBusy(target);
    setDeleteBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/admin/files/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ path: target }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Не удалось удалить");
        return;
      }
      cacheRef.current.clear();
      setTreeVersion((v) => v + 1);
      await loadFolder(folder.path, { force: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сети");
    } finally {
      setBusy(null);
      setDeleteBusy(false);
      setDeleteFor(null);
    }
  }

  /* ── Создание папки в текущей директории ── */

  async function createFolder() {
    if (!path || !mkdirName.trim()) return;
    setMkdirBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/admin/files/mkdir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ path, name: mkdirName.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Не удалось создать папку");
        return;
      }
      setMkdirOpen(false);
      setMkdirName("");
      cacheRef.current.clear();
      setTreeVersion((v) => v + 1);
      await loadFolder(path, { force: true });
      setUploadNote({ ok: true, text: `Папка «${json.data?.name ?? mkdirName.trim()}» создана` });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сети");
    } finally {
      setMkdirBusy(false);
    }
  }

  /* ── Переименование файла/папки ── */

  async function renameEntry() {
    if (!folder || !renameFor || !renameName.trim()) return;
    const target = joinPath(folder.path, renameFor.key ?? renameFor.name);
    setRenameBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/admin/files/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ path: target, name: renameName.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Не удалось переименовать");
        return;
      }
      setRenameFor(null);
      setRenameName("");
      cacheRef.current.clear();
      setTreeVersion((v) => v + 1);
      await loadFolder(folder.path, { force: true });
      setUploadNote({ ok: true, text: `Переименовано в «${json.data?.name ?? renameName.trim()}»` });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сети");
    } finally {
      setRenameBusy(false);
    }
  }

  /* ── Контекстное меню: элементы и открытие ── */

  const entryFull = (e: Entry): string => joinPath(path, e.key ?? e.name);

  const entryUrl = (e: Entry): string => {
    const full = entryFull(e);
    return e.public_url ?? `${apiUrl}/admin/files/download?path=${encodeURIComponent(full)}`;
  };

  const propsOfEntry = (e: Entry): PropsInfo => {
    const full = entryFull(e);
    const isRootSection = e.type === "dir" && !path;
    const title = SECTION_TITLES[e.key ?? e.name];
    return {
      entry: e,
      kind: isRootSection && title ? "Раздел" : typeLabel(e),
      pathDisplay: (isRootSection && title ? title : null) ?? full,
      size: e.type === "dir" ? (e.size > 0 ? humanSize(e.size) : "—") : humanSize(e.size),
      mtime: humanDate(e.mtime),
      publicUrl: e.type === "file" ? e.public_url : null,
      deletable: e.deletable,
    };
  };

  const propsOfCurrentFolder = (): PropsInfo => ({
    entry: {
      name: folder?.title ?? path,
      type: "dir",
      size: folder?.total_size ?? 0,
      mtime: 0,
      deletable: folder?.deletable ?? false,
      public_url: null,
      key: path,
    },
    kind: "Папка",
    pathDisplay: path || "Файлы",
    size: folder && folder.total_size > 0 ? humanSize(folder.total_size) : "—",
    mtime: "—",
    filesCount: folder?.files_count,
    publicUrl: null,
    deletable: folder?.deletable ?? false,
  });

  const copyEntryLink = (e: Entry) => {
    void copyText(entryUrl(e)).then((ok) =>
      setUploadNote({
        ok,
        text: ok ? `Ссылка на «${e.name}» скопирована` : "Не удалось скопировать ссылку",
      }),
    );
  };

  const ctxItemsFor = (e: Entry | null): CtxItem[] => {
    if (!e) {
      const items: CtxItem[] = [
        { key: "refresh", label: "Обновить", icon: ICONS.refresh, action: refresh },
      ];
      if (path && uploadPct === null) {
        items.push({
          key: "upload",
          label: "Загрузить файлы сюда",
          icon: ICONS.upload,
          action: () => fileInputRef.current?.click(),
        });
      }
      if (path) {
        items.push({
          key: "mkdir",
          label: "Создать папку",
          icon: ICONS.folderPlus,
          action: () => {
            setMkdirName("");
            setMkdirOpen(true);
          },
        });
        items.push({
          key: "fprops",
          label: "Свойства папки",
          icon: ICONS.info,
          action: () => setPropsInfo(propsOfCurrentFolder()),
        });
      }
      return items;
    }

    const full = entryFull(e);
    const items: CtxItem[] = [];
    if (e.type === "dir") {
      items.push({ key: "open", label: "Открыть", icon: ICONS.open, action: () => open(e.key ?? full) });
    } else {
      if (e.public_url) {
        const url = e.public_url;
        items.push({
          key: "newtab",
          label: "Открыть в новой вкладке",
          icon: ICONS.ext,
          action: () => window.open(url, "_blank", "noopener,noreferrer"),
        });
      }
      items.push({ key: "download", label: "Скачать", icon: ICONS.download, action: () => downloadFile(e) });
      items.push({ key: "copy", label: "Копировать ссылку", icon: ICONS.link, action: () => void copyEntryLink(e) });
    }
    items.push({ key: "props", label: "Свойства", icon: ICONS.info, action: () => setPropsInfo(propsOfEntry(e)) });
    if (e.deletable) {
      items.push({ key: "sep", label: "", icon: "", sep: true });
      items.push({
        key: "rename",
        label: "Переименовать",
        icon: ICONS.pencil,
        disabled: busy === full,
        action: () => {
          setRenameName(e.name);
          setRenameFor(e);
        },
      });
      items.push({
        key: "delete",
        label: "Удалить",
        icon: ICONS.trash,
        danger: true,
        disabled: busy === full,
        action: () => removeEntry(e),
      });
    }
    return items;
  };

  /* Открыть меню в точке экрана с поправкой на края окна;
   * пункты считаем сразу и храним в состоянии (не вызываем в рендере) */
  const openMenuAt = (x: number, y: number, entry: Entry | null) => {
    const items = ctxItemsFor(entry);
    const W = 268;
    const H = 40 + items.length * 30 + (entry ? 30 : 0);
    const cx = Math.max(8, Math.min(x, window.innerWidth - W - 8));
    const cy = Math.max(8, Math.min(y, window.innerHeight - H - 8));
    setMenu({ x: cx, y: cy, entry, items });
    setMenuPos({ x: cx, y: cy });
  };

  /* Долгий тап (сенсорные экраны) ≈ правый клик */
  const startLongPress = (ev: React.TouchEvent, entry: Entry | null) => {
    const t = ev.touches[0];
    if (!t) return;
    const x = t.clientX;
    const y = t.clientY;
    cancelLongPress();
    pressTimer.current = window.setTimeout(() => {
      pressTimer.current = null;
      lpFiredRef.current = true;
      openMenuAt(x, y, entry);
    }, 550);
  };

  const cancelLongPress = () => {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  /* ── Загрузка файлов в хранилище (текущая папка) ── */

  async function uploadFiles(list: FileList | File[]) {
    const files = Array.from(list);
    if (!path) {
      setUploadNote({
        ok: false,
        text: "Сначала откройте папку (например «Медиа товаров»), файлы загружаются в открытую папку.",
      });
      return;
    }
    if (files.length === 0) return;

    setUploadNote(null);
    setUploadPct(0);
    const errors: string[] = [];
    const ok: string[] = [];
    const optNotes: string[] = [];
    for (const f of files) {
      try {
        const r = await uploadToStorage(f, path, (pct) => setUploadPct(pct), apiUrl);
        ok.push(r.name);
        if (r?.optimized) optNotes.push(r.optimized);
      } catch (e) {
        errors.push(`${f.name}: ${e instanceof Error ? e.message : "ошибка"}`);
      }
    }
    setUploadPct(null);
    if (ok.length) {
      cacheRef.current.clear();
      setTreeVersion((v) => v + 1);
      await loadFolder(path, { force: true });
    }
    if (errors.length) {
      setUploadNote({ ok: false, text: `Не загружено: ${errors.join("; ")}` });
    } else {
      const base = files.length === 1 ? `Файл «${ok[0]}» загружен` : `Загружено файлов: ${ok.length}`;
      setUploadNote({
        ok: true,
        text: optNotes.length ? `${base}. Сжато: ${optNotes.join("; ")}` : base,
      });
    }
  }

  /* ── Сортировка / фильтр ── */

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const list = (folder?.entries ?? []).filter((e) =>
      e.name.toLowerCase().includes(needle),
    );
    return [...list].sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      let r = 0;
      if (sortKey === "name") r = a.name.localeCompare(b.name, "ru", { numeric: true });
      else if (sortKey === "size") r = a.size - b.size;
      else r = a.mtime - b.mtime;
      return r * sortDir;
    });
  }, [folder, filter, sortKey, sortDir]);

  function sortBy(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(key);
      setSortDir(1);
    }
  }

  /* ── Крошки ── */

  const crumbs = useMemo(() => {
    const parts = path ? path.split("/") : [];
    const out: { label: string; path: string }[] = [{ label: "Файлы", path: "" }];
    let acc = "";
    for (const part of parts) {
      acc = joinPath(acc, part);
      out.push({
        label: SECTION_TITLES[part] ?? part,
        path: acc,
      });
    }
    return out;
  }, [path]);

  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-white">
      {error && (
        <div className="flex items-center justify-between border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-xs underline">
            закрыть
          </button>
        </div>
      )}

      <div className="flex min-h-[560px]">
        {/* ── Боковое дерево (как у проводника) ── */}
        <aside className="hidden w-60 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-bg-soft)] md:block">
          <p className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
            Быстрый доступ
          </p>
          <div className="pb-4">
            <TreeRow
              depth={0}
              label="Файлы"
              icon="home"
              active={path === ""}
              onClick={() => open("")}
              expandable={false}
            />
            {roots.map((s) => (
              <TreeBranch
                key={s.key ?? s.name}
                entry={s}
                basePath={s.key ?? ""}
                depth={1}
                activePath={path}
                treeOpen={treeOpen}
                onToggle={toggleTreeNode}
                onOpen={open}
                apiUrl={apiUrl}
                treeVersion={treeVersion}
              />
            ))}
          </div>
        </aside>

        {/* ── Основная область ── */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Панель инструментов */}
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] px-3 py-2">
            <div className="flex items-center gap-1">
              <ToolButton label="Назад" disabled={backStack.length === 0} onClick={goBack}>
                <path d="M15 5l-7 7 7 7" />
              </ToolButton>
              <ToolButton label="Вперёд" disabled={fwdStack.length === 0} onClick={goForward}>
                <path d="M9 5l7 7-7 7" />
              </ToolButton>
              <ToolButton label="Вверх" disabled={!path} onClick={goUp}>
                <path d="M4 12l8-8 8 8M6 10v9h12v-9" />
              </ToolButton>
              <ToolButton label="Обновить" onClick={refresh}>
                <path d="M17 8a7 7 0 1 0 2 5M19 4v5h-5" />
              </ToolButton>
              <button
                type="button"
                aria-pressed={!confirmDelete}
                onClick={() => {
                  const next = !confirmDelete;
                  writeConfirmDelete(next); // эмит обновит confirmDelete
                  setUploadNote({
                    ok: true,
                    text: next
                      ? "Подтверждение удаления включено — перед удалением будет вопрос."
                      : "Подтверждение удаления отключено — файлы удаляются сразу, без вопроса.",
                  });
                }}
                title={
                  confirmDelete
                    ? "Подтверждение удаления включено (кликните, чтобы удалять без вопроса)"
                    : "Удаление без подтверждения (кликните, чтобы вернуть вопрос)"
                }
                className={`rounded-md border bg-white p-1.5 transition ${
                  confirmDelete
                    ? "border-[var(--color-border)] text-[var(--color-body)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                    : "border-amber-300 bg-amber-50 text-amber-700"
                }`}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 3l7 2.6v5.1c0 4.3-2.8 8-7 9.3-4.2-1.3-7-5-7-9.3V5.6L12 3z" />
                  <path d="M10.2 9.7a1.9 1.9 0 1 1 2.7 1.8c-.6.3-.9.7-.9 1.4" />
                  <circle cx="12" cy="15.2" r="0.4" fill="currentColor" stroke="none" />
                </svg>
              </button>
            </div>

            {/* Загрузить свои файлы в открытую папку (медиа и т.д.) */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!path || uploadPct !== null}
              title={
                path
                  ? `Загрузить файлы в «${folder?.title ?? path}»`
                  : "Откройте папку, чтобы загрузить файлы"
              }
              className="flex cursor-pointer items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-white px-2.5 py-1.5 text-xs font-medium text-[var(--color-body)] transition hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:pointer-events-none disabled:opacity-40"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 16V4M6.5 9.5 12 4l5.5 5.5" />
                <path d="M4 20h16" />
              </svg>
              Загрузить
            </button>

            {/* Создать свою папку в открытой директории */}
            <button
              type="button"
              onClick={() => {
                setMkdirName("");
                setMkdirOpen(true);
              }}
              disabled={!path}
              title={
                path
                  ? `Создать папку в «${folder?.title ?? path}»`
                  : "Откройте раздел, чтобы создать папку"
              }
              className="flex cursor-pointer items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-white px-2.5 py-1.5 text-xs font-medium text-[var(--color-body)] transition hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:pointer-events-none disabled:opacity-40"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.6l2 2.2h8.4A1.5 1.5 0 0 1 21 8.7v9.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5v-12Z" />
                <path d="M12 10.5v5M9.5 13h5" />
              </svg>
              Создать папку
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={STORAGE_ACCEPT}
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) void uploadFiles(e.target.files);
                e.target.value = ""; // повторный выбор того же файла срабатывает
              }}
            />

            <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-soft)] px-2.5 py-1.5 text-sm">
              {crumbs.map((c, i) => (
                <span key={c.path || "root"} className="flex min-w-0 items-center gap-1">
                  {i > 0 && <span className="text-[var(--color-muted)]">›</span>}
                  <button
                    type="button"
                    onClick={() => open(c.path)}
                    className="max-w-[190px] truncate text-left text-[var(--color-body)] hover:text-[var(--color-primary)] hover:underline"
                    title={c.label}
                  >
                    {c.label}
                  </button>
                </span>
              ))}
            </nav>

            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Поиск в папке…"
              className="w-36 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--color-primary)] sm:w-44"
            />

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowSidebar(true)}
                className="rounded-md border border-[var(--color-border)] px-2 py-1.5 text-xs text-[var(--color-body)] md:hidden"
              >
                Папки
              </button>
              <ViewToggle view={view} onChange={setView} />
            </div>
          </div>

          {/* Прогресс загрузки файлов */}
          {uploadPct !== null && (
            <div className="h-1 w-full bg-[var(--color-bg-soft)]">
              <div
                className="h-full bg-[var(--color-primary)] transition-[width] duration-200"
                style={{ width: `${uploadPct}%` }}
              />
            </div>
          )}

          {/* Итог загрузки: что загружено / какие файлы не приняты */}
          {uploadNote && (
            <div
              className={`flex items-center justify-between border-b px-4 py-2 text-sm ${
                uploadNote.ok
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-amber-200 bg-amber-50 text-amber-800"
              }`}
            >
              <span className="min-w-0 flex-1 truncate" title={uploadNote.text}>{uploadNote.text}</span>
              <button onClick={() => setUploadNote(null)} className="ml-3 shrink-0 text-xs underline">
                закрыть
              </button>
            </div>
          )}

          {/* Подсказка раздела */}
          {folder?.hint && path.split("/").length <= 1 && (
            <p className="border-b border-[var(--color-border)] bg-[#fffbea] px-4 py-1.5 text-xs text-[#8a6d1d]">
              {folder.hint}
            </p>
          )}

          {/* Содержимое (сюда же можно перетащить файлы с диска) */}
          <div
            data-dropzone="files"
            className={`relative min-h-[380px] flex-1 overflow-auto ${dragOver ? "z-10 outline-2 -outline-offset-2 outline-dashed outline-[var(--color-primary)]" : ""}`}
            onDragOver={(e) => {
              if (!path || uploadPct !== null) return;
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={(e) => {
              if (e.currentTarget === e.target) setDragOver(false);
            }}
            onDrop={(e) => {
              if (!path) return;
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files?.length) void uploadFiles(e.dataTransfer.files);
            }}
            onContextMenu={(ev) => {
              ev.preventDefault();
              openMenuAt(ev.clientX, ev.clientY, null);
            }}
          >
            {dragOver && (
              <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-[var(--color-primary)]/5">
                <p className="rounded-full bg-white px-4 py-2 text-sm font-medium text-[var(--color-primary)] shadow-md">
                  Отпустите, чтобы загрузить файлы в эту папку
                </p>
              </div>
            )}
            {loading ? (
              <p className="px-4 py-10 text-center text-sm text-[var(--color-muted)]">
                Загрузка…
              </p>
            ) : visible.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-[var(--color-muted)]">
                {filter ? "Ничего не найдено по запросу" : "Эта папка пуста"}
              </p>
            ) : view === "details" ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] text-left text-[11px] uppercase tracking-wide text-[var(--color-muted)]">
                    <th
                      onClick={() => sortBy("name")}
                      className="cursor-pointer px-3 py-2 font-semibold select-none hover:text-[var(--color-body)]"
                    >
                      Имя <SortMark on={sortKey === "name"} dir={sortDir} />
                    </th>
                    <th
                      onClick={() => sortBy("mtime")}
                      className="hidden cursor-pointer px-3 py-2 font-semibold select-none hover:text-[var(--color-body)] md:table-cell"
                    >
                      Дата изменения <SortMark on={sortKey === "mtime"} dir={sortDir} />
                    </th>
                    <th className="hidden px-3 py-2 font-semibold sm:table-cell">Тип</th>
                    <th
                      onClick={() => sortBy("size")}
                      className="cursor-pointer px-3 py-2 text-right font-semibold select-none hover:text-[var(--color-body)]"
                    >
                      Размер <SortMark on={sortKey === "size"} dir={sortDir} />
                    </th>
                    <th className="px-3 py-2 text-right font-semibold">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((e) => {
                    const entryPath = joinPath(path, e.key ?? e.name);
                    return (
                      <tr
                        key={e.key ?? e.name}
                        className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-bg-soft)]"
                        onContextMenu={(ev) => {
                          ev.preventDefault();
                          ev.stopPropagation();
                          openMenuAt(ev.clientX, ev.clientY, e);
                        }}
                        onTouchStart={(ev) => startLongPress(ev, e)}
                        onTouchMove={cancelLongPress}
                        onTouchEnd={cancelLongPress}
                        onTouchCancel={cancelLongPress}
                        onClickCapture={(ev) => {
                          if (lpFiredRef.current) {
                            lpFiredRef.current = false;
                            ev.stopPropagation();
                          }
                        }}
                      >
                        <td className="max-w-[360px] px-3 py-2">
                          <button
                            type="button"
                            onClick={() => (e.type === "dir" ? open(e.key ?? entryPath) : downloadFile(e))}
                            className="flex min-w-0 items-center gap-2 text-left"
                            title={e.type === "dir" ? "Открыть папку" : "Скачать файл"}
                          >
                            <EntryGlyph entry={e} />
                            <span className="truncate font-medium text-[var(--color-heading)] hover:text-[var(--color-primary)] hover:underline">
                              {e.name}
                            </span>
                          </button>
                        </td>
                        <td className="hidden px-3 py-2 text-[var(--color-muted)] md:table-cell">
                          {humanDate(e.mtime)}
                        </td>
                        <td className="hidden px-3 py-2 text-[var(--color-body)] sm:table-cell">
                          {typeLabel(e)}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap text-[var(--color-body)]">
                          {e.type === "dir" ? (e.size > 0 ? humanSize(e.size) : "—") : humanSize(e.size)}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {e.type === "file" && (
                            <button
                              type="button"
                              onClick={() => downloadFile(e)}
                              className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-medium text-[var(--color-body)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                            >
                              скачать
                            </button>
                          )}
                          {e.deletable && (
                            <button
                              type="button"
                              onClick={() => {
                                setRenameName(e.name);
                                setRenameFor(e);
                              }}
                              disabled={busy === entryPath}
                              className="ml-1.5 rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-medium text-[var(--color-body)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:opacity-50"
                            >
                              переим.
                            </button>
                          )}
                          {e.deletable && (
                            <button
                              type="button"
                              onClick={() => removeEntry(e)}
                              disabled={busy === entryPath}
                              className="ml-1.5 rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                            >
                              {busy === entryPath ? "…" : "удалить"}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              const r = ev.currentTarget.getBoundingClientRect();
                              openMenuAt(r.left, r.bottom + 4, e);
                            }}
                            title="Ещё действия (меню)"
                            aria-label="Ещё действия"
                            className="ml-1.5 rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-medium text-[var(--color-body)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                          >
                            ⋯
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-1 p-3">
                {visible.map((e) => {
                  const entryPath = joinPath(path, e.key ?? e.name);
                  return (
                    <div
                      key={e.key ?? e.name}
                      className="group relative rounded-lg border border-transparent p-2 hover:border-[var(--color-border)] hover:bg-[var(--color-bg-soft)]"
                      onContextMenu={(ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        openMenuAt(ev.clientX, ev.clientY, e);
                      }}
                      onTouchStart={(ev) => startLongPress(ev, e)}
                      onTouchMove={cancelLongPress}
                      onTouchEnd={cancelLongPress}
                      onTouchCancel={cancelLongPress}
                      onClickCapture={(ev) => {
                        if (lpFiredRef.current) {
                          lpFiredRef.current = false;
                          ev.stopPropagation();
                        }
                      }}
                    >
                      {e.deletable && (
                        <button
                          type="button"
                          onClick={() => {
                            setRenameName(e.name);
                            setRenameFor(e);
                          }}
                          disabled={busy === entryPath}
                          title="Переименовать"
                          className="absolute top-1 right-6 hidden rounded-md px-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-primary)] group-hover:block"
                        >
                          ✎
                        </button>
                      )}
                      {e.deletable && (
                        <button
                          type="button"
                          onClick={() => removeEntry(e)}
                          disabled={busy === entryPath}
                          title="Удалить"
                          className="absolute top-1 right-1 hidden rounded-md px-1 text-xs text-[var(--color-muted)] hover:text-red-600 group-hover:block"
                        >
                          ✕
                        </button>
                      )}
                      {!e.deletable && (
                        <button
                          type="button"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            const r = ev.currentTarget.getBoundingClientRect();
                            openMenuAt(r.left, r.bottom + 4, e);
                          }}
                          title="Действия (меню)"
                          aria-label="Действия"
                          className="absolute top-1 right-1 hidden rounded-md bg-white/80 px-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-primary)] group-hover:block"
                        >
                          ⋯
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => (e.type === "dir" ? open(e.key ?? entryPath) : downloadFile(e))}
                        className="flex w-full flex-col items-center gap-1.5"
                        title={e.type === "dir" ? "Открыть папку" : "Скачать файл"}
                      >
                        <EntryGlyph entry={e} big />
                        <span className="line-clamp-2 text-center text-xs leading-tight text-[var(--color-heading)]">
                          {e.name}
                        </span>
                        <span className="text-[10px] text-[var(--color-muted)]">
                          {e.type === "dir"
                            ? "Папка"
                            : humanSize(e.size)}
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Статусная строка */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border)] px-4 py-2 text-xs text-[var(--color-muted)]">
            <span>
              Элементов: {visible.length}
              {folder && folder.files_count > 0 && ` · файлов: ${folder.files_count}`}
              {folder && folder.total_size > 0 && ` · ${humanSize(folder.total_size)}`}
            </span>
            <span>
              {folder?.deletable
                ? "Раздел доступен для удаления"
                : path
                  ? "Раздел только для просмотра"
                  : ""}
            </span>
          </div>
        </div>
      </div>

      {/* ── Модалка: создать папку ── */}
      {mkdirOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Закрыть"
            onClick={() => setMkdirOpen(false)}
            className="absolute inset-0 bg-black/30"
          />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void createFolder();
            }}
            className="relative w-full max-w-sm rounded-[var(--radius-card)] bg-white p-6 shadow-xl"
          >
            <h3 className="mb-1 text-lg font-semibold text-[var(--color-heading)]">
              Новая папка
            </h3>
            <p className="mb-4 text-xs text-[var(--color-muted)]">
              В «{folder?.title ?? path}»
            </p>
            <input
              autoFocus
              value={mkdirName}
              onChange={(e) => setMkdirName(e.target.value)}
              placeholder="Например: Наборы 2027"
              className="mb-4 w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setMkdirOpen(false)}
                className="rounded-lg px-4 py-2 text-sm text-[var(--color-body)] hover:bg-[var(--color-bg-soft)]"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={mkdirBusy || !mkdirName.trim()}
                className="rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
              >
                {mkdirBusy ? "Создаём…" : "Создать"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Модалка: переименовать ── */}
      {renameFor && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Закрыть"
            onClick={() => setRenameFor(null)}
            className="absolute inset-0 bg-black/30"
          />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void renameEntry();
            }}
            className="relative w-full max-w-sm rounded-[var(--radius-card)] bg-white p-6 shadow-xl"
          >
            <h3 className="mb-1 text-lg font-semibold text-[var(--color-heading)]">
              Переименовать
            </h3>
            <p className="mb-4 text-xs text-[var(--color-muted)]">
              {renameFor.type === "dir" ? "Папку" : "Файл"} «{renameFor.name}»
            </p>
            <input
              autoFocus
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              className="mb-4 w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRenameFor(null)}
                className="rounded-lg px-4 py-2 text-sm text-[var(--color-body)] hover:bg-[var(--color-bg-soft)]"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={renameBusy || !renameName.trim()}
                className="rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
              >
                {renameBusy ? "Сохраняем…" : "Переименовать"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Модалка: подтверждение удаления (с «Не показывать больше») ── */}
      {deleteFor && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Закрыть"
            onClick={() => setDeleteFor(null)}
            className="absolute inset-0 bg-black/30"
          />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              confirmRemoveEntry();
            }}
            className="relative w-full max-w-sm rounded-[var(--radius-card)] bg-white p-6 shadow-xl"
          >
            <h3 className="mb-1 text-lg font-semibold text-[var(--color-heading)]">
              Удалить?
            </h3>
            <p className="mb-4 text-sm text-[var(--color-body)]">
              {deleteFor.type === "dir" ? "Папку" : "Файл"} «{deleteFor.name}»
              {deleteFor.type === "dir" ? " и всё её содержимое" : ""}.
              <span className="block text-xs text-[var(--color-muted)]">Действие необратимо.</span>
            </p>
            <label className="mb-4 flex cursor-pointer items-start gap-2.5 rounded-lg bg-[var(--color-bg-soft)] px-3 py-2.5 select-none">
              <input
                type="checkbox"
                checked={deleteDontAsk}
                onChange={(e) => setDeleteDontAsk(e.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-[var(--color-primary)]"
              />
              <span className="text-sm text-[var(--color-body)]">
                Не показывать больше
                <span className="mt-0.5 block text-xs leading-snug text-[var(--color-muted)]">
                  Удалять сразу, без этого окна. Вернуть вопрос можно кнопкой-щитом на панели
                  инструментов.
                </span>
              </span>
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteFor(null)}
                className="rounded-lg px-4 py-2 text-sm text-[var(--color-body)] hover:bg-[var(--color-bg-soft)]"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={deleteBusy}
                className="rounded-[var(--radius-btn)] bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {deleteBusy ? "Удаляем…" : "Удалить"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Контекстное меню (ПКМ / долгий тап / «⋯») ── */}
      {menu && (
        <div
          ref={menuRef}
          role="menu"
          className="fixed z-[95] min-w-[224px] max-w-[280px] overflow-hidden rounded-xl border border-[var(--color-border)] bg-white py-1 shadow-2xl"
          style={{ left: menuPos.x, top: menuPos.y }}
          onContextMenu={(ev) => ev.preventDefault()}
        >
          {menu.entry && (
            <p
              className="max-w-full truncate border-b border-[var(--color-border)] px-3 pb-1.5 pt-1.5 text-[11px] font-medium text-[var(--color-muted)]"
              title={menu.entry.name}
            >
              {typeLabel(menu.entry)} · {menu.entry.name}
            </p>
          )}
          {menu.items.map((it) =>
            it.sep ? (
              <div key={it.key} className="my-1 border-t border-[var(--color-border)]" />
            ) : (
              <button
                key={it.key}
                type="button"
                role="menuitem"
                disabled={it.disabled}
                onClick={() => {
                  setMenu(null);
                  it.action?.();
                }}
                className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] transition disabled:pointer-events-none disabled:opacity-40 ${
                  it.danger
                    ? "text-red-600 hover:bg-red-50"
                    : "text-[var(--color-body)] hover:bg-[var(--color-bg-soft)] hover:text-[var(--color-heading)]"
                }`}
              >
                <MenuIcon d={it.icon} />
                <span className="truncate">{it.label}</span>
              </button>
            ),
          )}
        </div>
      )}

      {/* ── Модалка: свойства файла/папки ── */}
      {propsInfo && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Закрыть"
            onClick={() => setPropsInfo(null)}
            className="absolute inset-0 bg-black/30"
          />
          <div className="relative w-full max-w-md rounded-[var(--radius-card)] bg-white p-6 shadow-xl">
            <h3 className="mb-4 flex items-center gap-2.5 text-lg font-semibold text-[var(--color-heading)]">
              <EntryGlyph entry={propsInfo.entry} big />
              <span className="min-w-0 flex-1 break-all text-base leading-snug">{propsInfo.entry.name}</span>
            </h3>
            <dl className="mb-5 space-y-2.5 text-sm">
              <div className="flex gap-3">
                <dt className="w-32 shrink-0 text-[var(--color-muted)]">Тип</dt>
                <dd className="min-w-0 flex-1 text-[var(--color-body)]">{propsInfo.kind}</dd>
              </div>
              <div className="flex gap-3">
                <dt className="w-32 shrink-0 text-[var(--color-muted)]">Расположение</dt>
                <dd className="min-w-0 flex-1 break-all text-[var(--color-body)]">{propsInfo.pathDisplay}</dd>
              </div>
              <div className="flex gap-3">
                <dt className="w-32 shrink-0 text-[var(--color-muted)]">Размер</dt>
                <dd className="min-w-0 flex-1 text-[var(--color-body)]">
                  {propsInfo.size}
                  {propsInfo.filesCount !== undefined && propsInfo.filesCount > 0
                    ? ` · файлов: ${propsInfo.filesCount}`
                    : ""}
                </dd>
              </div>
              <div className="flex gap-3">
                <dt className="w-32 shrink-0 text-[var(--color-muted)]">Изменён</dt>
                <dd className="min-w-0 flex-1 text-[var(--color-body)]">{propsInfo.mtime}</dd>
              </div>
              {propsInfo.publicUrl && (
                <div className="flex gap-3">
                  <dt className="w-32 shrink-0 text-[var(--color-muted)]">Ссылка</dt>
                  <dd className="flex min-w-0 flex-1 items-center gap-2">
                    <span
                      className="min-w-0 flex-1 truncate text-[var(--color-body)]"
                      title={propsInfo.publicUrl}
                    >
                      {propsInfo.publicUrl}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const url = propsInfo.publicUrl ?? "";
                        void copyText(url).then((ok) =>
                          setUploadNote({
                            ok,
                            text: ok ? "Ссылка скопирована" : "Не удалось скопировать ссылку",
                          }),
                        );
                      }}
                      className="shrink-0 rounded-md border border-[var(--color-border)] px-2 py-0.5 text-xs font-medium text-[var(--color-body)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                    >
                      Копировать
                    </button>
                  </dd>
                </div>
              )}
              <div className="flex gap-3">
                <dt className="w-32 shrink-0 text-[var(--color-muted)]">Действия</dt>
                <dd className="min-w-0 flex-1 text-[var(--color-body)]">
                  {propsInfo.deletable
                    ? "переименование и удаление разрешены"
                    : "только просмотр — раздел защищён от изменений"}
                </dd>
              </div>
            </dl>
            <div className="flex justify-end gap-2">
              {propsInfo.entry.type === "dir" ? (
                <button
                  type="button"
                  onClick={() => {
                    const en = propsInfo.entry;
                    setPropsInfo(null);
                    open(en.key ?? joinPath(path, en.name));
                  }}
                  className="rounded-lg px-4 py-2 text-sm text-[var(--color-body)] hover:bg-[var(--color-bg-soft)]"
                >
                  Открыть
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    const en = propsInfo.entry;
                    setPropsInfo(null);
                    downloadFile(en);
                  }}
                  className="rounded-lg px-4 py-2 text-sm text-[var(--color-body)] hover:bg-[var(--color-bg-soft)]"
                >
                  Скачать
                </button>
              )}
              <button
                type="button"
                onClick={() => setPropsInfo(null)}
                className="rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--color-primary-hover)]"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Мобильное дерево ── */}
      {showSidebar && (
        <div className="fixed inset-0 z-[90] md:hidden">
          <button
            type="button"
            aria-label="Закрыть"
            onClick={() => setShowSidebar(false)}
            className="absolute inset-0 bg-black/30"
          />
          <div className="absolute inset-y-0 left-0 w-64 overflow-y-auto border-r border-[var(--color-border)] bg-white p-3 shadow-xl">
            <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
              Папки
            </p>
            <TreeRow
              depth={0}
              label="Файлы"
              icon="home"
              active={path === ""}
              onClick={() => open("")}
              expandable={false}
            />
            {roots.map((s) => (
              <TreeBranch
                key={s.key ?? s.name}
                entry={s}
                basePath={s.key ?? ""}
                depth={1}
                activePath={path}
                treeOpen={treeOpen}
                onToggle={toggleTreeNode}
                onOpen={open}
                apiUrl={apiUrl}
                treeVersion={treeVersion}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );

  function toggleTreeNode(p: string) {
    setTreeOpen((st) => ({ ...st, [p]: !st[p] }));
  }
}

/* ── Вспомогательные компоненты ── */

/* Иконки пунктов контекстного меню (контурные, 24×24) */
const ICONS = {
  open: "M3 7a2 2 0 0 1 2-2h4.2l1.9 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z M12 10.5V16 M9.8 13.8 12 16l2.2-2.2",
  ext: "M14 4h6v6 M20 4 11 13 M19 13.5V19a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5.5",
  download: "M12 4v11 M7.5 11 12 15.5 16.5 11 M5 20h14",
  link: "M9.5 14.5 14.5 9.5 M8 12l-2.2 2.2a3.8 3.8 0 0 0 5.4 5.4l2.2-2.2 M16 12l2.2-2.2a3.8 3.8 0 0 0-5.4-5.4L10.6 6.6",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M12 11v5 M12 7.5v.01",
  pencil: "M17 3.5a2.3 2.3 0 0 1 3.3 3.3L7.5 19.5 3 21l1.5-4.5L17 3.5Z",
  trash: "M4 6.5h16 M9 6.5V4.5h6v2 M6 6.5l1 13.5h10l1-13.5 M10 10.5v6 M14 10.5v6",
  refresh: "M17 8a7 7 0 1 0 2 5 M19 4v5h-5",
  upload: "M12 16V4 M6.5 9.5 12 4l5.5 5.5 M4 20h16",
  folderPlus:
    "M3 6.5A1.5 1.5 0 0 1 4.5 5h4.6l2 2.2h8.4A1.5 1.5 0 0 1 21 8.7v9.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5v-12Z M12 10.5v5 M9.5 13h5",
} as const;

/* Пункт контекстного меню (или разделитель) */
interface CtxItem {
  key: string;
  label: string;
  icon: string;
  sep?: boolean;
  danger?: boolean;
  disabled?: boolean;
  action?: () => void;
}

function MenuIcon({ d }: { d: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0 opacity-70"
    >
      <path d={d} />
    </svg>
  );
}

function ToolButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="rounded-md border border-[var(--color-border)] bg-white p-1.5 text-[var(--color-body)] transition hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:cursor-default disabled:opacity-35 disabled:hover:border-[var(--color-border)] disabled:hover:text-[var(--color-body)]"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {children}
      </svg>
    </button>
  );
}

function SortMark({ on, dir }: { on: boolean; dir: 1 | -1 }) {
  if (!on) return null;
  return <span className="ml-0.5 text-[9px]">{dir === 1 ? "▲" : "▼"}</span>;
}

function ViewToggle({
  view,
  onChange,
}: {
  view: "details" | "tiles";
  onChange: (v: "details" | "tiles") => void;
}) {
  const cls = (active: boolean) =>
    `rounded-md border p-1.5 ${
      active
        ? "border-[var(--color-primary)] text-[var(--color-primary)] bg-[var(--color-bg-soft)]"
        : "border-[var(--color-border)] text-[var(--color-body)] hover:border-[var(--color-primary)]"
    }`;
  return (
    <div className="flex items-center gap-1">
      <button type="button" title="Подробности" aria-label="Вид: список" onClick={() => onChange("details")} className={cls(view === "details")}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <button type="button" title="Значки" aria-label="Вид: значки" onClick={() => onChange("tiles")} className={cls(view === "tiles")}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <rect x="4" y="4" width="7" height="7" rx="1" />
          <rect x="13" y="4" width="7" height="7" rx="1" />
          <rect x="4" y="13" width="7" height="7" rx="1" />
          <rect x="13" y="13" width="7" height="7" rx="1" />
        </svg>
      </button>
    </div>
  );
}

function TreeRow({
  depth,
  label,
  active,
  onClick,
  expandable,
  expanded,
  onToggle,
  icon,
}: {
  depth: number;
  label: string;
  active: boolean;
  onClick: () => void;
  expandable: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  icon?: "home" | "folder";
}) {
  return (
    <div
      className={`flex items-center gap-1 rounded-md pr-2 hover:bg-white ${active ? "bg-white shadow-sm" : ""}`}
      style={{ paddingLeft: 4 + depth * 14 }}
    >
      {expandable ? (
        <button
          type="button"
          onClick={onToggle}
          className="grid size-5 shrink-0 place-items-center text-[var(--color-muted)] hover:text-[var(--color-body)]"
          aria-label={expanded ? "Свернуть" : "Развернуть"}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
            <path
              d={expanded ? "M2 3.5l3 3 3-3" : "M3.5 2l3 3-3 3"}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
      ) : (
        <span className="size-5 shrink-0" />
      )}
      <button
        type="button"
        onClick={onClick}
        className={`flex min-w-0 items-center gap-1.5 py-1.5 text-left text-[13px] ${
          active ? "font-semibold text-[var(--color-primary)]" : "text-[var(--color-body)]"
        }`}
      >
        {icon === "home" ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 11l9-8 9 8M5 10v10h14V10" />
          </svg>
        ) : (
          <FolderGlyph />
        )}
        <span className="truncate">{label}</span>
      </button>
    </div>
  );
}

function TreeBranch({
  entry,
  basePath,
  depth,
  activePath,
  treeOpen,
  onToggle,
  onOpen,
  apiUrl,
  treeVersion,
}: {
  entry: Entry;
  basePath: string; // путь этой ветки
  depth: number;
  activePath: string;
  treeOpen: Record<string, boolean>;
  onToggle: (p: string) => void;
  onOpen: (p: string) => void;
  apiUrl: string;
  treeVersion: number;
}) {
  const p = basePath;
  const expanded = !!treeOpen[p];
  const [kids, setKids] = useState<Entry[] | null>(null);

  useEffect(() => {
    if (!expanded) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(
          `${apiUrl}/admin/files${p ? `?path=${encodeURIComponent(p)}` : ""}`,
          { credentials: "include", cache: "no-store" },
        );
        if (!res.ok) return;
        const json = await res.json();
        if (alive)
          setKids(
            ((json.data?.entries ?? []) as Entry[]).filter((e) => e.type === "dir"),
          );
      } catch {
        /* молча — дерево необязательно */
      }
    })();
    return () => {
      alive = false;
    };
  }, [expanded, p, apiUrl, treeVersion]);

  return (
    <>
      <TreeRow
        depth={depth}
        label={SECTION_TITLES[entry.name] ?? entry.name}
        active={activePath === p}
        onClick={() => onOpen(p)}
        expandable
        expanded={expanded}
        onToggle={() => onToggle(p)}
      />
      {expanded &&
        (kids ?? []).map((k) => (
          <TreeRow
            key={k.name}
            depth={depth + 1}
            label={k.name}
            active={activePath === `${p}/${k.name}`}
            onClick={() => onOpen(`${p}/${k.name}`)}
            expandable={false}
          />
        ))}
    </>
  );
}

function FolderGlyph({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.6l2 2.2h8.4A1.5 1.5 0 0 1 21 8.7v9.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5v-12Z"
        fill="#f0b429"
        opacity="0.25"
      />
      <path
        d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.6l2 2.2h8.4A1.5 1.5 0 0 1 21 8.7v9.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5v-12Z"
        fill="none"
        stroke="#d99b0d"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EntryGlyph({ entry, big }: { entry: Entry; big?: boolean }) {
  const size = big ? 40 : 16;
  if (entry.type === "dir") return <FolderGlyph size={size} />;

  const ext = entry.ext ?? "";
  let color = "#9a9a99";
  if (ext === "zip") color = "#b5651d";
  else if (["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(ext)) color = "#3b82f6";
  else if (["mp4", "mov", "webm", "avi"].includes(ext)) color = "#8b5cf6";
  else if (["csv", "xls", "xlsx"].includes(ext)) color = "#16a34a";

  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden style={{ flexShrink: 0 }}>
      <path
        d="M5 2.5h6.2L15 6.3V17a.9.9 0 0 1-.9.9H5.9A.9.9 0 0 1 5 17V3.4c0-.5.4-.9.9-.9Z"
        fill={color}
        opacity="0.16"
      />
      <path
        d="M5 2.5h6.2L15 6.3V17a.9.9 0 0 1-.9.9H5.9A.9.9 0 0 1 5 17V3.4c0-.5.4-.9.9-.9Z M11.2 2.5v3.8H15"
        fill="none"
        stroke={color}
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      {big && (
        <text x="10" y="14.5" textAnchor="middle" fontSize="5.5" fontWeight="700" fill={color}>
          {(ext || "?").toUpperCase().slice(0, 4)}
        </text>
      )}
    </svg>
  );
}
