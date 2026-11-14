import type { Metadata } from "next";

/* Task 147: корзина — техническая страница, из индекса исключена */
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default function CartLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
