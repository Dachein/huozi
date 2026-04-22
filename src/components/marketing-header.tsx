import Link from "next/link";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { t, type Locale } from "@/lib/i18n";
import { isEdge } from "@/lib/edition";
import { getIdentity } from "@/lib/identity";

export async function MarketingHeader({ locale }: { locale: Locale }) {
  const _ = (key: string) => t(locale, key);

  // Auth state determines the right-side CTA:
  //   - signed in  → "Workspace →" shortcut
  //   - signed out → prominent "Sign in" button
  //   - edge mode  → "Connect" (no accounts exist)
  // Failures fall back to the signed-out state silently.
  let authSlot: React.ReactNode;
  if (isEdge()) {
    authSlot = (
      <Link
        href="/connect"
        className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:border-foreground/40 transition-colors"
      >
        Connect
      </Link>
    );
  } else {
    let signedIn = false;
    try {
      const identity = await getIdentity();
      const principal = await identity.getPrincipal();
      signedIn = !!principal;
    } catch {
      signedIn = false;
    }
    authSlot = signedIn ? (
      <Link
        href="/workspace"
        className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90 transition-opacity"
      >
        {_("nav.workspace")} →
      </Link>
    ) : (
      <Link
        href="/login?redirect=/workspace"
        className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90 transition-opacity"
      >
        {_("nav.signIn")}
      </Link>
    );
  }

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
        <nav className="flex items-center gap-4 sm:gap-5">
          <Link
            href="/cloud"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {_("nav.cloud")}
          </Link>
          <Link
            href="/docs"
            className="hidden sm:inline text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {_("nav.docs")}
          </Link>
          <Link
            href="/start"
            className="hidden sm:inline text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {_("nav.getStarted")}
          </Link>
          <LocaleSwitcher />
          {authSlot}
        </nav>
      </div>
    </header>
  );
}
