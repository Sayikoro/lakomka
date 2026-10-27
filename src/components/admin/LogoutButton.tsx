"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();

  async function logout() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";
    await fetch(`${apiUrl}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <button
      onClick={logout}
      className="text-sm text-[var(--color-muted)] hover:text-[var(--color-primary)]"
    >
      Выйти
    </button>
  );
}