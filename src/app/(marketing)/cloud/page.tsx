import Link from "next/link";
import type { Metadata } from "next";
import { CopyButton } from "@/components/copy-button";
import { getLocale } from "@/lib/i18n/server";
import { t } from "@/lib/i18n";
import { getIdentity } from "@/lib/identity";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const _ = (key: string) => t(locale, key);
  return {
    title: _("cloud.meta.title"),
    description: _("cloud.meta.description"),
    openGraph: {
      title: _("cloud.meta.title"),
      description: _("cloud.meta.description"),
      siteName: "活字 Huozi",
    },
    twitter: {
      card: "summary_large_image",
    },
  };
}

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  return (
    <div className="relative group">
      <pre className="rounded-lg border border-border bg-muted p-4 pr-12 text-sm overflow-x-auto">
        <code className={lang ? `language-${lang}` : undefined}>{code}</code>
      </pre>
      <CopyButton text={code} />
    </div>
  );
}

function Status({
  kind,
  text,
}: {
  kind: "shipping" | "coming" | "preview";
  text: string;
}) {
  const cls = {
    shipping: "bg-accent/15 text-accent",
    coming: "bg-muted-foreground/15 text-muted-foreground",
    preview: "bg-muted-foreground/15 text-muted-foreground",
  }[kind];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider ${cls}`}>
      {text}
    </span>
  );
}

export default async function CloudPage() {
  const locale = await getLocale();
  const _ = (key: string) => t(locale, key);
  const isCJK = locale === "zh" || locale === "ja";

  // Auth-aware primary CTA. Signed-out sees Sign in (the main funnel);
  // signed-in jumps straight to their workspace. Failures (no Supabase
  // env, network hiccup) silently fall back to the signed-out CTA.
  let signedIn = false;
  try {
    const identity = await getIdentity();
    signedIn = !!(await identity.getPrincipal());
  } catch {
    signedIn = false;
  }

  return (
    <>
        {/* Hero */}
        <section className="relative flex flex-col items-center justify-center px-6 pt-24 pb-16 overflow-hidden">
          <div className="absolute inset-0 pointer-events-none">
            <div
              className="absolute top-1/3 left-0 right-0 h-64 animate-mist"
              style={{
                background:
                  "radial-gradient(ellipse 80% 50% at 50% 50%, var(--border), transparent)",
              }}
            />
          </div>

          <div className="relative z-10 text-center max-w-3xl">
            <div className="mb-6 flex items-center justify-center gap-3">
              <Status kind="preview" text={_("cloud.status.preview")} />
              <span className="text-xs text-muted-foreground">
                cloud.huozi.app
              </span>
            </div>

            <h1
              className={`font-serif font-bold leading-tight animate-ink-reveal ${
                isCJK
                  ? "text-4xl sm:text-5xl md:text-6xl tracking-[0.15em]"
                  : "text-3xl sm:text-4xl md:text-5xl tracking-[0.06em]"
              }`}
            >
              <span className="text-accent">云</span> huozi Cloud
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-muted-foreground leading-relaxed animate-ink-reveal delay-200">
              {_("cloud.hero.tagline1")}
              <br />
              <span className="text-sm sm:text-base">
                {_("cloud.hero.tagline2")}
              </span>
            </p>

            <div className="mt-10 mb-4 flex items-center justify-center gap-4 animate-ink-reveal-slow delay-400">
              <span className="block w-16 h-px bg-border" />
              <span className="text-accent text-lg font-serif">载</span>
              <span className="block w-16 h-px bg-border" />
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href={signedIn ? "/workspace" : "/login?redirect=/workspace"}
                className="rounded-full bg-foreground px-6 py-2.5 text-sm font-medium text-background hover:opacity-90 transition-opacity"
              >
                {signedIn ? _("cloud.cta.open") : _("cloud.cta.signIn")} →
              </Link>
              <Link
                href="/start"
                className="rounded-full border border-border px-6 py-2.5 text-sm font-medium hover:border-foreground/30 transition-colors"
              >
                {_("cloud.cta.connectAgent")} →
              </Link>
            </div>
          </div>
        </section>

        {/* The metaphor */}
        <section className="mx-auto max-w-3xl px-6 py-12">
          <h2 className="font-serif text-2xl sm:text-3xl font-bold tracking-wide mb-4">
            {_("cloud.metaphor.title")}
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            {_("cloud.metaphor.body1")}
          </p>
          <p className="mt-4 text-muted-foreground leading-relaxed">
            {_("cloud.metaphor.body2")}
          </p>

          <div className="mt-8 overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">
                    {_("cloud.compare.physical")}
                  </th>
                  <th className="px-4 py-3 text-left font-medium">
                    {_("cloud.compare.huozi")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <Row a={_("cloud.compare.r1a")} b={_("cloud.compare.r1b")} />
                <Row a={_("cloud.compare.r2a")} b={_("cloud.compare.r2b")} />
                <Row a={_("cloud.compare.r3a")} b={_("cloud.compare.r3b")} />
                <Row a={_("cloud.compare.r4a")} b={_("cloud.compare.r4b")} />
                <Row a={_("cloud.compare.r5a")} b={_("cloud.compare.r5b")} />
              </tbody>
            </table>
          </div>
        </section>

        {/* What's shipped today */}
        <section className="mx-auto max-w-3xl px-6 py-12">
          <div className="flex items-center gap-3 mb-6">
            <h2 className="font-serif text-2xl sm:text-3xl font-bold tracking-wide">
              {_("cloud.shipped.title")}
            </h2>
            <Status kind="shipping" text={_("cloud.status.shipping")} />
          </div>

          <p className="text-muted-foreground leading-relaxed mb-8">
            {_("cloud.shipped.intro1")}
            <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">
              https://cloud.huozi.app/mcp
            </code>
            {_("cloud.shipped.intro2")}
          </p>

          <div className="grid sm:grid-cols-2 gap-4">
            <ToolCard
              name="huozi_read"
              desc={_("cloud.tools.read.desc")}
              ccMirror
              ccMirrorLabel={_("cloud.tools.ccMirror")}
              extensionLabel={_("cloud.tools.extension")}
            />
            <ToolCard
              name="huozi_edit"
              desc={_("cloud.tools.edit.desc")}
              ccMirror
              ccMirrorLabel={_("cloud.tools.ccMirror")}
              extensionLabel={_("cloud.tools.extension")}
            />
            <ToolCard
              name="huozi_write"
              desc={_("cloud.tools.write.desc")}
              ccMirror
              ccMirrorLabel={_("cloud.tools.ccMirror")}
              extensionLabel={_("cloud.tools.extension")}
            />
            <ToolCard
              name="huozi_glob"
              desc={_("cloud.tools.glob.desc")}
              ccMirror
              ccMirrorLabel={_("cloud.tools.ccMirror")}
              extensionLabel={_("cloud.tools.extension")}
            />
            <ToolCard
              name="huozi_grep"
              desc={_("cloud.tools.grep.desc")}
              ccMirror
              ccMirrorLabel={_("cloud.tools.ccMirror")}
              extensionLabel={_("cloud.tools.extension")}
            />
            <ToolCard
              name="huozi_batch_edit"
              desc={_("cloud.tools.batch.desc")}
              extension
              ccMirrorLabel={_("cloud.tools.ccMirror")}
              extensionLabel={_("cloud.tools.extension")}
            />
            <ToolCard
              name="huozi_history"
              desc={_("cloud.tools.history.desc")}
              extension
              ccMirrorLabel={_("cloud.tools.ccMirror")}
              extensionLabel={_("cloud.tools.extension")}
            />
          </div>

          <div className="mt-10">
            <h3 className="text-lg font-semibold mb-4">
              {_("cloud.underHood.title")}
            </h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <strong className="text-foreground">
                  {_("cloud.underHood.b1.label")}
                </strong>
                {_("cloud.underHood.b1.desc")}
              </li>
              <li>
                <strong className="text-foreground">
                  {_("cloud.underHood.b2.label")}
                </strong>
                {_("cloud.underHood.b2.desc")}
              </li>
              <li>
                <strong className="text-foreground">
                  {_("cloud.underHood.b3.label")}
                </strong>
                {_("cloud.underHood.b3.desc")}
              </li>
              <li>
                <strong className="text-foreground">
                  {_("cloud.underHood.b4.label")}
                </strong>
                {_("cloud.underHood.b4.desc")}
              </li>
              <li>
                <strong className="text-foreground">
                  {_("cloud.underHood.b5.label")}
                </strong>
                {_("cloud.underHood.b5.desc")}
              </li>
            </ul>
          </div>
        </section>

        {/* Design principles */}
        <section className="mx-auto max-w-3xl px-6 py-12 border-t border-border/50">
          <h2 className="font-serif text-2xl sm:text-3xl font-bold tracking-wide mb-6">
            {_("cloud.principles.title")}
          </h2>

          <ol className="space-y-6">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <Principle
                key={n}
                n={n}
                title={_(`cloud.principles.${n}.title`)}
                body={_(`cloud.principles.${n}.body`)}
              />
            ))}
          </ol>
        </section>

        {/* Coming soon */}
        <section className="mx-auto max-w-3xl px-6 py-12 border-t border-border/50">
          <div className="flex items-center gap-3 mb-6">
            <h2 className="font-serif text-2xl sm:text-3xl font-bold tracking-wide">
              {_("cloud.roadmap.title")}
            </h2>
            <Status kind="coming" text={_("cloud.status.coming")} />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <Roadmap
                key={n}
                label={_(`cloud.roadmap.${n}.label`)}
                desc={_(`cloud.roadmap.${n}.desc`)}
              />
            ))}
          </div>
        </section>

        {/* Try it */}
        <section
          id="try-it"
          className="mx-auto max-w-3xl px-6 py-12 border-t border-border/50"
        >
          <h2 className="font-serif text-2xl sm:text-3xl font-bold tracking-wide mb-6">
            {_("cloud.try.title")}
          </h2>
          <p className="text-muted-foreground leading-relaxed mb-6">
            {_("cloud.try.intro")}
          </p>

          <h3 className="text-sm font-semibold uppercase text-muted-foreground mb-3 mt-8">
            {_("cloud.try.h.claudeCode")}
          </h3>
          <CodeBlock
            code={`claude mcp add huozi-cloud -- \\
  npx -y mcp-remote https://cloud.huozi.app/mcp \\
  --header "Authorization: Bearer hz_YOUR_TOKEN"`}
          />

          <h3 className="text-sm font-semibold uppercase text-muted-foreground mb-3 mt-8">
            {_("cloud.try.h.claudeDesktop")}
          </h3>
          <CodeBlock
            code={`// ~/Library/Application Support/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "huozi-cloud": {
      "command": "npx",
      "args": [
        "-y", "mcp-remote",
        "https://cloud.huozi.app/mcp",
        "--header", "Authorization: Bearer hz_YOUR_TOKEN"
      ]
    }
  }
}`}
          />

          <h3 className="text-sm font-semibold uppercase text-muted-foreground mb-3 mt-8">
            {_("cloud.try.h.rawHttp")}
          </h3>
          <CodeBlock
            code={`curl -X POST https://cloud.huozi.app/mcp \\
  -H "Authorization: Bearer hz_YOUR_TOKEN" \\
  -H "content-type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`}
          />
        </section>

        {/* Who it's for */}
        <section className="mx-auto max-w-3xl px-6 py-12 border-t border-border/50">
          <h2 className="font-serif text-2xl sm:text-3xl font-bold tracking-wide mb-6">
            {_("cloud.who.title")}
          </h2>

          <div className="space-y-6">
            {[1, 2, 3, 4].map((n) => (
              <Persona
                key={n}
                title={_(`cloud.who.${n}.title`)}
                body={_(`cloud.who.${n}.body`)}
              />
            ))}
          </div>
        </section>

        {/* Footer signature */}
        <section className="mx-auto max-w-3xl px-6 py-12 border-t border-border/50">
          <div className="flex items-baseline justify-between">
            <div>
              <p className="font-serif text-sm">
                <span className="text-accent">字</span> huozi ·{" "}
                <span className="text-accent">云</span> Cloud
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {_("cloud.footer.tagline")}
              </p>
            </div>
            <div className="flex gap-4 text-xs text-muted-foreground">
              <Link href="/" className="hover:text-foreground transition-colors">
                huozi.app
              </Link>
              <Link
                href="/start"
                className="hover:text-foreground transition-colors"
              >
                {_("cloud.footer.publish")}
              </Link>
            </div>
          </div>
        </section>
    </>
  );
}

// ── Small presentational helpers ──────────────────────────────────────

function Row({ a, b }: { a: string; b: string }) {
  return (
    <tr>
      <td className="px-4 py-3 text-muted-foreground">{a}</td>
      <td className="px-4 py-3">{b}</td>
    </tr>
  );
}

function ToolCard({
  name,
  desc,
  ccMirror,
  extension,
  ccMirrorLabel,
  extensionLabel,
}: {
  name: string;
  desc: string;
  ccMirror?: boolean;
  extension?: boolean;
  ccMirrorLabel: string;
  extensionLabel: string;
}) {
  return (
    <div className="rounded-lg border border-border p-5 hover:border-foreground/20 transition-colors">
      <div className="flex items-center justify-between mb-2">
        <code className="font-mono text-sm font-semibold">{name}</code>
        {ccMirror && (
          <span className="text-[10px] uppercase tracking-wider text-accent">
            {ccMirrorLabel}
          </span>
        )}
        {extension && (
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {extensionLabel}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
    </div>
  );
}

function Principle({
  n,
  title,
  body,
}: {
  n: number;
  title: string;
  body: string;
}) {
  return (
    <li className="flex gap-5">
      <span className="flex-shrink-0 font-serif text-2xl font-bold text-accent leading-none pt-1">
        {n}
      </span>
      <div>
        <h3 className="font-semibold mb-1">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
      </div>
    </li>
  );
}

function Roadmap({ label, desc }: { label: string; desc: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-5">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-sm">{label}</h3>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
    </div>
  );
}

function Persona({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h3 className="font-semibold mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
    </div>
  );
}
