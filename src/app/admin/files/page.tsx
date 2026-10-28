import { redirect } from "next/navigation";
import { FilesManager } from "@/components/admin/FilesManager";
import { getCurrentUser } from "@/lib/auth";

export default async function AdminFilesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");

  return (
    <div>
      <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h1 className="text-2xl font-bold text-[var(--color-heading)]">Файлы</h1>
        <p className="text-sm text-[var(--color-muted)]">
          Проводник по архивам и медиа · скачивание в два этапа
        </p>
      </div>
      <FilesManager />
    </div>
  );
}
