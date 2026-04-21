import Link from "next/link";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { t, type Locale } from "@/lib/i18n";

export function SiteHeader({ locale }: { locale: Locale }) {
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
        <nav className="flex items-center gap-5">
          <Link
            href="/start"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {_("nav.getStarted")}
          </Link>
          <Link
            href="/docs"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {_("nav.docs")}
          </Link>
          <Link
            href="/cloud"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {_("nav.cloud")}
          </Link>
          <LocaleSwitcher />
        </nav>
      </div>
    </header>
  );
}
