import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getSessionId } from "@/lib/session";
import { getCart, getSettings } from "@/lib/store";

export const metadata: Metadata = {
  title: "Agent Store",
  description: "An e-commerce store that AI agents can shop from, operate, and optimise.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const sid = await getSessionId();
  const settings = getSettings();
  const cart = getCart(sid);
  const count = cart.lines.reduce((s, l) => s + l.qty, 0);
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <header className="border-b" style={{ borderColor: "var(--line)", background: "var(--panel)" }}>
          <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between gap-4">
            <Link href="/" className="font-bold tracking-tight text-lg">{settings.store_name}</Link>
            <form action="/search" className="hidden sm:block flex-1 max-w-sm">
              <input name="q" placeholder="Search products" className="w-full rounded-lg border px-3 py-1.5 text-sm" style={{ borderColor: "var(--line)" }} />
            </form>
            <nav className="flex items-center gap-4 text-sm font-medium">
              <Link href="/">Shop</Link>
              <Link href="/cart">Cart{count ? ` (${count})` : ""}</Link>
              <Link href="/admin" className="muted">Admin</Link>
            </nav>
          </div>
        </header>
        <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-8">{children}</main>
        <footer className="border-t py-6 text-xs muted" style={{ borderColor: "var(--line)" }}>
          <div className="mx-auto max-w-6xl px-4 flex flex-wrap gap-x-6 gap-y-2">
            <span>Built for agents:</span>
            <a href="/llms.txt">/llms.txt</a>
            <a href="/openapi.json">/openapi.json</a>
            <a href="/.well-known/agent.json">/.well-known/agent.json</a>
            <a href="/api/agent/tools">/api/agent/tools</a>
          </div>
        </footer>
      </body>
    </html>
  );
}
