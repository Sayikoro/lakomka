import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { UserForm, type UserFormValues } from "@/components/admin/UserForm";

async function getUser(id: string): Promise<UserFormValues | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;
  if (!token) return null;

  const apiUrl = process.env.PHP_API_URL ?? "http://localhost:8000/api";
  try {
    const res = await fetch(`${apiUrl}/admin/users`, {
      headers: { Cookie: `admin_token=${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data: { id: number; email: string; name: string | null; role: string }[];
    };
    const user = json.data.find((u) => String(u.id) === id);
    if (!user) return null;
    return {
      id: user.id,
      email: user.email,
      name: user.name ?? "",
      role: user.role as UserFormValues["role"],
    };
  } catch {
    return null;
  }
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditUserPage({ params }: PageProps) {
  const { id } = await params;
  const user = await getUser(id);
  if (!user) notFound();

  return (
    <div className="max-w-xl">
      <div className="mb-6">
        <Link
          href="/admin/users"
          className="text-sm text-[var(--color-muted)] hover:text-[var(--color-primary)]"
        >
          ← К пользователям
        </Link>
      </div>
      <h1 className="mb-6 text-[24px] font-medium text-[var(--color-heading)]">
        {user.email}
      </h1>
      <UserForm mode="edit" initial={user} />
    </div>
  );
}