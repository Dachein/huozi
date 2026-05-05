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
  t: (key: string) => string,
): Snippet {
  const note = t(`connect.picker.note.${agent}`);

  switch (agent) {
    case "claude-code":
      // Register + immediately invoke a huozi tool so the OAuth flow
      // fires on the first call. Browser pops, user clicks Approve,
      // identity prints. Single line of paste.
      return {
        note,
        body: `claude mcp add --transport http huozi ${mcpUrl} && claude "use huozi to check who I am"`,
      };
    case "codex":
      return {
        note,
        body: `codex mcp add huozi --url ${mcpUrl} && codex "use huozi to check who I am"`,
      };
    case "hermes":
      // --auth oauth is mandatory: it tells Hermes to run PKCE + DCR
      // + /.well-known discovery instead of expecting a static Bearer
      // header. Without it the connect hangs at 401.
      return {
        note,
        body: `hermes mcp add huozi --url ${mcpUrl} --auth oauth`,
      };
    case "openclaw":
      // OpenClaw's `mcp set` takes the server JSON inline. No
      // Authorization header — relies on RFC 8252 OAuth-on-first-use
      // (upstream WIP). If the first call returns 401 with no browser
      // popping, users fall back to Choice 1 above.
      return {
        note,
        body: `openclaw mcp set huozi '{"url":"${mcpUrl}","transport":"streamable-http"}'`,
      };
    case "cursor":
      // Cursor lacks a one-line CLI; it gets a config-file paste. No
      // Authorization header — Cursor opens a browser on the first
      // huozi call (OAuth-on-first-use).
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
      // custom MCP connectors via Customize → Connectors → + Add
      // custom connector. The "snippet" is just the URL the user
      // pastes; Cowork drives OAuth itself.
      return {
        note,
        body: mcpUrl,
      };
    case "generic":
      // Generic = any MCP-capable host we don't have a specific
      // recipe for. The minimal universal handle is the URL itself;
      // the user pastes it into their host's config and the host's
      // own MCP layer handles auth (OAuth-on-first-use if it
      // supports the spec, otherwise Choice 1's device flow path).
      return {
        note,
        body: mcpUrl,
      };
  }
}

export function ConnectPicker({ mcpUrl }: { mcpUrl: string }) {
  const t = useT();
  const [agent, setAgent] = useState<AgentKey>("claude-code");
  const [copiedKind, setCopiedKind] = useState<"choice1" | "choice2" | null>(
    null,
  );

  // Derive the deploy's worker base by stripping /mcp off mcpUrl.
  // Cloud → https://cloud.huozi.app; Edge → https://<deployer>.workers.dev.
  // /llms.txt and the /auth/* endpoints all live under this base.
  const apiBase = mcpUrl.replace(/\/mcp\/?$/, "");

  // Choice 1's paste prompt: "Install huozi from <host>/llms.txt?for=<kind>."
  // The ?for=<kind> filter cuts /llms.txt down to just this client's
  // Step 4 snippet — small-context-window models stop choking on the
  // full 8-host menu, and the agent gets a doc that's already aimed
  // at the host it actually runs in.
  const choice1Body = `Install huozi from ${apiBase.replace(/^https?:\/\//, "")}/llms.txt?for=${agent}.`;
  const snippet = snippetFor(agent, mcpUrl, t);
  const isOneLiner =
    agent === "claude-code" ||
    agent === "codex" ||
    agent === "hermes" ||
    agent === "openclaw";
  const isJustUrl = agent === "cowork" || agent === "generic";

  async function copyText(text: string, kind: "choice1" | "choice2") {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKind(kind);
      setTimeout(() => setCopiedKind(null), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="rounded-md border border-border/60 bg-background/40 p-5 mb-3 space-y-6">
      {/* Step 1: pick the Agent. The single dropdown drives BOTH
          Choice 1 (its ?for=<agent> filter) and Choice 2 (the per-
          client snippet) below. Selected agent's logo stays visible
          to the left of the trigger. */}
      <div>
        <label
          htmlFor="connect-picker-agent"
          className="block text-[11px] uppercase tracking-[0.15em] text-muted-foreground mb-2"
        >
          {t("connect.picker.dropdown.label")}
        </label>
        <div className="relative inline-flex items-center">
          <span className="absolute left-3 pointer-events-none text-foreground">
            <AgentLogo kind={AGENT_LOGO_KIND[agent]} size={16} />
          </span>
          <select
            id="connect-picker-agent"
            value={agent}
            onChange={(e) => {
              setAgent(e.target.value as AgentKey);
              setCopiedKind(null);
            }}
            className="appearance-none rounded-md border border-border bg-background pl-9 pr-9 py-1.5 text-sm font-medium hover:border-foreground/40 focus:outline-none focus:border-foreground/60 transition-colors cursor-pointer"
          >
            {AGENTS.map((k) => (
              <option key={k} value={k}>
                {AGENT_LABELS[k]}
              </option>
            ))}
          </select>
          <svg
            viewBox="0 0 12 12"
            width="10"
            height="10"
            className="absolute right-3 pointer-events-none text-muted-foreground"
            aria-hidden="true"
          >
            <path
              d="M2 4 L6 8 L10 4"
              stroke="currentColor"
              strokeWidth="1.5"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>

      {/* Choice 1 · Agent-driven install (RFC 8628 device flow) —
          paste into a chat-mode agent. The agent fetches /llms.txt
          at this deploy's base (filtered to ?for=<agent>), follows
          the device-flow steps, hands the user a /device link.
          Works in non-TTY shells, headless / sandboxed agents,
          remote hosts. */}
      <section>
        <div className="flex items-baseline justify-between gap-3 mb-1.5">
          <h3 className="font-medium text-sm text-foreground">
            {t("connect.picker.choice1.title")}
          </h3>
          <span className="text-[10px] uppercase tracking-[0.15em] text-accent">
            {t("connect.picker.choice1.badge")}
          </span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed mb-2.5">
          {t("connect.picker.choice1.desc")}
        </p>
        <div className="relative rounded-lg border-2 border-accent/40 bg-muted/40">
          <pre className="overflow-x-auto px-4 py-3 pr-14 text-xs font-mono leading-relaxed whitespace-pre-wrap break-all">
            {choice1Body}
          </pre>
          <button
            type="button"
            onClick={() => copyText(choice1Body, "choice1")}
            className={`absolute top-2 right-2 inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium transition-all ${
              copiedKind === "choice1"
                ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                : "bg-foreground text-background hover:opacity-90 shadow-sm"
            }`}
          >
            {copiedKind === "choice1"
              ? t("connect.picker.copied")
              : t("connect.picker.copy")}
          </button>
        </div>
      </section>

      {/* Choice 2 · Native CLI / GUI install (RFC 8252 OAuth on
          first use) — driven by the same dropdown above. First MCP
          call opens a browser, user Approves, host stores OAuth
          token in its own credential store. */}
      <section>
        <div className="flex items-baseline justify-between gap-3 mb-1.5">
          <h3 className="font-medium text-sm text-foreground">
            {t("connect.picker.choice2.title")}
          </h3>
          <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            {t("connect.picker.choice2.badge")}
          </span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed mb-3">
          {t("connect.picker.choice2.desc")}
        </p>

        <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground mb-1.5">
          {snippet.note}
        </div>

        <div className="relative rounded-lg border-2 border-accent/40 bg-muted/40">
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
            onClick={() => copyText(snippet.body, "choice2")}
            className={`absolute top-2 right-2 inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium transition-all ${
              copiedKind === "choice2"
                ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                : "bg-foreground text-background hover:opacity-90 shadow-sm"
            }`}
          >
            {copiedKind === "choice2"
              ? t("connect.picker.copied")
              : t("connect.picker.copy")}
          </button>
        </div>

        <p className="mt-3 text-[11px] text-muted-foreground leading-relaxed">
          {t("connect.picker.endpointLabel")}{" "}
          <code className="font-mono">{mcpUrl}</code>
          {" · "}
          {t("connect.picker.tokenSecurity")}
        </p>
      </section>
    </div>
  );
}
