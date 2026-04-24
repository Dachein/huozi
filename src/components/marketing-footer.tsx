import Link from "next/link";
import { t, type Locale } from "@/lib/i18n";

export function MarketingFooter({ locale }: { locale: Locale }) {
  const _ = (key: string) => t(locale, key);
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border/50 mt-20 py-12">
      <div className="mx-auto max-w-5xl px-6">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4 sm:gap-10">
          {/* Brand */}
          <div className="col-span-2 sm:col-span-1">
            <Link
              href="/"
              className="inline-flex items-baseline gap-2 text-sm font-medium tracking-wide"
            >
              <span className="font-serif text-lg font-bold text-accent leading-none">
                字
              </span>
              huozi
            </Link>
            <p className="mt-3 text-xs text-muted-foreground leading-relaxed max-w-[14rem]">
              {_("footer.tagline")}
            </p>
          </div>

          {/* Product */}
          <FooterCol title={_("footer.col.product")}>
            <FooterLink href="/cloud">{_("nav.cloud")}</FooterLink>
            <FooterLink href="/edge">{_("nav.edge")}</FooterLink>
            <FooterLink href="/start">{_("nav.getStarted")}</FooterLink>
          </FooterCol>

          {/* Resources */}
          <FooterCol title={_("footer.col.resources")}>
            <FooterLink href="/docs">{_("nav.docs")}</FooterLink>
            <FooterLink href="/blog">{_("nav.blog")}</FooterLink>
          </FooterCol>

          {/* Source */}
          <FooterCol title={_("footer.col.source")}>
            <FooterExternal href="https://github.com/Dachein/huozi">
              GitHub
            </FooterExternal>
          </FooterCol>
        </div>

        <div className="mt-10 pt-6 border-t border-border/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span>© {year} huozi.app</span>
          <span>{_("footer.legal")}</span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/80 mb-3">
        {title}
      </h4>
      <ul className="flex flex-col gap-2">{children}</ul>
    </div>
  );
}

function FooterLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {children}
      </Link>
    </li>
  );
}

function FooterExternal({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {children}
      </a>
    </li>
  );
}
