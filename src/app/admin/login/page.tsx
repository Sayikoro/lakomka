"use client";

/* Вход в админку (Task 137 — редизайн): split-screen.
 * Слева — брендовая панель (на мобильных прячется), справа — форма.
 * Логика входа не менялась: /api/auth/login → кука admin_token → переход
 * по ?next= (или на заказы). Подсказка первого запуска сохранена. */

import { useState, Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/admin/orders";

  const [email, setEmail] = useState("admin@lakomka.local");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /* Первый запуск сайта: суперадмин создан с дефолтным паролем — показываем
   * подсказку, пока владелец не сменит пароль (после смены исчезает). */
  const [firstRun, setFirstRun] = useState(false);

  useEffect(() => {
    let alive = true;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api";
    (async () => {
      try {
        const res = await fetch(`${apiUrl}/auth/first-run`, { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (alive && res.ok) setFirstRun(Boolean(json.data?.first_run));
      } catch {
        /* подсказка необязательна */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "/api";
      const res = await fetch(`${apiUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Не удалось войти");
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError("Ошибка сети");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="admin-scope flex min-h-screen bg-[var(--color-bg-soft)]">
      {/* Брендовая панель (≥ md): новогодний градиент и витрина бренда */}
      <div
        aria-hidden="true"
        className="relative hidden w-[44%] shrink-0 flex-col justify-between overflow-hidden bg-gradient-to-br from-[#0274BE] via-[#0262A0] to-[#02406B] p-10 text-white lg:flex xl:p-14"
      >
        {/* Декоративные снежинки */}
        <span className="absolute left-[8%] top-[10%] text-6xl opacity-15 select-none">❄</span>
        <span className="absolute right-[12%] top-[24%] text-4xl opacity-20 select-none">❄</span>
        <span className="absolute bottom-[18%] left-[18%] text-5xl opacity-10 select-none">❄</span>
        <span className="absolute bottom-[8%] right-[8%] text-7xl opacity-15 select-none">❄</span>

        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 text-2xl backdrop-blur">
            🎁
          </span>
          <span className="leading-tight">
            <span className="block text-xl font-semibold">Лакомка</span>
            <span className="block text-xs uppercase tracking-widest text-white/70">
              Новогодние подарки
            </span>
          </span>
        </div>

        <div>
          <p className="text-3xl font-semibold leading-snug xl:text-4xl">
            Управляйте магазином
            <br />
            с любого экрана
          </p>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/75">
            Заказы, каталог, аналитика и медиа — всё под рукой: на компьютере,
            планшете и телефоне.
          </p>
        </div>

        <p className="text-xs text-white/50" suppressHydrationWarning>
          © {new Date().getFullYear()} Лакомка · панель управления
        </p>
      </div>

      {/* Форма входа */}
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          {/* Компактный бренд для мобильных */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span
              aria-hidden="true"
              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0274BE] to-[#024F80] text-2xl text-white shadow-sm"
            >
              🎁
            </span>
            <span className="leading-tight">
              <span className="block text-lg font-semibold text-[var(--color-heading)]">
                Лакомка
              </span>
              <span className="block text-[11px] uppercase tracking-widest text-[var(--color-muted)]">
                Панель управления
              </span>
            </span>
          </div>

          <form
            onSubmit={submit}
            className="rounded-[var(--radius-card)] bg-[var(--color-card)] p-6 shadow-sm sm:p-8"
          >
            <h1 className="mb-6 text-2xl font-semibold text-[var(--color-heading)]">
              Вход в админку
            </h1>

            {firstRun && (
              <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
                <p className="font-semibold">Первый запуск сайта 🎄</p>
                <p className="mt-1">
                  Суперадмин создан автоматически:
                  <br />
                  логин{" "}
                  <code className="rounded bg-[var(--color-card)] px-1">
                    admin@lakomka.local
                  </code>
                  , пароль{" "}
                  <code className="rounded bg-[var(--color-card)] px-1">
                    Lakomka2026!
                  </code>
                </p>
                <p className="mt-1">
                  Войдите и сразу смените пароль (Пользователи) — тогда эта
                  подсказка исчезнет. Секретные ключи шифрования уже
                  сгенерированы автоматически.
                </p>
              </div>
            )}

            <label
              className="mb-1 block text-sm font-medium text-[var(--color-heading)]"
              htmlFor="login-email"
            >
              Email
            </label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mb-4 w-full"
            />

            <label
              className="mb-1 block text-sm font-medium text-[var(--color-heading)]"
              htmlFor="login-password"
            >
              Пароль
            </label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoFocus
              className="mb-4 w-full"
            />

            {error && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-6 py-3 font-medium text-white shadow-sm transition hover:bg-[var(--color-primary-hover)] disabled:opacity-60"
            >
              {submitting ? "Входим…" : "Войти"}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-[var(--color-muted)]">
            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--color-primary)]"
            >
              Открыть витрину сайта →
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
