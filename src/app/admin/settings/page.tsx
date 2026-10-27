import { cookies } from "next/headers";
import { SettingsForm } from "@/components/admin/SettingsForm";

export interface AdminSettings {
  admin_email: string;
  from_email: string;
  from_name: string;
  site_url: string;
  mail_driver: string;
  smtp_host: string;
  smtp_port: string;
  smtp_user: string;
  smtp_pass: string;
  smtp_pass_set: boolean;
  smtp_secure: string;
}

async function getSettings(): Promise<AdminSettings | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;
  if (!token) return null;

  const apiUrl = process.env.PHP_API_URL ?? "http://localhost:8000/api";
  try {
    const res = await fetch(`${apiUrl}/admin/settings`, {
      headers: { Cookie: `admin_token=${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data: AdminSettings };
    return json.data;
  } catch {
    return null;
  }
}

export default async function AdminSettingsPage() {
  const settings = await getSettings();

  return (
    <div>
      <h1 className="mb-6 text-[24px] font-medium text-[var(--color-heading)]">
        Настройки
      </h1>

      {!settings ? (
        <div className="rounded-[var(--radius-card)] border border-red-200 bg-red-50 p-6 text-red-700">
          Не удалось загрузить настройки. Проверь, что PHP-сервер работает.
        </div>
      ) : (
        <SettingsForm initial={settings} />
      )}
    </div>
  );
}