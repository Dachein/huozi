import Link from "next/link";
import type { Metadata } from "next";
import { CopyButton } from "@/components/copy-button";
import { getLocale } from "@/lib/i18n/server";
import { t } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title: t(locale, "start.meta.title"),
    description: t(locale, "start.meta.description"),
  };
}

/**
 * /start — the install guide.
 *
 * Designed to be readable by both humans and LLMs. A Claude Code / Cursor /
 * OpenClaw / custom agent can open this URL (WebFetch or similar), read the
 * prompt below literally, and execute the device-authorization flow
 * end-to-end. The user's only interaction is clicking one Authorize link.
 *
 * All human-facing copy is localized via `start.*` keys. The agentPrompt
 * itself is kept in English because LLMs read English natively; translating
 * it risks subtle semantic drift in the steps the Agent follows.
 */

const agentPrompt = `Install huozi Cloud. If Node ≥18 is available, prefer the one-liner:

  npx huozi-mcp

It runs the full OAuth device flow, auto-detects your client (Claude Code,
Cursor, OpenClaw), opens a browser for authorization, and writes the MCP
config. Tell the human the verification URL it prints; they click Authorize;
you're done.

If \`npx\` is not available, follow the four-step device flow below literally
— do not improvise or skip.

STEP 1 — Request a device code.
Run in Bash:

  curl -sS -X POST https://cloud.huozi.app/auth/device-code \\
    -H "content-type: application/json" \\
    -d '{"client_name":"<your agent name>","agent_kind":"claude-code"}'

Use your real name in client_name (e.g. "Claude Code", "Cursor", "OpenClaw").
Use agent_kind ∈ { "claude-code" | "cursor" | "openclaw" | "other" }.

The response is JSON:
  { device_code, user_code, verification_url_complete, interval, expires_in }

Keep device_code private. Tell the human:
  "Open <verification_url_complete> and click Authorize."

STEP 2 — Poll for the key.
Every <interval> seconds (default 5), up to <expires_in> seconds (default 900),
run in Bash:

  curl -sS -X POST https://cloud.huozi.app/auth/token \\
    -H "content-type: application/json" \\
    -d '{"device_code":"<the device_code from step 1>"}'

Interpret the response:
  - HTTP 202, { error: "authorization_pending" }        → sleep <interval>, retry
  - HTTP 400, { error: "expired_token" }                → stop, tell the human, offer to restart
  - HTTP 400, { error: "access_denied" }                → stop, tell the human
  - HTTP 200, { api_key, key_id, workspace }            → success, go to step 3

STEP 3 — Register the MCP server.
Substitute the api_key from step 2 (keep it to yourself; do not print it):

  claude mcp add --transport http huozi https://cloud.huozi.app/mcp \\
    -H "Authorization: Bearer <api_key>"

If you are Cursor: update ~/.cursor/mcp.json to add:
  { "mcpServers": { "huozi": { "url": "https://cloud.huozi.app/mcp",
      "headers": { "Authorization": "Bearer <api_key>" } } } }

If you are OpenClaw: update ~/.openclaw/openclaw.json to add under mcp.servers:
  { "huozi": { "url": "https://cloud.huozi.app/mcp",
      "transport": "streamable-http",
      "headers": { "Authorization": "Bearer <api_key>" } } }

If you are another client: do the equivalent.

STEP 4 — Verify end to end.
Call huozi_glob with { pattern: "**/*" } and report the number of files
visible. If > 0, tell the human: "✓ Connected to workspace <slug>.
You can now ask me to read, write, or edit files in your huozi workspace."

Security rules:
  - Never print api_key, device_code, or key_id to the human.
  - Do not persist them outside the MCP config your client owns.
  - The human revokes access at any time from the Connected Agents panel on huozi.app/workspace.`;

export default async function StartPage() {
  const locale = await getLocale();
  const tx = (key: string) => t(locale, key);

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="text-center mb-12">
        <h1 className="font-serif text-3xl sm:text-4xl font-bold tracking-[0.06em]">
          {tx("start.hero.title")}
        </h1>
        <p className="mt-3 text-muted-foreground">
          {tx("start.hero.subtitle")}
        </p>
      </div>

      {/* 0 · npx one-liner — fastest path for anyone with Node ≥18 */}
      <section className="mb-12">
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <h2 className="font-serif text-lg font-bold">
            {tx("start.fastest.title")}
          </h2>
          <span className="text-[11px] uppercase tracking-wider text-accent">
            {tx("start.fastest.badge")}
          </span>
        </div>
        <div className="relative rounded-xl border-2 border-accent/40 bg-muted/20">
          <pre className="p-5 pr-14 text-sm leading-relaxed font-mono">
            <code>npx huozi-mcp</code>
          </pre>
          <CopyButton text="npx huozi-mcp" />
        </div>
        <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
          {tx("start.fastest.desc1")} {tx("start.fastest.desc2Before")}{" "}
          <span className="font-mono text-foreground">
            &ldquo;{tx("start.fastest.tellAgent")}&rdquo;
          </span>{" "}
          {tx("start.fastest.desc2After")}
        </p>
      </section>

      {/* 1 · The prompt — for Agents that prefer to run the flow themselves */}
      <section className="mb-14">
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <h2 className="font-serif text-lg font-bold">
            {tx("start.prompt.title")}
          </h2>
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {tx("start.prompt.badge")}
          </span>
        </div>

        <div className="relative rounded-xl border-2 border-dashed border-border bg-muted/40">
          <pre className="p-5 pr-14 text-xs leading-relaxed whitespace-pre-wrap break-words font-mono overflow-x-auto max-h-[380px]">
            <code>{agentPrompt}</code>
          </pre>
          <div className="absolute top-3 right-3">
            <CopyButton text={agentPrompt} />
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
          {tx("start.prompt.desc")}{" "}
          <span className="text-muted-foreground/70">
            {tx("start.prompt.langNote")}
          </span>
        </p>
      </section>

      {/* 2 · What happens next */}
      <section className="mb-14">
        <h2 className="font-serif text-lg font-bold mb-4">
          {tx("start.authorize.title")}
        </h2>
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-xs font-mono text-muted-foreground mb-3">
          {tx("start.authorize.example")}
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {tx("start.authorize.desc")}
        </p>
      </section>

      {/* 3 · Done */}
      <section className="mb-14">
        <h2 className="font-serif text-lg font-bold mb-4">
          {tx("start.done.title")}
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {tx("start.done.descBefore")}{" "}
          <span className="font-mono text-foreground">
            {tx("start.done.connectedPhrase")}
          </span>
          {tx("start.done.descAfter")}
        </p>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
          {tx("start.done.manageBefore")}{" "}
          <Link
            href="/workspace"
            className="underline hover:text-foreground"
          >
            /workspace
          </Link>
          {tx("start.done.manageAfter")}
        </p>
      </section>

      {/* 4 · Manual escape hatch */}
      <section className="mb-14">
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground list-none inline-flex items-center gap-2">
            <span className="inline-block transition-transform group-open:rotate-90 text-[9px]">
              ▸
            </span>
            {tx("start.manual.summary")}
          </summary>
          <div className="mt-4 space-y-4 pl-5 border-l border-border/50">
            <p className="text-sm text-muted-foreground leading-relaxed">
              {tx("start.manual.desc")}
            </p>
            <CodeBlock
              code={`# 1. get codes
curl -sS -X POST https://cloud.huozi.app/auth/device-code \\
  -H "content-type: application/json" -d '{"client_name":"my-cli"}'

# (open verification_url_complete from the response, click Authorize)

# 2. poll every 5s until it returns a key
curl -sS -X POST https://cloud.huozi.app/auth/token \\
  -H "content-type: application/json" \\
  -d '{"device_code":"<from step 1>"}'

# 3. register with Claude Code
claude mcp add --transport http huozi https://cloud.huozi.app/mcp \\
  -H "Authorization: Bearer <api_key from step 2>"`}
            />
            <p className="text-xs text-muted-foreground">
              {tx("start.manual.noteBefore")}{" "}
              <Link
                href="/workspace/connect"
                className="underline hover:text-foreground"
              >
                /workspace/connect
              </Link>
              {tx("start.manual.noteAfter")}
            </p>
          </div>
        </details>
      </section>

      {/* Footer nav */}
      <section>
        <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-border/50">
          <Link
            href="/docs"
            className="flex-1 rounded-lg border border-border p-5 hover:border-foreground/30 transition-colors"
          >
            <h3 className="font-semibold mb-1 text-sm">
              {tx("start.footer.mcp.title")}
            </h3>
            <p className="text-xs text-muted-foreground">
              {tx("start.footer.mcp.desc")}
            </p>
          </Link>
          <Link
            href="/cloud"
            className="flex-1 rounded-lg border border-border p-5 hover:border-foreground/30 transition-colors"
          >
            <h3 className="font-semibold mb-1 text-sm">
              {tx("start.footer.cloud.title")}
            </h3>
            <p className="text-xs text-muted-foreground">
              {tx("start.footer.cloud.desc")}
            </p>
          </Link>
          <Link
            href="/edge"
            className="flex-1 rounded-lg border border-border p-5 hover:border-foreground/30 transition-colors"
          >
            <h3 className="font-semibold mb-1 text-sm">
              {tx("start.footer.edge.title")}
            </h3>
            <p className="text-xs text-muted-foreground">
              {tx("start.footer.edge.desc")}
            </p>
          </Link>
        </div>
      </section>
    </div>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="relative group">
      <pre className="rounded-lg border border-border bg-muted px-4 py-3 pr-12 text-xs leading-relaxed overflow-x-auto font-mono whitespace-pre">
        <code>{code}</code>
      </pre>
      <CopyButton text={code} />
    </div>
  );
}
