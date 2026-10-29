const CHUNK_SIZE = 512 * 1024; // 512 KB base64-encoded
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";

function bufferToBase64(bytes: Uint8Array): string {
  let binary = "";
  const len = bytes.byteLength;
  // порционный charFromCharCode — быстрее для больших массивов
  const step = 0x8000;
  for (let i = 0; i < len; i += step) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, Math.min(i + step, len)))
    );
  }
  return btoa(binary);
}

export interface ChunkedUploadResult {
  filePath: string;
  size: number;
}

/**
 * Загружает файл частями по base64. Возвращает file_path для последующего
 * вызова /api/admin/.../import-zip с { file_path }.
 */
export async function uploadFileInChunks(
  file: File,
  onProgress?: (pct: number) => void
): Promise<ChunkedUploadResult> {
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  if (totalChunks > 1000) {
    throw new Error("Файл слишком большой (>500 MB). Разделите на части.");
  }
  const uploadId =
    "up-" +
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 10);

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);
    const buf = await chunk.arrayBuffer();
    const base64 = bufferToBase64(new Uint8Array(buf));

    const res = await fetch(`${API_URL}/admin/upload/chunk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        upload_id: uploadId,
        chunk_index: i,
        total_chunks: totalChunks,
        filename: file.name,
        chunk_base64: base64,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? `Ошибка чанка ${i + 1}/${totalChunks}`);
    }
    const json = await res.json();
    onProgress?.(Math.round(((i + 1) / totalChunks) * 100));

    if (json.data?.done) {
      return { filePath: json.data.file_name, size: json.data.size };
    }
  }
  throw new Error("Загрузка не завершилась");
}