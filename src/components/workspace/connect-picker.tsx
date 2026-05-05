"use client";

import Link from "next/link";
import { useState } from "react";
import { AgentLogo } from "./agent-logo";

/**
 * ConnectPicker — the OAuth-first agent install card.
 *
 * Five tabs, each shows the snippet that this agent's MCP host needs.
 * No api_key minting in this UI: the snippets just point the host at
 * the MCP URL. First tool call returns 401, the host follows
 * /.well-known/oauth-protected-resource → /.well-known/oauth-authorization-server,
 * pops a browser consent, and the token round-trips back into the host's
 * own credential store. Token never enters the conversation context.
 *
 * Used by /workspace's connection-status panel (empty state + "+ connect new").
 * Lives standalone so it can also drop into onboarding / docs surfaces without
 * dragging the surrounding management UI along.
 *
 * For users who need the legacy static api_key flow (custom MCP clients that
 * don't speak OAuth), the bottom-line link routes to /workspace/connect where
 * the older mint-key picker still lives.
 */
type AgentKey =
  | "claude-code"
  | "cursor"
  | "codex"
  | "hermes"
  | "openclaw"
  | "desktop";

const AGENT_LABELS: Record<AgentKey, string> = {
  "claude-code": "Claude Code",
  cursor: "Cursor",
  codex: "Codex",
  hermes: "Hermes",
  openclaw: "OpenClaw",
  desktop: "Claude Desktop",
};

/** AgentLogo's kind taxonomy — map our short keys to its values. */
const AGENT_LOGO_KIND: Record<AgentKey, string> = {
  "claude-code": "claude-code",
  cursor: "cursor",
  codex: "other",
  hermes: "hermes",
  openclaw: "other",
  desktop: "desktop",
};

interface Snippet {
  /** Free-form heading shown above the code block. */
  heading: string;
  /** The thing that actually goes into the user's clipboard. */
  body: string;
  /** Short note above the heading explaining where this snippet runs. */
  note: string;
}

function snippetFor(agent: AgentKey, mcpUrl: string): Snippet {
  switch (agent) {
    case "claude-code":
      // Two-step chain: register the MCP server, then immediately
      // launch a Claude Code session with a prompt that asks for
      // a huozi tool. The first tool call triggers OAuth → browser
      // pops open with the consent page → token round-trip → Agent
      // returns a whoami response. End-to-end from a single paste.
      //
      // Why "check who I am" instead of "list files": works for
      // empty workspaces too — new users see a structured "who you
      // are + which workspace + role" summary rather than a sad
      // empty-list message.
      return {
        note: "终端粘贴一次：注册 + 触发授权 + 确认身份",
        heading: "TERMINAL",
        body: `claude mcp add --transport http huozi ${mcpUrl} && claude "use huozi to check who I am"`,
      };
    case "codex":
      return {
        note: "终端粘贴一次：注册 + 触发授权 + 确认身份",
        heading: "TERMINAL",
        body: `codex mcp add huozi --url ${mcpUrl} && codex "use huozi to check who I am"`,
      };
    case "cursor":
      return {
        note: "添加到 ~/.cursor/mcp.json，重启 Cursor，然后让 Agent 用一下 huozi 触发授权",
        heading: "MCP.JSON",
        body: JSON.stringify(
          {
            mcpServers: {
              huozi: { type: "http", url: mcpUrl },
            },
          },
          null,
          2,
        ),
      };
    case "desktop":
      return {
        note: "添加到 claude_desktop_config.json，重启 Claude Desktop，然后让 Agent 用一下 huozi 触发授权",
        heading: "CLAUDE_DESKTOP_CONFIG.JSON",
        body: JSON.stringify(
          {
            mcpServers: {
              huozi: { type: "http", url: mcpUrl },
            },
          },
          null,
          2,
        ),
      };
    case "hermes":
      // Chat-mode install for Hermes uses the device authorization flow
      // (RFC 8628). Why not OAuth-on-first-use (RFC 8252) here: in chat
      // mode the agent's shell tool is non-TTY, often headless, and
      // can't receive a localhost callback — `hermes mcp add --auth oauth`
      // exits immediately. Why not email OTP: device flow gives the user
      // a single clickable URL where the user_code is pre-filled, the
      // /device page handles login (Cloud OTP / Edge password) AND grant
      // approval in one screen, no email round-trip. Local-terminal users
      // who want OAuth still have `hermes mcp add ... --auth oauth` —
      // that path is surfaced in /docs, not here.
      return {
        note: "粘进 Hermes chat：Agent 走 RFC 8628 device flow → 你点链接 Approve → 写 config → /reload-mcp",
        heading: "AGENT PROMPT",
        body: `TASK: Install the huozi MCP server in Hermes. This is a setup task — not a coding project. Do not ask about tech stack, do not write code.

We use the OAuth 2.0 device authorization flow (RFC 8628). Authorization happens in the user's browser on any device — no localhost callback, no TTY required. The /device page handles login (OTP for Cloud, password for Edge) and grant approval together.

1. REQUEST DEVICE CODE:
   curl -sS -X POST https://cloud.huozi.app/auth/device-code \\
     -H 'content-type: application/json' \\
     -d '{"client_name":"Hermes","agent_kind":"hermes"}'
   Response: { device_code, user_code, verification_url_complete, expires_in: 900, interval: 5 }
   Capture device_code into your scratch.

2. SHOW LINK — print verification_url_complete to me as a clickable link. Tell me to open it: the page may ask me to sign in (one-tap if I'm already logged in to cloud.huozi.app), then it shows an Approve button. Wait until I tell you I clicked Approve, OR start polling now (step 3) — whichever fits your tool model.

3. POLL FOR TOKEN — every 5 seconds (the "interval" from step 1):
   curl -sS -X POST https://cloud.huozi.app/auth/token \\
     -H 'content-type: application/json' \\
     -d '{"device_code":"<device_code from step 1>"}'
   Responses:
     - 202 { error: "authorization_pending" } → keep polling
     - 200 { api_key, key_id, workspace } → done, capture api_key into scratch
     - 400 { error: "expired_token" } → grant timed out, restart from step 1
     - 400 { error: "access_denied" } → user clicked Deny, stop and tell me

4. WRITE CONFIG — append to ~/.hermes/config.yaml (create the file if it does not exist; preserve existing entries):
   mcp_servers:
     huozi:
       url: "${mcpUrl}"
       headers:
         Authorization: "Bearer <api_key>"

   Do NOT use "hermes mcp add" — the CLI requires a TTY and exits in chat shells.

5. RELOAD — tell me to type "/reload-mcp" in this chat. Hermes hot-reloads MCP config on that command without restart.

6. VERIFY — call huozi_whoami through the MCP. A workspace identity in the reply means done.

Security: never print device_code or api_key in chat. Keep them in your tool scratch only. The user can revoke any key at cloud.huozi.app/workspace.`,
      };
    case "openclaw":
      // Same RFC 8628 device flow as Hermes — only the install step
      // differs (OpenClaw uses its own \`mcp set\` CLI, no reload needed
      // because OpenClaw applies config changes immediately).
      return {
        note: "粘进 OpenClaw chat：Agent 走 RFC 8628 device flow → 你点链接 Approve → openclaw mcp set",
        heading: "AGENT PROMPT",
        body: `TASK: Install the huozi MCP server in OpenClaw. This is a setup task — not a coding project. Do not ask about tech stack, do not write code.

We use the OAuth 2.0 device authorization flow (RFC 8628). Authorization happens in the user's browser on any device — no localhost callback, no TTY required. The /device page handles login (OTP for Cloud, password for Edge) and grant approval together.

1. REQUEST DEVICE CODE:
   curl -sS -X POST https://cloud.huozi.app/auth/device-code \\
     -H 'content-type: application/json' \\
     -d '{"client_name":"OpenClaw","agent_kind":"openclaw"}'
   Response: { device_code, user_code, verification_url_complete, expires_in: 900, interval: 5 }
   Capture device_code into your scratch.

2. SHOW LINK — print verification_url_complete to me as a clickable link. Tell me to open it: the page may ask me to sign in, then it shows an Approve button. Wait until I tell you I clicked Approve, OR start polling now (step 3).

3. POLL FOR TOKEN — every 5 seconds:
   curl -sS -X POST https://cloud.huozi.app/auth/token \\
     -H 'content-type: application/json' \\
     -d '{"device_code":"<device_code>"}'
   Responses:
     - 202 { error: "authorization_pending" } → keep polling
     - 200 { api_key, key_id, workspace } → done, capture api_key
     - 400 { error: "expired_token" } → restart from step 1
     - 400 { error: "access_denied" } → user clicked Deny, stop

4. INSTALL MCP — register the server in OpenClaw with the api_key:
   openclaw mcp set huozi '{"url":"${mcpUrl}","transport":"streamable-http","headers":{"Authorization":"Bearer <api_key>"}}'

5. VERIFY — call huozi_whoami through the MCP. A workspace identity in the reply means done.

Security: never print device_code or api_key in chat. Keep them in your tool scratch only. The user can revoke any key at cloud.huozi.app/workspace.`,
      };
  }
}

export function ConnectPicker({ mcpUrl }: { mcpUrl: string }) {
  const [agent, setAgent] = useState<AgentKey>("claude-code");
  const [copied, setCopied] = useState(false);
  const snippet = snippetFor(agent, mcpUrl);
  const isOneLiner = agent === "claude-code" || agent === "codex";

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet.body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="rounded-md border border-border/60 bg-background/40 p-5 mb-3">
      <p className="text-sm text-foreground mb-4">
        两条平行路径。**本地终端**用 Claude Code / Codex / Hermes CLI：一行命令自动 OAuth (RFC 8252)。
        **Agent chat 模式** Hermes / OpenClaw：粘 prompt 走 device flow (RFC 8628) ——
        Agent 拿 user_code、给你一个链接，你点开授权,Agent 轮询拿 key、写 config。
        Cursor / Claude Desktop 走配置文件 + use huozi 触发 OAuth。
      </p>

      {/* Agent picker tabs */}
      <div className="mb-4 flex flex-wrap gap-1 border-b border-border">
        {(Object.keys(AGENT_LABELS) as AgentKey[]).map((k) => {
          const active = k === agent;
          return (
            <button
              key={k}
              type="button"
              onClick={() => {
                setAgent(k);
                setCopied(false);
              }}
              className={`-mb-px inline-flex items-center gap-2 px-3 py-2 border-b-2 text-xs font-medium transition-colors ${
                active
                  ? "border-accent text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`}
            >
              <AgentLogo kind={AGENT_LOGO_KIND[k]} size={14} />
              <span>{AGENT_LABELS[k]}</span>
            </button>
          );
        })}
      </div>

      <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground mb-1.5">
        {snippet.note}
      </div>

      <div className="relative rounded-lg border-2 border-accent/40 bg-muted/40 group">
        <pre
          className={`overflow-x-auto px-4 py-3 pr-14 text-xs font-mono leading-relaxed ${
            isOneLiner ? "whitespace-pre-wrap break-all" : "whitespace-pre"
          }`}
        >
          {snippet.body}
        </pre>
        <button
          type="button"
          onClick={copy}
          className={`absolute top-2 right-2 inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium transition-all ${
            copied
              ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400"
              : "bg-foreground text-background hover:opacity-90 shadow-sm"
          }`}
        >
          {copied ? "✓ 已复制" : "复制"}
        </button>
      </div>

      <p className="mt-3 text-[11px] text-muted-foreground leading-relaxed">
        Endpoint:{" "}
        <code className="font-mono">{mcpUrl}</code>
        {" · "}
        授权令牌由 MCP 客户端持有，不会进入对话上下文。
        {" · "}
        需要旧版静态 API key？{" "}
        <Link
          href="/workspace/connect"
          className="underline hover:text-foreground"
        >
          手动模式
        </Link>
      </p>
    </div>
  );
}
