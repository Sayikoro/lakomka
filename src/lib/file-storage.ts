/* Загрузка файлов в файловое хранилище админки (разделы файлового менеджера:
 * media = public/uploads, exports, imports). Двухшагово, как у импорта/обновления:
 *   1) файл летит чанками по 512 КБ (base64) в /api/admin/upload/chunk —
 *      так не действуют лимиты хостинга на размер POST;
 *   2) /api/admin/files/upload переименовывает/переносит файл в целевую папку
 *      раздела (санитайз имени, дедупликация, whitelist форматов, MIME-проверка).
 */

import { uploadFileInChunks } from "./chunked-upload";

export interface StorageUploadResult {
  /** итоговое имя в папке (может отличаться: дедуп → «фото-1.jpg») */
  name: string;
  /** путь в терминах файлового менеджера: «media/подпапка/имя» */
  path: string;
  /** публичный адрес (для media: /uploads/...), у служебных разделов null */
  url: string | null;
  size: number;
  /** заметка оптимизатора («photo.jpg → photo.webp (2.1 МБ → 340 КБ)»), если сработал */
  optimized?: string;
}

/** Подсказка для <input type="file">: всё, что принимает хранилище */
export const STORAGE_ACCEPT =
  ".jpg,.jpeg,.png,.webp,.gif,.avif,.mp4,.webm,.mov,.m4v,.pdf";

export const STORAGE_ACCEPT_IMAGES = ".jpg,.jpeg,.png,.webp,.gif,.avif";
export const STORAGE_ACCEPT_VIDEO = ".mp4,.webm,.mov,.m4v";

export async function uploadToStorage(
  file: File,
  target: string,
  onProgress?: (pct: number) => void,
  apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api",
): Promise<StorageUploadResult> {
  /* 1. Чанки → storage/chunked-uploads/up-xxx.zip */
  const { filePath } = await uploadFileInChunks(file, onProgress);

  /* 2. Перенос в целевую папку раздела */
  const res = await fetch(`${apiUrl}/admin/files/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      file_path: filePath,
      original_name: file.name,
      target,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error ?? `Ошибка ${res.status}`);
  }
  return json.data as StorageUploadResult;
}
