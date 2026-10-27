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