import Link from "next/link";
import type { Metadata } from "next";
import { CopyButton } from "@/components/copy-button";
import { getLocale } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "huozi Edge — Self-host the Agent drive",
  description:
    "Open-source, single-deployer edition of huozi. Deploy in one click to Cloudflare or Vercel. No Supabase, no accounts, MIT licensed.",
  openGraph: {
    title: "huozi Edge — Self-host the Agent drive",
    description:
      "Deploy the same Agent-native cloud drive to your own account. MIT licensed.",
    siteName: "活字 Huozi",
  },
  twitter: {
    card: "summary_large_image",
  },
};

function Code({ code }: { code: string }) {
  return (
    <div className="relative group">
      <pre className="rounded-lg border border-border bg-[#1c1914] text-[#e8e0d0] p-4 pr-12 text-sm overflow-x-auto leading-relaxed">
        <code>{code}</code>
      </pre>
      <CopyButton text={code} />
    </div>
  );
}

export default async function EdgePage() {
  const locale = await getLocale();
  const isCJK = locale === "zh" || locale === "ja";

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
            <span className="inline-flex items-center rounded-full bg-accent/15 text-accent px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider">
              Open Source · MIT
            </span>
            <span className="text-xs text-muted-foreground">
              github.com/Dachein/huozi
            </span>
          </div>

          <h1
            className={`font-serif font-bold leading-tight animate-ink-reveal ${
              isCJK
                ? "text-4xl sm:text-5xl md:text-6xl tracking-[0.15em]"
                : "text-3xl sm:text-4xl md:text-5xl tracking-[0.06em]"
            }`}
          >
            <span className="text-accent">源</span> huozi Edge
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-muted-foreground leading-relaxed animate-ink-reveal delay-200">
            The same Agent drive, on your own infrastructure.
            <br />
            <span className="text-sm sm:text-base">
              No Supabase. No email login. One deployer, one workspace,
              one domain you own.
            </span>
          </p>

          <div className="mt-10 mb-4 flex items-center justify-center gap-4 animate-ink-reveal-slow delay-400">
            <span className="block w-16 h-px bg-border" />
            <span className="text-accent text-lg font-serif">源</span>
            <span className="block w-16 h-px bg-border" />
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a
              href="https://deploy.workers.cloudflare.com/?url=https://github.com/Dachein/huozi"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-[#f48120] px-6 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
            >
              Deploy to Cloudflare →
            </a>
            <a
              href="https://vercel.com/new/clone?repository-url=https://github.com/Dachein/huozi"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-[#171717] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#333] transition-colors"
            >
              Deploy to Vercel →
            </a>
            <a
              href="https://github.com/Dachein/huozi"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-border px-5 py-2.5 text-sm font-medium hover:border-foreground/30 transition-colors"
            >
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* Why Edge */}
      <section className="mx-auto max-w-3xl px-6 py-12">
        <h2 className="font-serif text-2xl sm:text-3xl font-bold tracking-wide mb-4">
          Same drive, yours to run
        </h2>
        <p className="text-muted-foreground leading-relaxed">
          Edge ships the <strong className="text-foreground">exact same</strong>{" "}
          MCP surface, Claude Code compatibility, live sync, commit history,
          and public share URLs as Cloud — just without the hosted account
          system. You hold <code className="font-mono text-xs bg-muted px-1 rounded">HUOZI_ADMIN_SECRET</code>,
          you deploy to your own Cloudflare or Vercel, and anyone you hand a
          pasted API key to can connect an Agent.
        </p>
        <p className="mt-4 text-muted-foreground leading-relaxed">
          Because both editions are one codebase guarded by{" "}
          <code className="font-mono text-xs bg-muted px-1 rounded">HUOZI_EDITION</code>,
          every bug fix and feature lands in both at the same time.
        </p>
      </section>

      {/* Comparison */}
      <section className="mx-auto max-w-3xl px-6 py-12">
        <h2 className="font-serif text-xl font-bold tracking-wide mb-4">
          Cloud vs Edge
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-border rounded-lg">
            <thead>
              <tr>
                <th className="text-left px-4 py-2.5 font-medium border-b border-border bg-muted"></th>
                <th className="text-left px-4 py-2.5 font-medium border-b border-border bg-muted">
                  Cloud
                </th>
                <th className="text-left px-4 py-2.5 font-medium border-b border-border bg-muted">
                  Edge
                </th>
              </tr>
            </thead>
            <tbody className="text-xs">
              <tr>
                <Td label>Who operates it</Td>
                <Td>huozi.app</Td>
                <Td>You</Td>
              </tr>
              <tr>
                <Td label>Auth</Td>
                <Td>Email OTP (Supabase)</Td>
                <Td>Admin secret + paste-key</Td>
              </tr>
              <tr>
                <Td label>Users per instance</Td>
                <Td>Many</Td>
                <Td>One deployer</Td>
              </tr>
              <tr>
                <Td label>Workspaces per user</Td>
                <Td>One (expandable)</Td>
                <Td>One fixed workspace</Td>
              </tr>
              <tr>
                <Td label>Cost</Td>
                <Td>Pay huozi.app</Td>
                <Td>Pay Cloudflare / Vercel (often $0)</Td>
              </tr>
              <tr>
                <Td label>License</Td>
                <Td>Proprietary service</Td>
                <Td>MIT</Td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Bootstrap */}
      <section className="mx-auto max-w-3xl px-6 py-12" id="bootstrap">
        <h2 className="font-serif text-xl font-bold tracking-wide mb-4">
          Bootstrap in 3 steps
        </h2>
        <ol className="space-y-6 text-sm">
          <li>
            <div className="flex items-baseline gap-3 mb-2">
              <span className="font-mono text-xs text-muted-foreground">01</span>
              <h3 className="font-medium">Deploy + set secrets</h3>
            </div>
            <p className="text-muted-foreground mb-3 ml-8 leading-relaxed">
              One-click deploy, then set a strong{" "}
              <code className="font-mono text-xs bg-muted px-1 rounded">HUOZI_ADMIN_SECRET</code>
              {" "}and{" "}
              <code className="font-mono text-xs bg-muted px-1 rounded">HUOZI_EDITION=edge</code>.
            </p>
            <div className="ml-8">
              <Code
                code={`export HUOZI_ADMIN_SECRET=$(openssl rand -hex 32)
export HUOZI_EDITION=edge
# set on both the worker and the Next.js app`}
              />
            </div>
          </li>

          <li>
            <div className="flex items-baseline gap-3 mb-2">
              <span className="font-mono text-xs text-muted-foreground">02</span>
              <h3 className="font-medium">Mint the admin key</h3>
            </div>
            <p className="text-muted-foreground mb-3 ml-8 leading-relaxed">
              Call the worker&rsquo;s admin endpoint once to mint your first
              API key. You&rsquo;ll paste it into the web UI in step 3.
            </p>
            <div className="ml-8">
              <Code
                code={`curl -X POST https://<your-worker>/admin/mint-key \\
  -H "X-Admin-Secret: $HUOZI_ADMIN_SECRET" \\
  -H "Content-Type: application/json" \\
  -d '{"workspace_id":"ws_default","principal_id":"admin",
       "principal_type":"user","name":"[other] Admin · browser"}'`}
              />
            </div>
          </li>

          <li>
            <div className="flex items-baseline gap-3 mb-2">
              <span className="font-mono text-xs text-muted-foreground">03</span>
              <h3 className="font-medium">Paste key, start writing</h3>
            </div>
            <p className="text-muted-foreground ml-8 leading-relaxed">
              Visit <code className="font-mono text-xs bg-muted px-1 rounded">https://&lt;your-domain&gt;/connect</code>,
              paste the returned <code className="font-mono text-xs bg-muted px-1 rounded">hz_…</code>
              {" "}key, and you&rsquo;re in. Connect Claude Code / Cursor /
              Desktop from the Keys page just like on Cloud.
            </p>
          </li>
        </ol>
      </section>

      {/* CTAs again */}
      <section className="mx-auto max-w-3xl px-6 pb-20 pt-8 text-center">
        <div className="flex flex-wrap items-center justify-center gap-3">
          <a
            href="https://github.com/Dachein/huozi"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-border px-5 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            GitHub repo
          </a>
          <Link
            href="/docs"
            className="rounded-md border border-border px-5 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            MCP reference
          </Link>
          <Link
            href="/cloud"
            className="rounded-md border border-border px-5 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            Compare with Cloud →
          </Link>
        </div>
      </section>
    </>
  );
}

function Td({
  children,
  label,
}: {
  children: React.ReactNode;
  label?: boolean;
}) {
  return (
    <td
      className={`px-4 py-2.5 border-b border-border/60 align-top ${
        label ? "font-medium text-foreground" : "text-muted-foreground"
      }`}
    >
      {children}
    </td>
  );
}
