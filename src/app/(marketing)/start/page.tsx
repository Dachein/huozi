import Link from "next/link";
import type { Metadata } from "next";
import { CopyButton } from "@/components/copy-button";
import { InstallPicker } from "@/components/start/install-picker";
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

const agentPrompt = `Install huozi Cloud.

huozi exposes a self-describing HTTP state machine for Agent-driven install.
Follow the \`next\` field of every response literally — the server tells
you what to ask the human and where to POST next. You never hard-code
flow logic.

STEP 1 — Start a session.

  curl -sS -X POST https://huozi.app/api/agent/start \\
    -H "content-type: application/json" -d '{}'

Response:
  { "ok": true,
    "session_id": "sess_…",
    "next": { "action": "ask_user", "prompt": "...", "input": {"key":"choice"}, "then": {...} } }

STEP 2 — Drive the loop. Repeat until you see a terminal action.

For every response:

  if next.action === "ask_user":
      Ask the human next.prompt (show next.hint if present). Take their
      reply, trimmed. Then:
        POST next.then.url  (it's always https://huozi.app/api/agent/step)
        body = { ...next.then.body, [next.input.key]: <their reply> }

  if next.action === "run_device_flow":
      Execute the steps[] to request a device_code, tell the human to open
      verification_url_complete and click Authorize, then poll
      https://cloud.huozi.app/auth/token every <interval>s until you
      receive an api_key. Then:
        POST next.then.url
        body = { ...next.then.body, [next.then.input.key]: <api_key> }

  if next.action === "install_mcp":
      Terminal success. You now have:
        - next.api_key           (Bearer token, never print to the human)
        - next.workspace_slug    (may be empty for choice 2 / 3)
        - next.commands.*        (per-client install snippet)
      Write the snippet that matches your host into its MCP config:
        claude-code  → run \`commands["claude-code"]\` as a shell command
        cursor       → merge \`commands.cursor\` JSON into ~/.cursor/mcp.json
        openclaw     → merge \`commands.openclaw\` JSON into
                       ~/.openclaw/openclaw.json under mcp.servers
        generic      → print \`commands.generic\` for the human
      Then verify by calling huozi_glob { pattern: "**/*" } once the MCP
      server is registered — if > 0 files, tell the human:
        "✓ Connected to workspace <slug>. You can now ask me to read,
         write, or edit files in your huozi workspace."

  if next.action === "error":
      Stop. Tell the human next.message. Codes worth handling specifically:
        session_expired  → start over via POST /api/agent/start
        otp_verify_failed → ask for the code again (they may have mistyped)
        token_invalid     → ask them to paste the key again

PATH CHOICE (what to say at the first ask_user):

The first prompt presents three options. Describe them verbatim to the
human and submit their reply as { "choice": "1" | "2" | "3" }:

  1. Sign up for a new account (email OTP, auto-provisions a workspace)
  2. Log in via the browser device flow (existing account)
  3. Paste an API key I already have (starts with hz_)

Security rules:
  - Never print api_key, device_code, or session_id to the human.
  - Do not persist them outside the MCP config your client owns.
  - The human can revoke access any time from the Connected Agents panel
    on huozi.app/workspace.

Prefer \`npx huozi-mcp\` if the human is at a terminal themselves — the
CLI runs the same flow interactively.`;

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

      {/* 0 · Conversational install — the primary path for normal users.
              They paste a short human-readable message into their Agent;
              the Agent WebFetches this very page, reads the agentPrompt
              section below, and drives the /api/agent/* state machine. */}
      <section className="mb-10">
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <h2 className="font-serif text-lg font-bold">
            {tx("start.conversation.title")}
          </h2>
          <span className="text-[11px] uppercase tracking-wider text-accent">
            {tx("start.conversation.badge")}
          </span>
        </div>
        <p className="mb-3 text-sm text-muted-foreground leading-relaxed">
          {tx("start.conversation.desc")}
        </p>
        <div className="relative rounded-xl border-2 border-accent/40 bg-muted/20">
          <pre className="p-5 pr-14 text-base leading-relaxed font-mono whitespace-pre-wrap">
            <code>Install huozi from huozi.app/start.</code>
          </pre>
          <CopyButton text="Install huozi from huozi.app/start." />
        </div>
      </section>

      {/* 0b · Secondary — terminal one-liner for the dev path. Purposely
              less visually heavy than the conversational block above. */}
      <section className="mb-12">
        <div className="flex items-baseline justify-between gap-3 mb-2">
          <h2 className="font-serif text-sm font-medium text-muted-foreground">
            {tx("start.terminal.title")}
          </h2>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {tx("start.terminal.badge")}
          </span>
        </div>
        <div className="relative rounded-lg border border-border bg-muted/30">
          <pre className="p-3 pr-12 text-sm leading-relaxed font-mono">
            <code>npx huozi-mcp</code>
          </pre>
          <CopyButton text="npx huozi-mcp" />
        </div>
        <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
          {tx("start.terminal.desc")}
        </p>
      </section>

      {/* 1 · Per-client install picker — MCP × Skill tabs per actual support */}
      <section className="mb-14">
        <div className="mb-4">
          <h2 className="font-serif text-lg font-bold">
            {tx("start.picker.title")}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            {tx("start.picker.subtitle")}
          </p>
        </div>
        <InstallPicker agentPrompt={agentPrompt} />
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
