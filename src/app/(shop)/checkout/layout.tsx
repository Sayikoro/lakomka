import type { Metadata } from "next";

/* Task 147: оформление заказа — техническая страница, из индекса исключена */
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default function CheckoutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
