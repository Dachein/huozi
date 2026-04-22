import Link from "next/link";
import { t, type Locale } from "@/lib/i18n";

/**
 * Marketing header.
 *
 * Four links: Cloud · Edge · Docs · Get Started. Nothing else.
 *
 * Deliberate omissions:
 *   - No LocaleSwitcher here — it lives in the footer. Language is a
 *     visit-time preference, not a primary action, so it doesn't need
 *     top-row real estate.
 *   - No Sign in. That's a *Cloud* action, not a huozi.app-generic one.
 *     Signing in lives inside `/cloud` (since Edge users don't sign in
 *     at all). Keeping it out of the global header makes the product
 *     hierarchy readable: huozi.app is the umbrella; Cloud and Edge are
 *     the two siblings underneath.
 */
export function MarketingHeader({ locale }: { locale: Locale }) {
  const _ = (key: string) => t(locale, key);

  return (
    <header className="border-b border-border/50">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
        <Link
          href="/"
          className="flex items-baseline gap-2 text-lg font-medium tracking-wide"
        >
          <span className="font-serif text-xl font-bold text-accent leading-none">
            字
          </span>
          {_("nav.home")}
        </Link>
        <nav className="flex items-center gap-5 sm:gap-6">
          <Link
            href="/cloud"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {_("nav.cloud")}
          </Link>
          <Link
            href="/edge"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {_("nav.edge")}
          </Link>
          <Link
            href="/docs"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {_("nav.docs")}
          </Link>
          <Link
            href="/blog"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {_("nav.blog")}
          </Link>
          <Link
            href="/start"
            className="hidden sm:inline text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {_("nav.getStarted")}
          </Link>
        </nav>
      </div>
    </header>
  );
}
