import { ProductForm } from "@/components/admin/ProductForm";

export default function NewProductPage() {
  return (
    <div>
      <h1 className="mb-6 text-[24px] font-medium text-[var(--color-heading)]">
        Новый товар
      </h1>
      <ProductForm mode="create" />
    </div>
  );
}