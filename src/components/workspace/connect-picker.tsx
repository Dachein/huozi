"use client";

import { useState } from "react";
import { AgentLogo } from "./agent-logo";
import { useT } from "@/lib/i18n/context";

/**
 * ConnectPicker — the connection card on /workspace.
 *
 * Seven tabs in this canonical order:
 *   1. Claude Code      — local terminal, OAuth-on-first-use (RFC 8252)
 *   2. OpenClaw         — chat-mode, RFC 8628 device flow Agent prompt
 *   3. Hermes Agent     — chat-mode, RFC 8628 device flow Agent prompt
 *   4. Codex            — local terminal, OAuth-on-first-use
 *   5. Cursor           — local config file (~/.cursor/mcp.json), OAuth on first use
 *   6. Claude Cowork    — GUI: Customize → Connectors → + Add custom connector
 *   7. Generic Agent    — host-agnostic device-flow Agent prompt (Hermes/OpenClaw pattern)
 *
 * Two parallel install pipelines:
 *
 *   A. Local terminal / IDE config (RFC 8252 / OAuth on first use)
 *      Used by: Claude Code, Codex, Cursor, Cowork (Cowork uses GUI to
 *      same effect). The user runs a CLI or pastes a config file; the
 *      MCP client opens a system browser and binds a localhost callback.
 *
 *   B. Chat-mode Agent prompt (RFC 8628 device authorization grant)
 *      Used by: OpenClaw, Hermes, Generic Agent. The user pastes a
 *      numbered prompt into the agent's chat. The agent calls
 *      /auth/device-code, hands the user verification_url_complete, polls
 *      /auth/token, writes the host's MCP config, verifies via
 *      huozi_whoami. Works in non-TTY / headless / sandboxed shells where
 *      pipeline A cannot.
 *
 * The api/MCP base URL is env-driven via the `mcpUrl` prop (Cloud =
 * cloud.huozi.app/mcp; Edge = whatever the deployer's worker URL is).
 * Templates use `{mcpUrl}` and `{apiBase}` placeholders so a string
 * pulled from i18n still resolves to the right deploy target.
 */

type AgentKey =
  | "claude-code"
  | "openclaw"
  | "hermes"
  | "codex"
  | "cursor"
  | "cowork"
  | "generic";

const AGENTS: AgentKey[] = [
  "claude-code",
  "openclaw",
  "hermes",
  "codex",
  "cursor",
  "cowork",
  "generic",
];

const AGENT_LABELS: Record<AgentKey, string> = {
  "claude-code": "Claude Code",
  openclaw: "OpenClaw",
  hermes: "Hermes Agent",
  codex: "Codex",
  cursor: "Cursor",
  cowork: "Claude Cowork",
  generic: "Generic Agent",
};

/** AgentLogo's kind taxonomy — map our short keys to its values. */
const AGENT_LOGO_KIND: Record<AgentKey, string> = {
  "claude-code": "claude-code",
  openclaw: "openclaw",
  hermes: "hermes",
  codex: "codex",
  cursor: "cursor",
  cowork: "cowork",
  generic: "generic",
};

interface Snippet {
  /** What goes into the user's clipboard. */
  body: string;
  /** Short note above the snippet (localized). */
  note: string;
}

function snippetFor(
  agent: AgentKey,
  mcpUrl: string,
  apiBase: string,
  t: (key: string) => string,
): Snippet {
  const note = t(`connect.picker.note.${agent}`);

  switch (agent) {
    case "claude-code":
      // Single shell line: register MCP server + immediately invoke a
      // huozi tool so the OAuth dance fires on the first call. Browser
      // pops, user clicks Approve, token returns, identity printed.
      return {
        note,
        body: `claude mcp add --transport http huozi ${mcpUrl} && claude "use huozi to check who I am"`,
      };
    case "codex":
      return {
        note,
        body: `codex mcp add huozi --url ${mcpUrl} && codex "use huozi to check who I am"`,
      };
    case "cursor":
      return {
        note,
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
    case "cowork":
      // Cowork (Anthropic's chat agent inside Claude Desktop) accepts
      // custom MCP connectors via Customize → Connectors → + Add custom
      // connector. The "snippet" is just the URL the user pastes into
      // that dialog; OAuth on first use is handled inside Cowork.
      return {
        note,
        body: mcpUrl,
      };
    case "hermes":
    case "openclaw":
    case "generic":
      // Device-flow Agent prompt. Pulled from i18n so each locale renders
      // its own translation; placeholders resolve to the live deploy URL.
      return {
        note,
        body: t(`connect.picker.body.${agent}`)
          .replaceAll("{apiBase}", apiBase)
          .replaceAll("{mcpUrl}", mcpUrl),
      };
  }
}

export function ConnectPicker({ mcpUrl }: { mcpUrl: string }) {
  const t = useT();
  const [agent, setAgent] = useState<AgentKey>("claude-code");
  const [copied, setCopied] = useState(false);

  // Derive the auth API base by stripping the /mcp suffix off mcpUrl.
  // Auth endpoints (/auth/device-code, /auth/token) live at the worker
  // root, not under /mcp. This keeps Edge deployments correct without
  // a separate prop.
  const apiBase = mcpUrl.replace(/\/mcp\/?$/, "");

  const snippet = snippetFor(agent, mcpUrl, apiBase, t);
  const isOneLiner = agent === "claude-code" || agent === "codex";
  const isJustUrl = agent === "cowork";

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
        {t("connect.picker.intro")}
      </p>

      {/* Agent picker tabs */}
      <div className="mb-4 flex flex-wrap gap-1 border-b border-border">
        {AGENTS.map((k) => {
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
            isOneLiner || isJustUrl
              ? "whitespace-pre-wrap break-all"
              : "whitespace-pre"
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
          {copied ? t("connect.picker.copied") : t("connect.picker.copy")}
        </button>
      </div>

      <p className="mt-3 text-[11px] text-muted-foreground leading-relaxed">
        {t("connect.picker.endpointLabel")}{" "}
        <code className="font-mono">{mcpUrl}</code>
        {" · "}
        {t("connect.picker.tokenSecurity")}
      </p>
    </div>
  );
}
