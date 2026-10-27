export interface ProductMedia {
  id: number;
  type: "image" | "video";
  url: string;
  alt: string | null;
  sort_order: number;
}

export interface ProductImage {
  id: number;
  url: string;
  alt: string | null;
  sort_order: number;
}

export interface BundleItem {
  id: number;
  product_id: number;
  component_id: number;
  quantity: number;
  component?: Product;
}

export type ProductType = "simple" | "bundle" | "recipe";

export interface Product {
  id: number;
  sku: string | null;
  slug: string;
  name: string;
  description?: string | null;
  manufacturer?: string | null;
  type: ProductType;
  price_kopecks: number;
  old_price_kopecks: number | null;
  packaging_material: string | null;
  weight_g?: number | null;
  length_cm?: number | null;
  width_cm?: number | null;
  height_cm?: number | null;
  recipe_weight_g?: number | null;
  show_in_catalog: number;
  media: ProductMedia[];
  images: ProductImage[];
  bundle_items?: BundleItem[];
}

export interface CartLine {
  product: Product;
  qty: number;
}

export type DeliveryMethod = "pickup" | "city" | "region" | "tk";

export type OrderStatus =
  | "new" | "confirmed" | "paid" | "shipped" | "done" | "cancelled";

export interface OrderItem {
  id: number;
  product_id: number | null;
  product_name: string;
  qty: number;
  price_kopecks: number;
}

export interface Order {
  id: number;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  delivery_method: DeliveryMethod;
  address: string | null;
  comment: string | null;
  total_kopecks: number;
  status: OrderStatus;
  created_at: string;
  items: OrderItem[];
}
/* ============================================================
   API envelopes (используются в src/lib/api.ts)
   ============================================================ */
export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
}
