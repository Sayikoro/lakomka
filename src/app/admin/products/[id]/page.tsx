import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductForm, type ProductFormValues } from "@/components/admin/ProductForm";
import { BundleEditor, type BundleRow } from "@/components/admin/BundleEditor";
import { MediaUploader, type MediaItem } from "@/components/admin/MediaUploader";

interface AdminProductFull extends ProductFormValues {
  id: number;
  category_id: number | null;
  media?: MediaItem[];
}

async function fetchProduct(id: string) {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;
  if (!token) return null;

  const apiUrl = process.env.PHP_API_URL ?? "http://localhost:8000/api";
  const headers = { Cookie: `admin_token=${token}` };

  const [prodRes, bundleRes] = await Promise.all([
    fetch(`${apiUrl}/admin/products/${id}`, { headers, cache: "no-store" }),
    fetch(`${apiUrl}/admin/products/${id}/bundle`, { headers, cache: "no-store" }),
  ]);

  if (!prodRes.ok) return null;

  const prod = (await prodRes.json()).data as AdminProductFull;
  const bundle: BundleRow[] = bundleRes.ok ? (await bundleRes.json()).data : [];

  return { product: prod, bundle };
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminProductDetailPage({ params }: PageProps) {
  const { id } = await params;
  const data = await fetchProduct(id);
  if (!data) notFound();

  const { product, bundle } = data;

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link href="/admin/products"
          className="text-sm text-[var(--color-muted)] hover:text-[var(--color-primary)]">
          ← К списку товаров
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-[24px] font-medium text-[var(--color-heading)]">{product.name}</h1>
        <span className="text-sm text-[var(--color-muted)]">
          ID: {product.id} · {product.type === "bundle" ? "набор" : "товар"}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-6">
          <ProductForm
            mode="edit"
            initial={{
              id: product.id,
              name: product.name,
              slug: product.slug,
              sku: product.sku ?? "",
              type: product.type,
              price_kopecks: product.price_kopecks,
              stock_qty: product.stock_qty,
              show_in_catalog: product.show_in_catalog,
              is_published: product.is_published,
              description: product.description ?? "",
              manufacturer: product.manufacturer ?? "",
              packaging_material: product.packaging_material ?? "",
              weight_g: product.weight_g ?? null,
              length_cm: product.length_cm ?? null,
              width_cm: product.width_cm ?? null,
              height_cm: product.height_cm ?? null,
              recipe_weight_g: product.recipe_weight_g ?? null,
            }}
          />

          <MediaUploader productId={product.id} initial={product.media ?? []} />
        </div>

        {product.type === "bundle" ? (
          <BundleEditor
            productId={product.id}
            initial={bundle}
            initialRecipeWeight={product.recipe_weight_g ?? null}
          />
        ) : (
          <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg-soft)] p-6 text-sm text-[var(--color-muted)]">
            Это простой товар. Состав набора появляется только у наборов.
          </div>
        )}
      </div>
    </div>
  );
}