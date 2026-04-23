"use client";

/**
 * InstallPicker — the tabbed install switcher on /start.
 *
 *   1. Top-level tabs pick a CLIENT  (claude-code / cursor / openclaw / generic).
 *   2. If that client has multiple install MODES, a pill group picks one:
 *        - Claude Code  → [ MCP | Skill ]
 *        - Cursor       → [ MCP | Rules ]
 *        - OpenClaw     → [ MCP | Skill ]
 *        - Generic      → no mode pill; the body is the long Agent-readable
 *          prompt and that's the only path.
 *   3. The content area shows one install block with a copy-able command
 *      plus a short i18n'd body/note. Everything comes from the dictionary
 *      under `start.picker.*` so it all flows in zh/en/ja/fr.
 *
 * Commands are defined here in code (they're structured, escape-sensitive
 * strings) while the *explanation* around them is i18n'd.
 */

import { useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { AgentLogo } from "@/components/workspace/agent-logo";
import { useT } from "@/lib/i18n/context";

type Client = "claude-code" | "cursor" | "openclaw" | "generic";
type Mode = "mcp" | "skill" | "rules";

const CLIENTS: Client[] = ["claude-code", "cursor", "openclaw", "generic"];

const CLIENT_MODES: Record<Client, Mode[]> = {
  "claude-code": ["mcp", "skill"],
  cursor: ["mcp", "rules"],
  openclaw: ["mcp", "skill"],
  generic: ["mcp"],
};

const CLIENT_NAMES: Record<Exclude<Client, "generic">, string> = {
  "claude-code": "Claude Code",
  cursor: "Cursor",
  openclaw: "OpenClaw",
};

// Mode labels are product names — we don't translate "MCP", "Skill", "Rules".
const MODE_LABELS: Record<Mode, string> = {
  mcp: "MCP",
  skill: "Skill",
  rules: "Rules",
};

function commandFor(client: Client, mode: Mode): string {
  // MCP install — the one-liner wraps the whole thing.
  if (mode === "mcp" && client !== "generic") {
    return `npx huozi-mcp --client ${client}`;
  }
  // Claude Code skill — drop a SKILL.md into the user's skills directory.
  if (client === "claude-code" && mode === "skill") {
    return `mkdir -p ~/.claude/skills/huozi && \\
  curl -sS https://huozi.app/skill.md \\
    -o ~/.claude/skills/huozi/SKILL.md`;
  }
  // Cursor rules — same source file, different path + extension.
  if (client === "cursor" && mode === "rules") {
    return `mkdir -p .cursor/rules && \\
  curl -sS https://huozi.app/skill.md \\
    -o .cursor/rules/huozi.mdc`;
  }
  // OpenClaw skill — drop in the workspace skills directory until the
  // ClawHub package ships.
  if (client === "openclaw" && mode === "skill") {
    return `mkdir -p ~/.openclaw/skills/huozi && \\
  curl -sS https://huozi.app/skill.md \\
    -o ~/.openclaw/skills/huozi/SKILL.md`;
  }
  return "";
}

export function InstallPicker({ agentPrompt }: { agentPrompt: string }) {
  const t = useT();
  const [client, setClient] = useState<Client>("claude-code");
  const [mode, setMode] = useState<Mode>("mcp");

  const modes = CLIENT_MODES[client];

  function pickClient(c: Client) {
    setClient(c);
    const next = CLIENT_MODES[c];
    if (!next.includes(mode)) setMode(next[0]);
  }

  return (
    <div>
      {/* Client tabs */}
      <div className="mb-5 flex flex-wrap gap-1 border-b border-border">
        {CLIENTS.map((c) => {
          const isActive = c === client;
          const label =
            c === "generic" ? t("start.picker.generic.name") : CLIENT_NAMES[c];
          return (
            <button
              key={c}
              type="button"
              onClick={() => pickClient(c)}
              className={`-mb-px inline-flex items-center gap-2 px-4 py-2.5 border-b-2 text-sm font-medium transition-colors ${
                isActive
                  ? "border-accent text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`}
            >
              {c !== "generic" && <AgentLogo kind={c} size={16} />}
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      {/* Mode pills — hidden when the client only has one mode */}
      {modes.length > 1 && (
        <div className="mb-5 inline-flex rounded-full border border-border bg-muted/30 p-1">
          {modes.map((m) => {
            const isActive = m === mode;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`px-4 py-1 text-xs font-medium uppercase tracking-[0.15em] rounded-full transition-colors ${
                  isActive
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {MODE_LABELS[m]}
              </button>
            );
          })}
        </div>
      )}

      {/* Content */}
      {client === "generic" ? (
        <GenericCell t={t} agentPrompt={agentPrompt} />
      ) : (
        <InstallCell client={client} mode={mode} t={t} />
      )}
    </div>
  );
}

function InstallCell({
  client,
  mode,
  t,
}: {
  client: Client;
  mode: Mode;
  t: (key: string) => string;
}) {
  const cmd = commandFor(client, mode);
  const bodyKey = `start.picker.content.${client}.${mode}.body`;
  const noteKey = `start.picker.content.${client}.${mode}.note`;
  const body = t(bodyKey);
  const note = t(noteKey);
  // `t()` returns the key itself when missing — treat that as "no note".
  const hasNote = note !== noteKey;

  return (
    <div>
      {body !== bodyKey && (
        <p className="text-sm text-foreground/85 leading-relaxed mb-4">
          {body}
        </p>
      )}
      {cmd && (
        <div className="relative rounded-xl border-2 border-accent/40 bg-muted/20 mb-3">
          <pre className="p-4 pr-14 text-sm leading-relaxed font-mono whitespace-pre overflow-x-auto">
            <code>{cmd}</code>
          </pre>
          <CopyButton text={cmd} />
        </div>
      )}
      {hasNote && (
        <p className="text-xs text-muted-foreground leading-relaxed mt-3">
          {note}
        </p>
      )}
    </div>
  );
}

function GenericCell({
  t,
  agentPrompt,
}: {
  t: (key: string) => string;
  agentPrompt: string;
}) {
  return (
    <div>
      <p className="text-sm text-foreground/85 leading-relaxed mb-4">
        {t("start.picker.content.generic.mcp.body")}
      </p>
      <div className="relative rounded-xl border-2 border-dashed border-border bg-muted/40">
        <pre className="p-5 pr-14 text-xs leading-relaxed whitespace-pre-wrap break-words font-mono overflow-x-auto max-h-[380px]">
          <code>{agentPrompt}</code>
        </pre>
        <div className="absolute top-3 right-3">
          <CopyButton text={agentPrompt} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed mt-3">
        {t("start.picker.content.generic.mcp.note")}
      </p>
    </div>
  );
}
