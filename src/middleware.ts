import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function decodeJwtRole(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    // base64url → base64
    let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    // padding
    while (base64.length % 4) base64 += "=";

    // atob есть и в edge runtime, и в браузере
    const binary = atob(base64);

    // UTF-8 декодирование из binary string
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const json = new TextDecoder("utf-8").decode(bytes);

    const payload = JSON.parse(json);
    return payload.role ?? null;
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest) {
  const token = request.cookies.get("admin_token")?.value;
  const pathname = request.nextUrl.pathname;

  if (!token) {
    const loginUrl = new URL("/admin/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const role = decodeJwtRole(token);

  // Только super_admin: /admin/users и /admin/settings
  if (pathname.startsWith("/admin/users") || pathname.startsWith("/admin/settings")) {
    if (role !== "super_admin") {
      return NextResponse.redirect(new URL("/admin/orders", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/((?!login).*)"],
};