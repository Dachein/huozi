import Link from "next/link";
import { LocaleSwitcher } from "@/components/locale-switcher";

/**
 * Auth shell — login, signup, onboard, connect.
 *
 * Deliberately minimal: one small nav row at the top (home + locale)
 * then a vertically-centered content area. No product nav, no CTA.
 * When a user is in the auth flow we want their attention on the form
 * in front of them, not on marketing material behind it.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <header className="border-b border-border/40">
        <div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-6">
          <Link
            href="/"
            className="flex items-baseline gap-2 text-sm font-medium"
          >
            <span className="font-serif text-lg font-bold text-accent leading-none">
              字
            </span>
            huozi.app
          </Link>
          <LocaleSwitcher />
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        {children}
      </main>
    </div>
  );
}
