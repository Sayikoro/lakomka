import { cookies } from "next/headers";

export type Role = "super_admin" | "editor" | "viewer";

export interface CurrentUser {
  id: number;
  email: string;
  role: Role;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(base64, "base64").toString("utf-8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;
  if (!token) return null;

  const payload = decodeJwtPayload(token);
  if (!payload) return null;

  const exp = (payload.exp as number) ?? 0;
  if (exp < Math.floor(Date.now() / 1000)) return null;

  const role = (payload.role as Role) ?? "viewer";

  return {
    id: (payload.sub as number) ?? 0,
    email: (payload.email as string) ?? "",
    role,
  };
}

export function canEdit(role: Role | undefined): boolean {
  return role === "editor" || role === "super_admin";
}

export function canAdmin(role: Role | undefined): boolean {
  return role === "super_admin";
}