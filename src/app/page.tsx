import Link from "next/link";
import { ConversationalInstall } from "@/components/conversational-install";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { getLocale } from "@/lib/i18n/server";
import { t } from "@/lib/i18n";

export default async function HomePage() {
  const locale = await getLocale();
  const _ = (key: string) => t(locale, key);
  const isCJK = locale === "zh" || locale === "ja";

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="border-b border-border/50">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <span className="flex items-baseline gap-2 text-lg font-medium tracking-wide">
            <span className="font-serif text-xl font-bold text-accent leading-none">字</span>
            {_("nav.home")}
          </span>
          <nav className="flex items-center gap-5">
            <Link
              href="/start"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {_("nav.getStarted")}
            </Link>
            <LocaleSwitcher />
          </nav>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1">
        <section className="relative flex flex-col items-center justify-center px-6 pt-32 pb-20 overflow-hidden">
          {/* Decorative mist layers */}
          <div className="absolute inset-0 pointer-events-none">
            <div
              className="absolute top-1/4 left-0 right-0 h-64 animate-mist"
              style={{
                background:
                  "radial-gradient(ellipse 80% 50% at 50% 50%, var(--border), transparent)",
              }}
            />
          </div>

          {/* Main title */}
          <div className="relative z-10 text-center">
            <h1 className={`font-serif font-bold leading-tight animate-ink-reveal ${
              isCJK
                ? "text-4xl sm:text-5xl md:text-6xl tracking-[0.2em]"
                : "text-3xl sm:text-4xl md:text-5xl tracking-[0.08em]"
            }`}>
              {_("home.title1")}
            </h1>
            <h2 className={`font-serif mt-4 animate-ink-reveal delay-200 whitespace-nowrap ${
              isCJK
                ? "text-4xl sm:text-5xl md:text-6xl tracking-[0.2em]"
                : "text-3xl sm:text-4xl md:text-5xl tracking-[0.08em]"
            }`}>
              <span className={`text-accent font-bold ${
                isCJK
                  ? "text-5xl sm:text-6xl md:text-7xl"
                  : "text-4xl sm:text-5xl md:text-6xl"
              }`}>
                {_("home.title2.highlight")}
              </span>
              <span className="text-muted-foreground">
                {_("home.title2.rest")}
              </span>
            </h2>

            {/* Decorative divider */}
            <div className="mt-10 mb-8 flex items-center justify-center gap-4 animate-ink-reveal-slow delay-400">
              <span className="block w-16 h-px bg-border" />
              <span className="text-accent text-lg font-serif">
                {_("home.divider")}
              </span>
              <span className="block w-16 h-px bg-border" />
            </div>

            <p className="text-lg sm:text-xl text-muted-foreground max-w-lg mx-auto leading-relaxed animate-ink-reveal-slow delay-600">
              {_("home.subtitle1")}
              <br />
              {_("home.subtitle2")}
            </p>

            <div className="mt-10 flex items-center justify-center gap-4 animate-ink-reveal-slow delay-800">
              <Link
                href="/start"
                className="rounded-md bg-primary px-7 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
              >
                {_("home.cta.start")}
              </Link>
              <a
                href="/dachein/manifesto"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-border px-7 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
              >
                {_("home.cta.preview")}
              </a>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-4xl px-6 py-20">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="rounded-xl border border-border/60 bg-muted/30 p-8 transition-all hover:border-border hover:shadow-sm">
              <div className="font-serif text-3xl text-accent mb-4">
                {_("home.feat1.icon")}
              </div>
              <h3 className="font-serif text-lg font-bold mb-2">
                {_("home.feat1.title")}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {_("home.feat1.desc")}
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/30 p-8 transition-all hover:border-border hover:shadow-sm">
              <div className="font-serif text-3xl text-accent mb-4">
                {_("home.feat2.icon")}
              </div>
              <h3 className="font-serif text-lg font-bold mb-2">
                {_("home.feat2.title")}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {_("home.feat2.desc")}
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/30 p-8 transition-all hover:border-border hover:shadow-sm">
              <div className="font-serif text-3xl text-accent mb-4">
                {_("home.feat3.icon")}
              </div>
              <h3 className="font-serif text-lg font-bold mb-2">
                {_("home.feat3.title")}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {_("home.feat3.desc")}
              </p>
            </div>
          </div>
        </section>

        {/* Conversational Install */}
        <section className="mx-auto max-w-3xl px-6 pb-16">
          <p className="text-sm font-medium text-muted-foreground mb-6 text-center font-serif tracking-wider">
            {_("home.install.title")}
          </p>
          <p className="text-center text-sm text-muted-foreground mb-6">
            {_("home.install.desc")}
          </p>
          <ConversationalInstall />
        </section>

        {/* Code example */}
        <section className="mx-auto max-w-3xl px-6 pb-24">
          <p className="text-sm font-medium text-muted-foreground mb-4 text-center font-serif tracking-wider">
            {_("home.code.title")}
          </p>
          <pre className="rounded-xl border border-border bg-muted/50 p-6 text-sm overflow-x-auto font-mono leading-relaxed">
            <code>{`curl -X POST https://huozi.app/api/v1/pages \\
  -H "Authorization: Bearer hz_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Hello World",
    "content": "# Hello\\n\\nPublished from my agent."
  }'

# Response:
# { "url": "https://huozi.app/you/hello-world" }`}</code>
          </pre>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 py-8">
        <div className="mx-auto max-w-5xl px-6 text-center">
          <span className="font-serif text-sm text-muted-foreground tracking-wider">
            {_("home.footer")}
          </span>
        </div>
      </footer>
    </div>
  );
}
