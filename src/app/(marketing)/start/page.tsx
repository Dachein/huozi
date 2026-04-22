import Link from "next/link";
import type { Metadata } from "next";
import { CopyButton } from "@/components/copy-button";

export const metadata: Metadata = {
  title: "Get started — huozi Cloud",
  description:
    "Copy one prompt. Give it to any Agent. Click one link. Done.",
};

/**
 * /start — the install guide.
 *
 * Designed to be readable by both humans and LLMs. A Claude Code / Cursor /
 * OpenClaw / custom agent can open this URL (WebFetch or similar), read the
 * prompt below literally, and execute the device-authorization flow
 * end-to-end. The user's only interaction is clicking one Authorize link.
 *
 * The prompt itself targets huozi-cloud's OAuth 2.0 device flow endpoints
 * (RFC 8628) at cloud.huozi.app:
 *   - POST /auth/device-code   → issues { device_code, user_code, url }
 *   - POST /auth/token         → polled by Agent; returns api_key on auth
 */

const agentPrompt = `Install huozi Cloud via its device-authorization flow. Follow these four steps literally — do not improvise or skip.

STEP 1 — Request a device code.
Run in Bash:

  curl -sS -X POST https://cloud.huozi.app/auth/device-code \\
    -H "content-type: application/json" \\
    -d '{"client_name":"<your agent name>","agent_kind":"claude-code"}'

Use your real name in client_name (e.g. "Claude Code", "Cursor", "OpenClaw").
Use agent_kind ∈ { "claude-code" | "cursor" | "desktop" | "other" }.

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

If you are another client: do the equivalent.

STEP 4 — Verify end to end.
Call huozi_glob with { pattern: "**/*" } and report the number of files
visible. If > 0, tell the human: "✓ Connected to workspace <slug>.
You can now ask me to read, write, or edit files in your huozi workspace."

Security rules:
  - Never print api_key, device_code, or key_id to the human.
  - Do not persist them outside the MCP config your client owns.
  - The human revokes access at any time via huozi.app/workspace/keys.`;

export default function StartPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="text-center mb-12">
        <h1 className="font-serif text-3xl sm:text-4xl font-bold tracking-[0.06em]">
          Get started
        </h1>
        <p className="mt-3 text-muted-foreground">
          One prompt, one click, done. Works with any MCP-capable Agent.
        </p>
      </div>

      {/* 1 · The prompt */}
      <section className="mb-14">
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <h2 className="font-serif text-lg font-bold">
            1 · Copy this prompt, paste into your Agent
          </h2>
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Agent-readable
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
          Works in Claude Code, Cursor, OpenClaw, or any Agent that can
          make HTTP calls. The Agent reads the steps and executes them;
          your only job is to click one Authorize link in the browser.
        </p>
      </section>

      {/* 2 · What happens next */}
      <section className="mb-14">
        <h2 className="font-serif text-lg font-bold mb-4">
          2 · The Agent prints a link — click Authorize
        </h2>
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-xs font-mono text-muted-foreground mb-3">
          → Open https://huozi.app/device?code=ABCD-1234 and click Authorize.
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Open the link in any browser. If you&rsquo;re not signed in to
          huozi.app, do a one-time email OTP first. Then you&rsquo;ll see
          which Agent is asking, which workspace it will access, and a
          single <strong>Authorize</strong> button. Click it. Close the tab.
        </p>
      </section>

      {/* 3 · Done */}
      <section className="mb-14">
        <h2 className="font-serif text-lg font-bold mb-4">
          3 · Agent auto-connects · you&rsquo;re done
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Within a few seconds, the Agent catches the key, registers the
          MCP server, and reports{" "}
          <span className="font-mono text-foreground">
            ✓ Connected to workspace …
          </span>
          . From now on every Agent request can read and write in your
          huozi workspace.
        </p>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
          Manage the connection at{" "}
          <Link
            href="/workspace/keys"
            className="underline hover:text-foreground"
          >
            /workspace/keys
          </Link>{" "}
          — revoke any time. Browse and publish files at{" "}
          <Link
            href="/workspace"
            className="underline hover:text-foreground"
          >
            /workspace
          </Link>
          .
        </p>
      </section>

      {/* 4 · Manual escape hatch */}
      <section className="mb-14">
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground list-none inline-flex items-center gap-2">
            <span className="inline-block transition-transform group-open:rotate-90 text-[9px]">
              ▸
            </span>
            No Agent? Do it by hand
          </summary>
          <div className="mt-4 space-y-4 pl-5 border-l border-border/50">
            <p className="text-sm text-muted-foreground leading-relaxed">
              The same flow is plain HTTP — you can run the curl commands
              yourself:
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
              Already signed in at huozi.app? You can also mint a
              ready-made config snippet for Cursor / Desktop directly at{" "}
              <Link
                href="/workspace/connect"
                className="underline hover:text-foreground"
              >
                /workspace/connect
              </Link>
              .
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
            <h3 className="font-semibold mb-1 text-sm">MCP reference</h3>
            <p className="text-xs text-muted-foreground">
              All <code className="font-mono">huozi_*</code> tools, JSON-RPC
              shape, real-time events.
            </p>
          </Link>
          <Link
            href="/cloud"
            className="flex-1 rounded-lg border border-border p-5 hover:border-foreground/30 transition-colors"
          >
            <h3 className="font-semibold mb-1 text-sm">About Cloud</h3>
            <p className="text-xs text-muted-foreground">
              Why Agents need a shared drive with commit history.
            </p>
          </Link>
          <Link
            href="/edge"
            className="flex-1 rounded-lg border border-border p-5 hover:border-foreground/30 transition-colors"
          >
            <h3 className="font-semibold mb-1 text-sm">Self-host (Edge)</h3>
            <p className="text-xs text-muted-foreground">
              Same drive, deployed on your own Cloudflare / Vercel. MIT.
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
