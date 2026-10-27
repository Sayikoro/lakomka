# setup-lakomka.ps1
# Идемпотентный скрипт: создаёт / перезаписывает все файлы проекта
$ErrorActionPreference = 'Stop'

if (-not (Test-Path "package.json")) {
    Write-Host "Ошибка: запустите скрипт из корня проекта lakomka-shop" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path "src")) {
    Write-Host "Ошибка: в проекте нет папки src/" -ForegroundColor Red
    exit 1
}

function Write-Utf8NoBom([string]$path, [string]$content) {
    $dir = Split-Path $path -Parent
    if ($dir -and -not (Test-Path $dir)) {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
    }
    $full = Join-Path (Get-Location) $path
    [System.IO.File]::WriteAllText($full, $content, [System.Text.UTF8Encoding]::new($false))
    Write-Host "  OK  $path" -ForegroundColor Green
}

# ---------- Папки ----------
Write-Host "`nСоздаю папки..." -ForegroundColor Cyan
@(
    "src/app",
    "src/app/(shop)",
    "src/app/(shop)/catalog",
    "src/app/(shop)/cart",
    "src/app/(shop)/checkout",
    "src/app/(shop)/product",
    "src/app/(shop)/product/[slug]",
    "src/components",
    "src/components/layout",
    "src/components/ui",
    "src/lib",
    "src/store"
) | ForEach-Object {
    if (-not (Test-Path $_)) {
        New-Item -ItemType Directory -Force -Path $_ | Out-Null
        Write-Host "  OK  $_" -ForegroundColor Green
    }
}

# ---------- Удаляем корневой app/, если остался ----------
if (Test-Path "app") {
    Remove-Item -Recurse -Force "app"
    Write-Host "  OK  удалена дублирующая папка app/ в корне" -ForegroundColor Yellow
}

# ---------- globals.css ----------
Write-Host "`nПишу файлы..." -ForegroundColor Cyan

Write-Utf8NoBom "src/app/globals.css" @'
@import "tailwindcss";

:root {
  --color-primary: #c8102e;
  --color-primary-hover: #a00d24;
  --color-accent: #f4b942;
  --color-bg: #ffffff;
  --color-bg-soft: #fdf8f3;
  --color-text: #1a1a1a;
  --color-muted: #6b6b6b;
  --color-border: #e8e0d5;
}

body {
  background-color: var(--color-bg);
  color: var(--color-text);
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
}

input[type="number"]::-webkit-outer-spin-button,
input[type="number"]::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
'@

# ---------- layout.tsx ----------
Write-Utf8NoBom "src/app/layout.tsx" @'
import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

export const metadata: Metadata = {
  title: {
    default: "Лакомка — новогодние сладкие подарки",
    template: "%s | Лакомка",
  },
  description:
    "Новогодние сладкие подарки, наборы конфет и подарочные наборы с доставкой по Хабаровску.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
'@

# ---------- (shop)/page.tsx ----------
Write-Utf8NoBom "src/app/(shop)/page.tsx" @'
export default function HomePage() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-20">
      <h1 className="text-4xl font-bold text-[var(--color-primary)]">
        Лакомка
      </h1>
      <p className="mt-4 text-[var(--color-muted)]">
        Новогодние сладкие подарки
      </p>
    </div>
  );
}
'@

# ---------- lib/types.ts ----------
Write-Utf8NoBom "src/lib/types.ts" @'
export type ProductType = "simple" | "bundle";
export type StockStatus = "in_stock" | "out_of_stock" | "on_backorder";

export interface Category {
  id: number;
  slug: string;
  name: string;
  parent_id: number | null;
  position: number;
}

export interface ProductImage {
  id: number;
  url: string;
  alt: string | null;
  sort: number;
}

export interface BundleItem {
  product: Product;
  qty: number;
}

export interface Product {
  id: number;
  sku: string | null;
  slug: string;
  name: string;
  type: ProductType;
  short_description: string | null;
  description: string | null;
  price_kopecks: number;
  old_price_kopecks: number | null;
  stock_qty: number;
  stock_status: StockStatus;
  weight_g: number | null;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  packaging_material: string | null;
  is_published: number;
  show_in_catalog: number;
  is_featured: number;
  category_id: number | null;
  category?: Category | null;
  images: ProductImage[];
  attributes: { name: string; value: string }[];
  bundle_items?: BundleItem[];
}

export interface CartLine {
  product: Product;
  qty: number;
}

export type OrderStatus =
  | "new"
  | "confirmed"
  | "preparing"
  | "shipped"
  | "delivered"
  | "cancelled";

export type DeliveryMethod = "pickup" | "courier" | "post" | "cdek" | "other";

export interface OrderItem {
  id: number;
  product_id: number | null;
  product_name: string;
  product_sku: string | null;
  price_kopecks: number;
  qty: number;
  total_kopecks: number;
}

export interface Order {
  id: number;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  delivery_method: DeliveryMethod;
  delivery_address: string | null;
  comment: string | null;
  subtotal_kopecks: number;
  delivery_kopecks: number;
  total_kopecks: number;
  status: OrderStatus;
  admin_note: string | null;
  created_at: string;
  items: OrderItem[];
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    per_page: number;
    last_page: number;
  };
}
'@

# ---------- lib/utils.ts ----------
Write-Utf8NoBom "src/lib/utils.ts" @'
export function formatPrice(kopecks: number): string {
  const rubles = kopecks / 100;
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: rubles % 1 === 0 ? 0 : 2,
  }).format(rubles);
}

export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return "";
  let result = "+7";
  if (digits.length > 1) result += " (" + digits.slice(1, 4);
  if (digits.length >= 4) result += ")";
  if (digits.length > 4) result += " " + digits.slice(4, 7);
  if (digits.length > 7) result += "-" + digits.slice(7, 9);
  if (digits.length > 9) result += "-" + digits.slice(9, 11);
  return result;
}

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
'@

# ---------- lib/api.ts ----------
Write-Utf8NoBom "src/lib/api.ts" @'
import axios, { AxiosError } from "axios";
import type { ApiResponse, PaginatedResponse, Product } from "./types";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  headers: { Accept: "application/json" },
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("admin_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error: AxiosError<{ message?: string }>) => {
    const message =
      error.response?.data?.message ||
      error.message ||
      "Ошибка сети. Попробуйте ещё раз.";
    return Promise.reject(new Error(message));
  }
);

export const productsApi = {
  list: (params?: { category?: string; type?: string; page?: number }) =>
    api
      .get<PaginatedResponse<Product>>("/products", { params })
      .then((r) => r.data),

  getBySlug: (slug: string) =>
    api
      .get<ApiResponse<Product>>(`/products/${slug}`)
      .then((r) => r.data.data),

  featured: (limit = 8) =>
    api
      .get<ApiResponse<Product[]>>("/products/featured", { params: { limit } })
      .then((r) => r.data.data),
};

export default api;
'@

# ---------- store/cart.ts ----------
Write-Utf8NoBom "src/store/cart.ts" @'
"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartLine, Product } from "@/lib/types";

interface CartState {
  lines: CartLine[];
  add: (product: Product, qty?: number) => void;
  remove: (productId: number) => void;
  setQty: (productId: number, qty: number) => void;
  clear: () => void;
  totalKopecks: () => number;
  totalQty: () => number;
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      lines: [],

      add: (product, qty = 1) =>
        set((state) => {
          const existing = state.lines.find((l) => l.product.id === product.id);
          if (existing) {
            return {
              lines: state.lines.map((l) =>
                l.product.id === product.id ? { ...l, qty: l.qty + qty } : l
              ),
            };
          }
          return { lines: [...state.lines, { product, qty }] };
        }),

      remove: (productId) =>
        set((state) => ({
          lines: state.lines.filter((l) => l.product.id !== productId),
        })),

      setQty: (productId, qty) =>
        set((state) => ({
          lines:
            qty <= 0
              ? state.lines.filter((l) => l.product.id !== productId)
              : state.lines.map((l) =>
                  l.product.id === productId ? { ...l, qty } : l
                ),
        })),

      clear: () => set({ lines: [] }),

      totalKopecks: () =>
        get().lines.reduce(
          (sum, l) => sum + l.product.price_kopecks * l.qty,
          0
        ),

      totalQty: () => get().lines.reduce((sum, l) => sum + l.qty, 0),
    }),
    { name: "lakomka-cart" }
  )
);
'@

# ---------- components/layout/Header.tsx ----------
Write-Utf8NoBom "src/components/layout/Header.tsx" @'
"use client";

import Link from "next/link";
import { useCart } from "@/store/cart";

export function Header() {
  const totalQty = useCart((s) => s.totalQty());

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-[var(--color-border)]">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-6">
        <Link href="/" className="text-xl font-bold text-[var(--color-primary)]">
          Лакомка
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-sm">
          <Link href="/catalog" className="hover:text-[var(--color-primary)]">
            Каталог
          </Link>
          <Link href="/catalog?type=bundle" className="hover:text-[var(--color-primary)]">
            Подарки
          </Link>
          <Link href="/catalog?type=set" className="hover:text-[var(--color-primary)]">
            Наборы
          </Link>
        </nav>

        <Link
          href="/cart"
          className="relative px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]"
        >
          Корзина
          {totalQty > 0 && (
            <span className="absolute -top-2 -right-2 min-w-5 h-5 px-1 rounded-full bg-[var(--color-accent)] text-[var(--color-text)] text-xs font-bold flex items-center justify-center">
              {totalQty}
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}
'@

# ---------- components/layout/Footer.tsx ----------
Write-Utf8NoBom "src/components/layout/Footer.tsx" @'
import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-20 bg-[var(--color-bg-soft)] border-t border-[var(--color-border)]">
      <div className="max-w-7xl mx-auto px-4 py-10 grid grid-cols-1 md:grid-cols-3 gap-8 text-sm">
        <div>
          <div className="font-bold text-lg text-[var(--color-primary)] mb-2">Лакомка</div>
          <p className="text-[var(--color-muted)]">
            Новогодние сладкие подарки с доставкой по Хабаровску и всей России.
          </p>
        </div>

        <div>
          <div className="font-semibold mb-2">Покупателям</div>
          <ul className="space-y-1 text-[var(--color-muted)]">
            <li><Link href="/catalog" className="hover:text-[var(--color-primary)]">Каталог</Link></li>
            <li><Link href="/cart" className="hover:text-[var(--color-primary)]">Корзина</Link></li>
          </ul>
        </div>

        <div>
          <div className="font-semibold mb-2">Контакты</div>
          <ul className="space-y-1 text-[var(--color-muted)]">
            <li>+7 (4212) 00-00-00</li>
            <li>info@lakomkakhv.ru</li>
            <li>г. Хабаровск</li>
          </ul>
        </div>
      </div>

      <div className="border-t border-[var(--color-border)] py-4 text-center text-xs text-[var(--color-muted)]">
        © {new Date().getFullYear()} Лакомка. Все права защищены.
      </div>
    </footer>
  );
}
'@

# ---------- .env.local ----------
Write-Host "`nПроверяю .env.local..." -ForegroundColor Cyan
if (-not (Test-Path ".env.local")) {
    Write-Utf8NoBom ".env.local" @'
NEXT_PUBLIC_API_URL=http://localhost:8000/api
NEXT_PUBLIC_SITE_NAME=Лакомка
NEXT_PUBLIC_SITE_URL=http://localhost:3000
'@
} else {
    Write-Host "  SKIP  .env.local уже существует" -ForegroundColor Yellow
}

# ---------- tsconfig.json: проверка путей ----------
Write-Host "`nПроверяю tsconfig.json..." -ForegroundColor Cyan
$tsconfig = Get-Content "tsconfig.json" -Raw
if ($tsconfig -match '"@/\*"\s*:\s*\[\s*"\./\*"\s*\]') {
    $tsconfig = $tsconfig -replace '"@/\*"\s*:\s*\[\s*"\./\*"\s*\]', '"@/*": ["./src/*"]'
    [System.IO.File]::WriteAllText(
        (Join-Path (Get-Location) "tsconfig.json"),
        $tsconfig,
        [System.Text.UTF8Encoding]::new($false)
    )
    Write-Host "  FIX  paths исправлен на ./src/*" -ForegroundColor Yellow
} elseif ($tsconfig -match '"@/\*"\s*:\s*\[\s*"\./src/\*"\s*\]') {
    Write-Host "  OK  paths корректны (./src/*)" -ForegroundColor Green
} else {
    Write-Host "  WARN  не нашёл блок paths в tsconfig.json — проверьте вручную" -ForegroundColor Yellow
}

# ---------- Итог ----------
Write-Host "`n=== Итог ===" -ForegroundColor Cyan
@(
    "src/app/layout.tsx",
    "src/app/globals.css",
    "src/app/(shop)/page.tsx",
    "src/lib/types.ts",
    "src/lib/utils.ts",
    "src/lib/api.ts",
    "src/store/cart.ts",
    "src/components/layout/Header.tsx",
    "src/components/layout/Footer.tsx"
) | ForEach-Object {
    $exists = Test-Path $_
    $mark = if ($exists) { "OK  " } else { "FAIL" }
    $color = if ($exists) { "Green" } else { "Red" }
    Write-Host "  $mark  $_" -ForegroundColor $color
}

Write-Host "`nГотово. Запускайте: npm run dev" -ForegroundColor Cyan
Write-Host "Открывайте: http://localhost:3000`n" -ForegroundColor Cyan