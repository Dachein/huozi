import Link from "next/link";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { t, type Locale } from "@/lib/i18n";

/**
 * Footer for the marketing layout.
 *
 * Quiet, small, deliberately secondary. Holds:
 *   - the pairing line (both editions, in one breath)
 *   - light nav back-links
 *   - LocaleSwitcher (moved out of the header so the header can stay focused
 *     on product navigation)
 *   - GitHub link
 */
export function MarketingFooter({ locale }: { locale: Locale }) {
  const _ = (key: string) => t(locale, key);
  return (
    <footer className="border-t border-border/50 mt-20 py-10">
      <div className="mx-auto max-w-5xl px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="font-serif">
            <span className="text-accent">字</span> huozi
          </span>
          <span className="text-border">·</span>
          <Link href="/cloud" className="hover:text-foreground transition-colors">
            Cloud
          </Link>
          <Link href="/edge" className="hover:text-foreground transition-colors">
            Edge
          </Link>
          <Link href="/docs" className="hover:text-foreground transition-colors">
            {_("nav.docs")}
          </Link>
          <a
            href="https://github.com/Dachein/huozi"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            GitHub
          </a>
        </div>
        <LocaleSwitcher placement="up" />
      </div>
    </footer>
  );
}
