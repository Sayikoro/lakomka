import Link from "next/link";
import { CopyrightYear } from "./CopyrightYear";

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
        © <CopyrightYear /> Лакомка. Все права защищены.
      </div>
    </footer>
  );
}