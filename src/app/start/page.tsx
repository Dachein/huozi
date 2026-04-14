import Link from "next/link";
import type { Metadata } from "next";
import { CopyButton } from "@/components/copy-button";
import { ConversationalPrompt } from "@/components/conversational-prompt";
import { SiteHeader } from "@/components/site-header";
import { getLocale } from "@/lib/i18n/server";
import { t } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Get Started",
  description: "Set up Huozi in seconds — publish Markdown and HTML via Claude Code, OpenClaw, or API.",
  openGraph: {
    title: "Get Started — 活字 Huozi",
    description: "Set up Huozi in seconds — publish Markdown and HTML via Claude Code, OpenClaw, or API.",
    siteName: "活字 Huozi",
  },
  twitter: {
    card: "summary_large_image",
  },
};

function CopyBlock({ code }: { code: string }) {
  return (
    <div className="relative group">
      <pre className="rounded-lg border border-border bg-muted p-4 pr-12 text-sm overflow-x-auto">
        <code>{code}</code>
      </pre>
      <CopyButton text={code} />
    </div>
  );
}

export default async function StartPage() {
  const locale = await getLocale();
  const _ = (key: string) => t(locale, key);

  return (
    <div className="flex flex-col min-h-screen">
      <SiteHeader locale={locale} />

      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-4 py-16">
          <h1 className="text-4xl font-bold tracking-tight">{_("start.title")}</h1>
          <p className="mt-4 text-lg text-muted-foreground">
            {_("start.subtitle")}
          </p>

          {/* Method 1: Conversational Setup */}
          <section className="mt-16">
            <div className="flex items-center gap-3 mb-4">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
                1
              </span>
              <h2 className="text-2xl font-semibold">{_("start.method1.title")}</h2>
            </div>
            <p className="text-muted-foreground mb-6">
              {_("start.method1.desc")}
            </p>

            <ConversationalPrompt />

            <div className="mt-8">
              <h3 className="text-sm font-semibold mb-3">{_("start.method1.flow")}</h3>
              <ol className="space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2">
                  <span className="font-mono text-foreground">1.</span>
                  {_("start.method1.step1")}
                </li>
                <li className="flex gap-2">
                  <span className="font-mono text-foreground">2.</span>
                  {_("start.method1.step2")}
                </li>
                <li className="flex gap-2">
                  <span className="font-mono text-foreground">3.</span>
                  {_("start.method1.step3")}
                </li>
                <li className="flex gap-2">
                  <span className="font-mono text-foreground">4.</span>
                  {_("start.method1.step4")}
                </li>
              </ol>
            </div>
          </section>

          {/* Method 2: OpenClaw / ClawHub */}
          <section className="mt-16">
            <div className="flex items-center gap-3 mb-4">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
                2
              </span>
              <h2 className="text-2xl font-semibold">{_("start.method2.title")}</h2>
            </div>
            <p className="text-muted-foreground mb-6">
              {_("start.method2.desc")}
            </p>

            <h3 className="text-sm font-semibold uppercase text-muted-foreground mb-3">
              {_("start.method2.installSkill")}
            </h3>
            <CopyBlock code={`npx clawhub install huozi`} />

            <p className="mt-4 text-sm text-muted-foreground mb-3">
              {_("start.method2.orCli")}
            </p>
            <CopyBlock code={`openclaw skills install huozi`} />

            <h3 className="text-sm font-semibold uppercase text-muted-foreground mt-6 mb-3">
              {_("start.method2.configure")}
            </h3>
            <p className="text-sm text-muted-foreground mb-3">
              {_("start.method2.configureDesc")}
            </p>
            <CopyBlock code={`export HUOZI_API_KEY="hz_your_api_key"`} />

            <h3 className="text-sm font-semibold uppercase text-muted-foreground mt-6 mb-3">
              {_("start.method2.usage")}
            </h3>
            <p className="text-sm text-muted-foreground mb-3">
              {_("start.method2.usageDesc")}
            </p>
            <CopyBlock
              code={`"${_("start.method2.usagePrompt")}"`}
            />
          </section>

          {/* Method 3: Claude Code MCP */}
          <section className="mt-16">
            <div className="flex items-center gap-3 mb-4">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
                3
              </span>
              <h2 className="text-2xl font-semibold">{_("start.method3.title")}</h2>
            </div>
            <p className="text-muted-foreground mb-6">
              {_("start.method3.desc")}
            </p>

            <h3 className="text-sm font-semibold uppercase text-muted-foreground mb-3">
              {_("start.method3.installMcp")}
            </h3>
            <CopyBlock
              code={`claude mcp add huozi -- npx -y huozi-mcp-server`}
            />

            <h3 className="text-sm font-semibold uppercase text-muted-foreground mt-6 mb-3">
              {_("start.method3.configureKey")}
            </h3>
            <p className="text-sm text-muted-foreground mb-3">
              {_("start.method3.configureKeyDesc")}
            </p>
            <CopyBlock
              code={`// ~/.claude/settings.json
{
  "mcpServers": {
    "huozi": {
      "command": "npx",
      "args": ["-y", "huozi-mcp-server"],
      "env": {
        "HUOZI_API_KEY": "hz_your_api_key"
      }
    }
  }
}`}
            />

            <p className="mt-4 text-sm text-muted-foreground">
              {_("start.method3.usageThen")}{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">
                &ldquo;{_("start.method3.usagePrompt")}&rdquo;
              </code>
            </p>
          </section>

          {/* Raw API Reference */}
          <section className="mt-16">
            <details className="group">
              <summary className="cursor-pointer text-sm font-semibold text-muted-foreground hover:text-foreground">
                {_("start.rawApi")}
              </summary>
              <div className="mt-4 space-y-4">
                <h3 className="text-sm font-semibold uppercase text-muted-foreground">
                  {_("start.rawApi.signup")}
                </h3>
                <CopyBlock
                  code={`curl -X POST https://huozi.app/api/v1/auth/signup \\
  -H "Content-Type: application/json" \\
  -d '{"email": "you@example.com", "password": "your_password"}'`}
                />
                <h3 className="text-sm font-semibold uppercase text-muted-foreground">
                  {_("start.rawApi.verify")}
                </h3>
                <CopyBlock
                  code={`curl -X POST https://huozi.app/api/v1/auth/verify \\
  -H "Content-Type: application/json" \\
  -d '{"email": "you@example.com", "code": "12345678"}'`}
                />
                <h3 className="text-sm font-semibold uppercase text-muted-foreground">
                  {_("start.rawApi.setup")}
                </h3>
                <CopyBlock
                  code={`curl -X POST https://huozi.app/api/v1/auth/setup \\
  -H "Authorization: Bearer <access_token>" \\
  -H "Content-Type: application/json" \\
  -d '{"workspace_slug": "your-name"}'`}
                />
                <h3 className="text-sm font-semibold uppercase text-muted-foreground">
                  {_("start.rawApi.publish")} (Markdown)
                </h3>
                <CopyBlock
                  code={`curl -X POST https://huozi.app/api/v1/pages \\
  -H "Authorization: Bearer hz_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"title": "Hello", "content": "# Hello World"}'`}
                />
                <h3 className="text-sm font-semibold uppercase text-muted-foreground">
                  {_("start.rawApi.publish")} (HTML)
                </h3>
                <CopyBlock
                  code={`curl -X POST https://huozi.app/api/v1/pages \\
  -H "Authorization: Bearer hz_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"title": "My Page", "content_type": "html", "content": "<style>body{font-family:sans-serif}</style><h1>Hello</h1>"}'`}
                />
              </div>
            </details>
          </section>

          {/* API Reference Links */}
          <section className="mt-16 mb-16">
            <h2 className="text-2xl font-semibold mb-6">{_("start.apiRef")}</h2>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                href="/docs"
                className="flex-1 rounded-lg border border-border p-6 hover:border-foreground/20 transition-colors"
              >
                <h3 className="font-semibold mb-1">API Reference</h3>
                <p className="text-sm text-muted-foreground">
                  {_("start.apiRefLink.desc")}
                </p>
              </Link>
              <Link
                href="/docs4agent"
                className="flex-1 rounded-lg border border-border p-6 hover:border-foreground/20 transition-colors"
              >
                <h3 className="font-semibold mb-1">API Doc for Agent</h3>
                <p className="text-sm text-muted-foreground">
                  {_("start.apiDocAgentLink.desc")}
                </p>
              </Link>
            </div>
          </section>
        </div>
      </main>

      <footer className="border-t border-border py-6">
        <div className="mx-auto max-w-5xl px-4 text-center text-sm text-muted-foreground">
          {_("start.footer")}
        </div>
      </footer>
    </div>
  );
}
