import Link from "next/link";
import { getLocale } from "@/lib/i18n/server";
import { t } from "@/lib/i18n";

export default async function HomePage() {
  const locale = await getLocale();
  const _ = (key: string) => t(locale, key);
  const isCJK = locale === "zh" || locale === "ja";

  return (
    <>
      {/* Hero — calligraphic opening, product-agnostic. */}
      <section className="relative flex flex-col items-center justify-center px-6 pt-28 pb-16 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute top-1/4 left-0 right-0 h-64 animate-mist"
            style={{
              background:
                "radial-gradient(ellipse 80% 50% at 50% 50%, var(--border), transparent)",
            }}
          />
        </div>

        <div className="relative z-10 text-center max-w-2xl">
          <h1
            className={`font-serif font-bold leading-tight animate-ink-reveal ${
              isCJK
                ? "text-4xl sm:text-5xl md:text-6xl tracking-[0.2em]"
                : "text-3xl sm:text-4xl md:text-5xl tracking-[0.08em]"
            }`}
          >
            {_("home.title1")}
          </h1>
          <h2
            className={`font-serif mt-4 animate-ink-reveal delay-200 whitespace-nowrap ${
              isCJK
                ? "text-4xl sm:text-5xl md:text-6xl tracking-[0.2em]"
                : "text-3xl sm:text-4xl md:text-5xl tracking-[0.08em]"
            }`}
          >
            <span
              className={`text-accent font-bold ${
                isCJK
                  ? "text-5xl sm:text-6xl md:text-7xl"
                  : "text-4xl sm:text-5xl md:text-6xl"
              }`}
            >
              {_("home.title2.highlight")}
            </span>
            <span className="text-muted-foreground">
              {_("home.title2.rest")}
            </span>
          </h2>

          <div className="mt-10 mb-8 flex items-center justify-center gap-4 animate-ink-reveal-slow delay-400">
            <span className="block w-16 h-px bg-border" />
            <span className="text-accent text-lg font-serif">
              {_("home.divider")}
            </span>
            <span className="block w-16 h-px bg-border" />
          </div>

          <p className="text-lg sm:text-xl text-muted-foreground leading-relaxed animate-ink-reveal-slow delay-600">
            {_("home.subtitle1")}
            <br />
            <span className="text-sm sm:text-base">{_("home.subtitle2")}</span>
          </p>
        </div>
      </section>

      {/* Two products: Cloud + Edge — the core framing. */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground text-center mb-8 font-serif">
          {_("home.products.label")}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Cloud card */}
          <Link
            href="/cloud"
            className="group relative rounded-2xl border border-border bg-background hover:border-foreground/40 transition-colors p-8 flex flex-col"
          >
            <div className="flex items-baseline gap-3 mb-4">
              <span className="font-serif text-3xl text-accent">云</span>
              <h3 className="font-serif text-2xl font-bold">huozi Cloud</h3>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed mb-5">
              {_("home.cloud.tagline")}
            </p>
            <ul className="text-xs text-muted-foreground space-y-1.5 mb-6">
              <li>· {_("home.cloud.bullet1")}</li>
              <li>· {_("home.cloud.bullet2")}</li>
              <li>· {_("home.cloud.bullet3")}</li>
            </ul>
            <div className="mt-auto pt-2 flex items-center justify-between">
              <span className="text-sm font-medium group-hover:text-foreground transition-colors">
                {_("home.cloud.cta")} →
              </span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider rounded-full border border-border/70 px-2 py-0.5">
                hosted
              </span>
            </div>
          </Link>

          {/* Edge card */}
          <Link
            href="/edge"
            className="group relative rounded-2xl border border-border bg-background hover:border-foreground/40 transition-colors p-8 flex flex-col"
          >
            <div className="flex items-baseline gap-3 mb-4">
              <span className="font-serif text-3xl text-accent">源</span>
              <h3 className="font-serif text-2xl font-bold">huozi Edge</h3>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed mb-5">
              {_("home.edge.tagline")}
            </p>
            <ul className="text-xs text-muted-foreground space-y-1.5 mb-6">
              <li>· {_("home.edge.bullet1")}</li>
              <li>· {_("home.edge.bullet2")}</li>
              <li>· {_("home.edge.bullet3")}</li>
            </ul>
            <div className="mt-auto pt-2 flex items-center justify-between">
              <span className="text-sm font-medium group-hover:text-foreground transition-colors">
                {_("home.edge.cta")} →
              </span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider rounded-full border border-border/70 px-2 py-0.5">
                open source · MIT
              </span>
            </div>
          </Link>
        </div>
        <p className="mt-6 text-xs text-muted-foreground/80 text-center max-w-lg mx-auto">
          {_("home.products.footnote")}
        </p>
      </section>

      {/* Shared features — apply to both editions. */}
      <section className="mx-auto max-w-4xl px-6 py-16">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground text-center mb-8 font-serif">
          {_("home.shared.label")}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <FeatureCard
            icon={_("home.feat1.icon")}
            title={_("home.feat1.title")}
            desc={_("home.feat1.desc")}
          />
          <FeatureCard
            icon={_("home.feat2.icon")}
            title={_("home.feat2.title")}
            desc={_("home.feat2.desc")}
          />
          <FeatureCard
            icon={_("home.feat3.icon")}
            title={_("home.feat3.title")}
            desc={_("home.feat3.desc")}
          />
        </div>
      </section>

      {/* Code example */}
      <section className="mx-auto max-w-3xl px-6 pb-16">
        <p className="text-sm font-medium text-muted-foreground mb-4 text-center font-serif tracking-wider">
          {_("home.code.title")}
        </p>
        <pre className="rounded-xl border border-border bg-muted/50 p-6 text-sm overflow-x-auto font-mono leading-relaxed">
          <code>{`# Mount the workspace in Claude Code:
claude mcp add --transport http huozi https://cloud.huozi.app/mcp \\
  -H "Authorization: Bearer hz_your_key"

# Then ask the Agent to create a file:
#   > write a README.md explaining the project
#
# It lands in your workspace, live-synced to the Web UI at
# huozi.app/workspace — with full commit history.`}</code>
        </pre>
      </section>
    </>
  );
}

function FeatureCard({
  icon,
  title,
  desc,
}: {
  icon: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/30 p-7 transition-all hover:border-border hover:shadow-sm">
      <div className="font-serif text-2xl text-accent mb-3">{icon}</div>
      <h3 className="font-serif text-base font-bold mb-2">{title}</h3>
      <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
    </div>
  );
}
