"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { uploadFileInChunks } from "@/lib/chunked-upload";
import { useDownloads } from "@/components/admin/downloads/Downloads";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";

interface VersionInfo {
  version?: string | null;
  built_at?: string | null;
  type?: string | null;
  git?: string | null;
}

interface LastUpdate {
  applied_at?: string | null;
  mode?: string | null;
  kind?: string | null;
  files?: number | null;
  failed?: number | null;
  version?: string | null;
  built_at?: string | null;
  source?: string | null;
}

interface UpdateStatus {
  mode: "deployed" | "staging" | "none";
  version: VersionInfo | null;
  last_update: LastUpdate | null;
  last_media_sync?: LastUpdate | null;
}

interface ApplyResult {
  ok: boolean;
  applied_at: string;
  mode: string;
  media_sync?: boolean;
  files: number;
  failed: number;
  failed_list?: string[];
  version?: string | null;
  built_at?: string | null;
  skipped_media: number;
  skipped_protected: number;
}

interface DeployArchiveInfo {
  exists: boolean;
  name?: string;
  size?: number;
  mtime?: number;
  sha256?: string | null;
  snapshots?: SnapshotInfo[];
}

interface SnapshotInfo {
  name: string;
  size: number;
  mtime: number;
}

interface SnapshotResult {
  ok: boolean;
  name: string;
  size: number;
  files: number;
  skipped?: number;
  bytes?: number;
  duration_s?: number;
  sha256?: string | null;
}

interface GhRelease {
  tag: string;
  name?: string | null;
  published_at?: string | null;
  html_url?: string | null;
  notes?: string | null;
}

interface GhAsset {
  name: string;
  version: string;
  size: number;
  sha256?: string | null;
}

interface GithubCheck {
  mode: string;
  repo: string;
  current_version?: string | null;
  cached?: boolean;
  stale?: boolean;
  warning?: string | null;
  message?: string | null;
  release?: GhRelease | null;
  asset?: GhAsset | null;
  update_available?: boolean;
}

const cardCls =
  "rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-card)] p-5";
const labelCls = "text-sm text-[var(--color-muted)]";
const valueCls = "text-sm font-medium text-[var(--color-heading)]";

function fmtDate(v?: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" });
}

function humanSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return (bytes / 1024 ** 3).toFixed(2) + " ГБ";
  if (bytes >= 1024 ** 2) return (bytes / 1024 ** 2).toFixed(1) + " МБ";
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + " КБ";
  return Math.round(bytes) + " Б";
}

/**
 * Вкладка «Обновление» (Настройки): загрузка архива обновления сайта.
 * Архив собирается в песочнице: MODE=update bash scripts/build-static.sh.
 * Обновляет функционал (страницы, стили, скрипты, PHP), НЕ трогает
 * медиа (uploads/) и базу данных (заказы, настройки SMTP).
 *
 * МЕДИА-АРХИВ (task 113): lakomka-media-*.zip (MODE=media) применяется тем же
 * входом, но в обратном режиме — дозаливает ТОЛЬКО uploads/**: картинки и видео
 * товаров, добавленные после первичного деплоя, попадают на сервер без
 * пересборки страниц (иначе — сотни 404 на витрине).
 */
export function SiteUpdateTab() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<"idle" | "uploading" | "applying" | "done">("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [deploy, setDeploy] = useState<DeployArchiveInfo | null>(null);
  const [deployLoading, setDeployLoading] = useState(true);
  const [deployError, setDeployError] = useState<string | null>(null);
  const { start: startDownload } = useDownloads();

  /* Task 114: снапшот текущего сайта */
  const [snapBusy, setSnapBusy] = useState(false);
  const [snapResult, setSnapResult] = useState<SnapshotResult | null>(null);
  const [snapError, setSnapError] = useState<string | null>(null);

  const [gh, setGh] = useState<GithubCheck | null>(null);
  const [ghChecking, setGhChecking] = useState(false);
  const [ghError, setGhError] = useState<string | null>(null);
  const [ghBusy, setGhBusy] = useState(false);
  const [ghStage, setGhStage] = useState<"idle" | "downloading" | "applying">("idle");
  const [ghDone, setGhDone] = useState<ApplyResult | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/admin/site-update`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Не удалось получить статус");
      setLoadError(null);
      setStatus(json.data as UpdateStatus);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Ошибка сети");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadStatus);
  }, [loadStatus]);

  const loadDeploy = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/admin/site-update/deploy-archive`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Не удалось получить сведения об архиве");
      setDeployError(null);
      setDeploy(json.data as DeployArchiveInfo);
    } catch (e) {
      setDeployError(e instanceof Error ? e.message : "Ошибка сети");
    } finally {
      setDeployLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadDeploy);
  }, [loadDeploy]);

  function startDeployDownload() {
    if (!deploy?.exists || !deploy.name) return;
    startDownload({
      url: `${API_URL}/admin/site-update/deploy-archive/download`,
      name: deploy.name,
    });
  }

  /* ── Task 114: снапшот текущего сайта ── */
  async function createSnapshot() {
    const ok = window.confirm(
      "Собрать деплой-архив из ТЕКУЩЕГО состояния сайта?\n\n" +
      "В архив войдёт всё, что сейчас на сервере: витрина, backend, медиа и база данных.\n" +
      "На слабом хостинге это может занять несколько минут — окно можно закрыть и работать дальше."
    );
    if (!ok) return;
    setSnapBusy(true);
    setSnapError(null);
    setSnapResult(null);
    try {
      const res = await fetch(`${API_URL}/admin/site-update/deploy-archive/create`, {
        method: "POST",
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSnapError(json.error ?? `Ошибка ${res.status}`);
        return;
      }
      setSnapResult(json.data as SnapshotResult);
      await loadDeploy();
    } catch {
      setSnapError("Ошибка сети");
    } finally {
      setSnapBusy(false);
    }
  }

  async function deleteSnapshot(name: string) {
    if (!window.confirm(`Удалить снапшот ${name}? Файл будет стёрт с сервера безвозвратно.`)) return;
    setSnapError(null);
    try {
      const res = await fetch(`${API_URL}/admin/site-update/deploy-archive/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSnapError(json.error ?? `Ошибка ${res.status}`);
        return;
      }
      if (snapResult?.name === name) setSnapResult(null);
      await loadDeploy();
    } catch {
      setSnapError("Ошибка сети");
    }
  }

  function downloadSnapshot(name: string) {
    startDownload({
      url: `${API_URL}/admin/site-update/deploy-archive/download?name=${encodeURIComponent(name)}`,
      name,
    });
  }

  const checkGithub = useCallback(async () => {
    setGhChecking(true);
    setGhError(null);
    setGh(null);
    setGhDone(null);
    try {
      const res = await fetch(`${API_URL}/admin/site-update/github-check?fresh=1`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Не удалось проверить GitHub");
      setGh(json.data as GithubCheck);
    } catch (e) {
      setGhError(e instanceof Error ? e.message : "Ошибка сети");
    } finally {
      setGhChecking(false);
    }
  }, []);

  async function installGithub() {
    if (!gh?.asset || !gh.release) return;
    const ok = window.confirm(
      `Скачать и установить обновление ${gh.asset.version} с GitHub?\n\nФайлы сайта будут перезаписаны. Медиа и база данных (заказы, товары, настройки) останутся без изменений.`
    );
    if (!ok) return;

    setGhError(null);
    setGhDone(null);
    setGhBusy(true);
    try {
      setGhStage("downloading");
      const res = await fetch(`${API_URL}/admin/site-update/github-download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tag: gh.release.tag, asset: gh.asset.name, sha256: gh.asset.sha256 ?? undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Не удалось скачать обновление с GitHub");
      const dl = json.data as { file_name: string; version?: string };

      setGhStage("applying");
      const res2 = await fetch(`${API_URL}/admin/site-update/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ file_name: dl.file_name }),
      });
      const json2 = await res2.json();
      if (!res2.ok) throw new Error(json2.error ?? "Не удалось применить обновление");
      setGhDone(json2.data as ApplyResult);
      setGh(null);
      loadStatus();
    } catch (e) {
      setGhError(e instanceof Error ? e.message : "Ошибка сети");
    } finally {
      setGhBusy(false);
      setGhStage("idle");
    }
  }

  const mode = status?.mode ?? "none";
  const busy = phase === "uploading" || phase === "applying";

  async function applyUpdate() {
    if (!file) return;
    setError(null);
    setResult(null);

    // lakomka-media-*.zip применяется в обратном режиме — только uploads/**
    const isMedia = /^lakomka-media-.*\.zip$/i.test(file.name);
    const ok = window.confirm(
      isMedia
        ? "Применить МЕДИА-архив?\n\nНа сервер будут добавлены/перезаписаны только файлы картинок и видео (uploads/). Страницы, скрипты и база данных (заказы, товары, настройки) останутся без изменений."
        : "Применить обновление сайта?\n\nФайлы сайта (страницы, стили, скрипты, PHP) будут перезаписаны. Медиа и база данных (заказы, товары, настройки) останутся без изменений."
    );
    if (!ok) return;

    setPhase("uploading");
    setProgress(0);
    try {
      const uploaded = await uploadFileInChunks(file, (pct) => setProgress(pct));
      setPhase("applying");
      const res = await fetch(`${API_URL}/admin/site-update/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ file_name: uploaded.filePath }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Не удалось применить обновление");
      setResult(json.data as ApplyResult);
      setPhase("done");
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      loadStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сети");
      setPhase("idle");
    }
  }

  const modeBadge =
    mode === "deployed"
      ? { cls: "bg-green-100 text-green-800 border-green-200", text: "Развёрнутый сайт — обновление применится прямо здесь" }
      : mode === "staging"
        ? { cls: "bg-amber-100 text-amber-800 border-amber-200", text: "Тестовый стенд песочницы (backend/UPDATE_ROOT)" }
        : { cls: "bg-red-100 text-red-800 border-red-200", text: "Статический сайт не обнаружен — обновление недоступно" };

  return (
    <div className="space-y-5">
      {/* статус */}
      <div className={cardCls}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-medium text-[var(--color-heading)]">Текущий сайт</h2>
          <button
            type="button"
            onClick={loadStatus}
            disabled={loading}
            className="text-sm text-[var(--color-primary)] hover:underline disabled:opacity-50"
          >
            {loading ? "обновляем…" : "обновить"}
          </button>
        </div>

        {loadError ? (
          <p className="text-sm text-red-600">{loadError}</p>
        ) : (
          <>
            <span className={`inline-block rounded-full border px-3 py-1 text-xs font-medium ${modeBadge.cls}`}>
              {modeBadge.text}
            </span>
            <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <dt className={labelCls}>Версия пакета</dt>
                <dd className={valueCls}>{status?.version?.version ?? "неизвестна (пакет до введения версий)"}</dd>
              </div>
              <div>
                <dt className={labelCls}>Собран</dt>
                <dd className={valueCls}>{fmtDate(status?.version?.built_at)}</dd>
              </div>
              <div>
                <dt className={labelCls}>Последнее обновление</dt>
                <dd className={valueCls}>
                  {status?.last_update
                    ? `${fmtDate(status.last_update.applied_at)} · файлов: ${status.last_update.files ?? "?"}${
                        status.last_update.version ? ` · версия ${status.last_update.version}` : ""
                      }`
                    : "обновлений ещё не было"}
                </dd>
              </div>
              <div>
                <dt className={labelCls}>Последний медиа-синк</dt>
                <dd className={valueCls}>
                  {status?.last_media_sync
                    ? `${fmtDate(status.last_media_sync.applied_at)} · файлов: ${status.last_media_sync.files ?? "?"}${
                        status.last_media_sync.version ? ` · версия ${status.last_media_sync.version}` : ""
                      }`
                    : "медиа ещё не досылались"}
                </dd>
              </div>
              <div>
                <dt className={labelCls}>Сборка (git)</dt>
                <dd className={valueCls}>{status?.version?.git ?? "—"}</dd>
              </div>
            </dl>
          </>
        )}
      </div>

      {/* обновление с GitHub */}
      <div className={cardCls}>
        <h2 className="mb-1 font-medium text-[var(--color-heading)]">Обновление с GitHub</h2>
        <p className="mb-4 text-sm text-[var(--color-muted)]">
          Сайт проверит последний релиз в репозитории{" "}
          <code>github.com/{gh?.repo ?? "Sayikoro/lakomka"}</code>: скачает архив
          обновления и применит его. Медиа и база данных не затрагиваются.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={checkGithub}
            disabled={ghChecking || ghBusy || mode === "none"}
            className="rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-6 py-2 text-sm font-medium text-white shadow hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {ghChecking ? "Проверяем…" : "Проверить обновления (ГИТ)"}
          </button>
          {gh?.update_available && gh.asset && (
            <button
              type="button"
              onClick={installGithub}
              disabled={ghBusy}
              className="rounded-[var(--radius-btn)] bg-[#2e9e5b] px-6 py-2 text-sm font-medium text-white shadow hover:bg-[#278a4f] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {ghStage === "downloading"
                ? "Скачиваем с GitHub…"
                : ghStage === "applying"
                  ? "Применяем обновление…"
                  : `Скачать и установить ${gh.asset.version}`}
            </button>
          )}
        </div>

        {ghBusy && (
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-[var(--color-border)]">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-[var(--color-primary)]" />
          </div>
        )}

        {gh && (
          <div className="mt-4">
            {!gh.release ? (
              <p className="text-sm text-[var(--color-muted)]">
                {gh.message ?? "На GitHub пока нет релизов."}
              </p>
            ) : gh.asset ? (
              <>
                <span
                  className={`inline-block rounded-full border px-3 py-1 text-xs font-medium ${
                    gh.update_available
                      ? "border-amber-200 bg-amber-100 text-amber-800"
                      : "border-green-200 bg-green-100 text-green-800"
                  }`}
                >
                  {gh.update_available
                    ? `Доступна новая версия: ${gh.asset.version}`
                    : "Установлена последняя версия"}
                </span>
                <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <dt className={labelCls}>Версия на GitHub</dt>
                    <dd className={valueCls}>{gh.asset.version}</dd>
                  </div>
                  <div>
                    <dt className={labelCls}>Текущая версия</dt>
                    <dd className={valueCls}>{gh.current_version ?? "неизвестна"}</dd>
                  </div>
                  <div>
                    <dt className={labelCls}>Размер архива</dt>
                    <dd className={valueCls}>{humanSize(gh.asset.size)}</dd>
                  </div>
                  <div>
                    <dt className={labelCls}>Опубликован</dt>
                    <dd className={valueCls}>{fmtDate(gh.release.published_at)}</dd>
                  </div>
                </dl>
                {gh.release.notes && (
                  <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg,#f9fafb)] p-3 text-xs text-[var(--color-body)]">
                    {gh.release.notes}
                  </pre>
                )}
                {gh.release.html_url && (
                  <p className="mt-3">
                    <a
                      href={gh.release.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-[var(--color-primary)] underline hover:no-underline"
                    >
                      открыть релиз на GitHub ↗
                    </a>
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-[var(--color-muted)]">
                В релизе {gh.release.tag} нет архива обновления (lakomka-update-*.zip).
              </p>
            )}
            {gh.stale && (
              <p className="mt-3 text-xs text-amber-700">{gh.warning}</p>
            )}
            {!gh.stale && gh.cached && (
              <p className="mt-3 text-xs text-[var(--color-muted)]">результат из кеша (до 60 с)</p>
            )}
          </div>
        )}

        {ghError && (
          <div className="mt-4 rounded-[var(--radius-card)] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {ghError}
          </div>
        )}

        {ghDone && (
          <div className="mt-4 rounded-[var(--radius-card)] border border-green-200 bg-green-50 p-4 text-sm text-green-900">
            <p className="font-medium">{ghDone.media_sync ? "Медиа обновлены (с GitHub)" : "Сайт обновлён с GitHub"}</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              <li>Файлов {ghDone.media_sync ? "дослано" : "обновлено"}: {ghDone.files}</li>
              {ghDone.version && <li>Версия: {ghDone.version}</li>}
              {!ghDone.media_sync && (
                <li>Медиа пропущено: {ghDone.skipped_media} · защищённых файлов пропущено: {ghDone.skipped_protected}</li>
              )}
              {ghDone.failed > 0 && <li className="text-red-700">Не удалось обновить: {ghDone.failed}</li>}
            </ul>
          </div>
        )}
      </div>

      {/* что делает обновление */}
      <div className="rounded-[var(--radius-card)] border border-blue-200 bg-blue-50 p-5 text-sm text-blue-900">
        <p className="font-medium">Что обновляет архив</p>
        <p className="mt-1">
          Страницы витрины, стили и скрипты (_next), шрифты, маршрутизацию (.htaccess)
          и PHP-бэкенд.
        </p>
        <p className="mt-2 font-medium">Что остаётся нетронутым</p>
        <p className="mt-1">
          Медиа-файлы (<code>uploads/</code>) и база данных — заказы, товары и настройки
          SMTP на сервере сохраняются.
        </p>
        <p className="mt-2 font-medium">Медиа-архив (<code>lakomka-media-*.zip</code>)</p>
        <p className="mt-1">
          Работает наоборот: добавляет/перезаписывает ТОЛЬКО картинки и видео
          (<code>uploads/</code>), не трогая страницы и базу. Его стоит прогонять после
          добавления товаров с новыми фото — иначе на витрине будут битые картинки.
        </p>
      </div>

      {/* загрузка */}
      <div className={cardCls}>
        <h2 className="mb-1 font-medium text-[var(--color-heading)]">Архив обновления</h2>
        <p className="mb-4 text-sm text-[var(--color-muted)]">
          Файл .zip от разработчика (например, <code>lakomka-update-2026.01.01-1200.zip</code>).
          Загружается по частям — лимиты хостинга на размер запроса не важны.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={inputRef}
            type="file"
            accept=".zip,application/zip"
            disabled={busy || mode === "none"}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setResult(null);
              setError(null);
            }}
            className="block w-full max-w-sm text-sm text-[var(--color-heading)] file:mr-3 file:rounded-[var(--radius-btn)] file:border-0 file:bg-[var(--color-primary)] file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:opacity-90 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={applyUpdate}
            disabled={!file || busy || mode === "none"}
            className="rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-6 py-2 text-sm font-medium text-white shadow hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {phase === "uploading"
              ? `Загрузка ${progress}%…`
              : phase === "applying"
                ? "Распаковка и применение…"
                : "Обновить сайт"}
          </button>
        </div>

        {busy && (
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-[var(--color-border)]">
            <div
              className="h-full rounded-full bg-[var(--color-primary)] transition-all"
              style={{ width: `${phase === "applying" ? 100 : progress}%` }}
            />
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-[var(--radius-card)] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-4 rounded-[var(--radius-card)] border border-green-200 bg-green-50 p-4 text-sm text-green-900">
            <p className="font-medium">{result.media_sync ? "Медиа обновлены" : "Сайт обновлён"}</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              <li>Файлов {result.media_sync ? "дослано" : "обновлено"}: {result.files}</li>
              {result.version && <li>Версия: {result.version}</li>}
              {!result.media_sync && (
                <li>Медиа пропущено: {result.skipped_media} · защищённых файлов пропущено: {result.skipped_protected}</li>
              )}
              {result.failed > 0 && <li className="text-red-700">Не удалось обновить: {result.failed}</li>}
            </ul>
            {result.failed_list && result.failed_list.length > 0 && (
              <p className="mt-1 break-all text-xs text-red-700">{result.failed_list.join(", ")}</p>
            )}
          </div>
        )}
      </div>

      {/* деплой-архив: полный пакет со всеми медиа — скачивание */}
      <div className={cardCls}>
        <h2 className="mb-1 font-medium text-[var(--color-heading)]">Деплой-архив (полный пакет)</h2>
        <p className="mb-4 text-sm text-[var(--color-muted)]">
          <code>lakomka-deploy-static.zip</code> — для первого развёртывания на хостинге:
          статическая витрина, ВСЕ медиа, PHP-бэкенд с базой каталога и настройками SMTP.
          Для последующих обновлений он не нужен — достаточно архива обновления выше.
        </p>

        {deployLoading ? (
          <p className="text-sm text-[var(--color-muted)]">проверяем наличие архива…</p>
        ) : deployError ? (
          <p className="text-sm text-red-600">{deployError}</p>
        ) : deploy?.exists ? (
          <>
            <dl className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <dt className={labelCls}>Файл</dt>
                <dd className={valueCls}>{deploy.name}</dd>
              </div>
              <div>
                <dt className={labelCls}>Размер</dt>
                <dd className={valueCls}>{humanSize(deploy.size ?? 0)}</dd>
              </div>
              <div>
                <dt className={labelCls}>Собран</dt>
                <dd className={valueCls}>
                  {deploy.mtime ? fmtDate(new Date(deploy.mtime * 1000).toISOString()) : "—"}
                </dd>
              </div>
            </dl>
            {deploy.sha256 && (
              <p className="mb-4 break-all text-xs text-[var(--color-muted)]">
                sha256: <span title={deploy.sha256}>{deploy.sha256.slice(0, 16)}…{deploy.sha256.slice(-6)}</span>
              </p>
            )}
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={startDeployDownload}
                className="rounded-[var(--radius-btn)] bg-[#2e9e5b] px-6 py-2 text-sm font-medium text-white shadow hover:bg-[#278a4f]"
              >
                ⬇️ Скачать ZIP
              </button>
              <a
                href={`${API_URL}/admin/site-update/deploy-archive/download`}
                download={deploy.name}
                title="обычная загрузка одним соединением, без панели прогресса"
                className="text-sm text-[var(--color-muted)] underline decoration-dotted hover:text-[var(--color-body)]"
              >
                запасной способ (медленнее)
              </a>
            </div>
            <p className="mt-3 text-xs text-[var(--color-muted)]">
              Скачивание идёт в 6 потоков с самодокачкой после обрывов — прогресс виден в панели загрузок справа внизу.
            </p>
          </>
        ) : (
          <p className="text-sm text-[var(--color-muted)]">
            Архив ещё не собран. В песочнице: <code>MODE=full bash scripts/build-static.sh</code>.
          </p>
        )}

        {/* ── Task 114: снапшот текущего сайта (деплой-архив с сервера) ── */}
        <hr className="my-5 border-[var(--color-border)]" />
        <h3 className="mb-1 font-medium text-[var(--color-heading)]">
          Архив текущего сайта (снапшот)
        </h3>
        <p className="mb-3 text-sm text-[var(--color-muted)]">
          Zip с тем, что сейчас на сервере: витрина, backend, ВСЕ медиа и база данных
          (заказы, товары, настройки). Годится как резервная копия перед обновлением
          или для переноса сайта на другой хостинг. Служебный мусор (логи, чанки,
          прошлые снапшоты) не пакуется.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={createSnapshot}
            disabled={snapBusy}
            className="rounded-[var(--radius-btn)] bg-[#2e9e5b] px-6 py-2 text-sm font-medium text-white shadow hover:bg-[#278a4f] disabled:opacity-60"
          >
            {snapBusy ? "Собираем архив… (может занять несколько минут)" : "📦 Создать архив текущего сайта"}
          </button>
        </div>

        {snapError && (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{snapError}</p>
        )}

        {snapResult && (
          <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-4 text-sm">
            <p className="font-semibold text-green-800">✓ Снапшот готов: {snapResult.name}</p>
            <p className="mt-1 text-green-800">
              {humanSize(snapResult.size)} · файлов: {snapResult.files}
              {snapResult.duration_s != null && <> · за {snapResult.duration_s} с</>}
            </p>
            {snapResult.sha256 && (
              <p className="mt-1 break-all text-xs text-green-900/80">sha256: {snapResult.sha256}</p>
            )}
            <button
              type="button"
              onClick={() => downloadSnapshot(snapResult.name)}
              className="mt-3 rounded-[var(--radius-btn)] bg-[#2e9e5b] px-4 py-1.5 text-xs font-medium text-white hover:bg-[#278a4f]"
            >
              ⬇ Скачать снапшот
            </button>
          </div>
        )}

        {(deploy?.snapshots?.length ?? 0) > 0 && (
          <ul className="mt-4 divide-y divide-[var(--color-border)] rounded-[var(--radius-card)] border border-[var(--color-border)] text-sm">
            {deploy!.snapshots!.map((s) => (
              <li key={s.name} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1 truncate font-medium" title={s.name}>{s.name}</span>
                <span className="text-xs text-[var(--color-muted)]">
                  {humanSize(s.size)} · {fmtDate(new Date(s.mtime * 1000).toISOString())}
                </span>
                <button
                  type="button"
                  onClick={() => downloadSnapshot(s.name)}
                  className="rounded-[var(--radius-btn)] border border-[var(--color-border)] px-3 py-1 text-xs hover:bg-[var(--color-bg-soft)]"
                >
                  ⬇ Скачать
                </button>
                <button
                  type="button"
                  onClick={() => deleteSnapshot(s.name)}
                  className="rounded-[var(--radius-btn)] border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50"
                >
                  удалить
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
