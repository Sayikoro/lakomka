import { cookies } from "next/headers";
import Link from "next/link";
import { ProductsTable } from "@/components/admin/ProductsTable";
import { ProductsImportExport } from "@/components/admin/ProductsImportExport";

export interface AdminProduct {
  id: number;
  sku: string | null;
  slug: string;
  name: string;
  type: string;
  price_kopecks: number;
  stock_qty: number;
  show_in_catalog: number;
  is_published: number;
  category_id: number | null;
}

async function getProducts(): Promise<AdminProduct[]> {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;
  if (!token) return [];

  const apiUrl = process.env.PHP_API_URL ?? "http://localhost:8000/api";
  try {
    const res = await fetch(`${apiUrl}/admin/products`, {
      headers: { Cookie: `admin_token=${token}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data: AdminProduct[] };
    return json.data ?? [];
  } catch {
    return [];
  }
}

export default async function AdminProductsPage() {
  const products = await getProducts();

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[24px] font-medium text-[var(--color-heading)]">
          Товары <span className="text-sm font-normal text-[var(--color-muted)]">({products.length})</span>
        </h1>
        <Link
          href="/admin/products/new"
          className="rounded-[var(--radius-btn)] bg-[var(--color-primary)] px-5 py-2 text-sm font-medium text-white transition hover:bg-[var(--color-primary-hover)]"
        >
          + Добавить товар
        </Link>
      </div>
      <ProductsImportExport />
      <ProductsTable initialProducts={products} />
    </div>
  );
}