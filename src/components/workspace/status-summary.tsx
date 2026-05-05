"use client";

import { useState } from "react";
import { AgentLogo, agentKindName } from "./agent-logo";
import { ConnectPicker } from "./connect-picker";
import { KeyTtlSelect } from "./key-ttl-select";
import { RevokeKeyButton } from "./revoke-key-button";
import { useT } from "@/lib/i18n/context";

function AuthKindChip({ kind }: { kind: "oauth" | "key" }) {
  // Subtle tone differentiation — OAuth gets the accent (it's the
  // recommended modern path), API key reads as muted/legacy. Both stay
  // mono-weight so the chip never out-shouts the agent name beside it.
  const cls =
    kind === "oauth"
      ? "border-accent/40 text-accent bg-accent/5"
      : "border-border text-muted-foreground bg-muted/40";
  const label = kind === "oauth" ? "OAuth" : "API key";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0
                  text-[10px] font-medium uppercase tracking-[0.08em]
                  leading-[1.6] whitespace-nowrap ${cls}`}
    >
      {label}
    </span>
  );
}

export interface StatusSummaryConnection {
  /** Supabase row id — stable React key. */
  id: string;
  /** Worker D1 api_keys.key_id — the handle for TTL / revoke endpoints. */
  keyId: string;
  label: string;
  agentKind: string;
  isCurrentSession: boolean;
  /** ms timestamp, or null if never used. */
  lastUsedAt: number | null;
  /** Last tool this key called via tools/call ("huozi_write" etc.). Null
   *  when the key has only done lightweight traffic (tools/list, pings). */
  lastActionTool: string | null;
  /** File path / pattern the last action operated on. */
  lastActionTarget: string | null;
  /** ms timestamp. */
  createdAt: number;
  revoked: boolean;
  /** Inactivity TTL in seconds. Null means "never expires". */
  ttlSeconds: number | null;
  /** Effective deadline (ms). Null when ttlSeconds is null. */
  expiresAt: number | null;
  /** "oauth"  → OAuth-issued access key (prefix `oak_*`); fixed lifetime
   *           set at token-exchange time, user can't edit TTL.
   *  "key"    → statically-minted api_key (prefix `hz_*`); user-managed
   *           TTL, sliding-window inactivity expiry. */
  authKind: "oauth" | "key";
}

interface StatusSummaryProps {
  connections: StatusSummaryConnection[];
  /** Public URL to point the agent's MCP client at — surfaced in the
   *  empty-state copy block so first-time users can plug in directly
   *  without a separate /connect page. Cloud: cloud.huozi.app/mcp;
   *  Edge: <deployer>/mcp. */
  mcpUrl: string;
  labels: {
    title: string;
    connectedAgents: string;
    browserSession: string;
    never: string;
    now: string;
    activeKeys: string;
    manage: string;
    connectNew: string;
  };
}

/**
 * Always-visible connection-status panel at the top of /workspace.
 *
 * Each connected Agent row is clickable — expanding inline to reveal
 * the TTL selector, key_id + Copy, and Revoke. Both the closed row and
 * the opened detail area share one rounded container so the expansion
 * reads as "part of this item", not a detached panel floating below.
 *
 * This is the ONLY place to manage keys — the standalone
 * `/workspace/keys` page has been removed. Inline management here is
 * enough because the bulk case (many rows) also fits this layout.
 */
export function StatusSummary({
  connections,
  mcpUrl,
  labels,
}: StatusSummaryProps) {
  const t = useT();
  const [openId, setOpenId] = useState<string | null>(null);
  const [showConnect, setShowConnect] = useState(false);

  const active = connections.filter((c) => !c.revoked);
  const lastActivity = active.reduce<number | null>((acc, c) => {
    if (c.lastUsedAt === null) return acc;
    if (acc === null || c.lastUsedAt > acc) return c.lastUsedAt;
    return acc;
  }, null);

  const isEmpty = active.length === 0;
  const showPicker = isEmpty || showConnect;

  return (
    <section className="huozi-card rounded-xl border border-border/60 bg-muted/30 p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
          {labels.connectedAgents} · {active.length}
        </div>
        {!isEmpty && (
          <button
            type="button"
            onClick={() => setShowConnect((v) => !v)}
            aria-expanded={showConnect}
            className="huozi-button-primary shrink-0 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 transition-opacity"
          >
            {showConnect ? `× ${t("ws.status.collapse")}` : `+ ${labels.connectNew}`}
          </button>
        )}
      </div>

      {showPicker && <ConnectPicker mcpUrl={mcpUrl} />}
      <ul className="space-y-1.5">
        {active.map((c) => (
          <ConnectionRow
            key={c.id}
            conn={c}
            open={openId === c.id}
            onToggle={() => setOpenId(openId === c.id ? null : c.id)}
            nowLabel={labels.now}
            neverLabel={labels.never}
          />
        ))}
      </ul>

      <div className="mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground">
        {active.length}{" "}
        {active.length === 1
          ? labels.activeKeys.slice(0, -1)
          : labels.activeKeys}
        {lastActivity !== null && active.length > 1 && (
          // With a single connection the row above already shows this
          // exact timestamp — repeating it in the footer reads as noise.
          <>
            {" · "}
            <span className="font-mono">
              {t("ws.status.lastActivity")}{" "}
              {formatRelative(lastActivity, labels.now)}
            </span>
          </>
        )}
      </div>
    </section>
  );
}

function ConnectionRow({
  conn,
  open,
  onToggle,
  nowLabel,
  neverLabel,
}: {
  conn: StatusSummaryConnection;
  open: boolean;
  onToggle: () => void;
  nowLabel: string;
  neverLabel: string;
}) {
  const t = useT();
  const kindLabel = agentKindName(conn.agentKind);
  // The kind name is already shown as the title above, so don't repeat it
  // in the subtitle. Strip a leading "<kindLabel>" prefix and unwrap a
  // surrounding "(...)" so "Claude Code (huozi)" becomes just "huozi".
  const subtitle = (() => {
    if (!conn.label) return "";
    if (/^Device\b/i.test(conn.label)) return "";
    if (conn.label === kindLabel) return "";
    let rest = conn.label;
    if (rest.startsWith(kindLabel)) {
      rest = rest.slice(kindLabel.length).trim();
      const wrapped = rest.match(/^\((.*)\)$/);
      if (wrapped) rest = wrapped[1].trim();
    }
    return rest;
  })();

  return (
    <li
      // NOTE: no `overflow-hidden` — the nested TTL dropdown popup needs
      // to escape the rounded corners. Visual continuity between the row
      // button and the expansion panel still holds because both share
      // the same background on the <li>.
      className={`rounded-md transition-colors
                 ${
                   open
                     ? "bg-background ring-1 ring-border shadow-sm"
                     : "hover:bg-background/50"
                 }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center gap-3 text-sm text-left px-2.5 py-2"
      >
        <span
          className={`shrink-0 ${
            conn.lastUsedAt !== null ? "text-accent" : "text-muted-foreground"
          }`}
        >
          <AgentLogo kind={conn.agentKind} size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 truncate">
            <span className="truncate font-medium text-foreground">
              {kindLabel}
            </span>
            <AuthKindChip kind={conn.authKind} />
          </span>
          {subtitle && (
            <span className="block text-xs text-muted-foreground truncate">
              {subtitle}
            </span>
          )}
        </span>
        {/* Presence dot moved to end-of-row (sits next to the relative
            timestamp instead of overlapping the agent logo). Cleaner
            reading order: "who · when · how alive". When the row is
            expanded the timestamp also appears in LastActionLine below,
            so we drop it here to avoid showing the same "3m" twice. */}
        <PresenceDot bucket={presenceBucket(conn.lastUsedAt)} />
        {!open && (
          <span className="text-xs text-muted-foreground whitespace-nowrap tabular-nums">
            {conn.lastUsedAt === null
              ? neverLabel
              : formatRelative(conn.lastUsedAt, nowLabel)}
          </span>
        )}
        <svg
          viewBox="0 0 12 12"
          width="10"
          height="10"
          className={`shrink-0 text-muted-foreground transition-transform
                     ${open ? "rotate-180" : ""}`}
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
      </button>

      {open && (
        <div
          className="px-2.5 pb-2.5 pt-0
                     animate-in fade-in slide-in-from-top-1 duration-150"
        >
          <div className="ml-7 space-y-2.5">
            <LastActionLine conn={conn} nowLabel={nowLabel} />
            {/* Expiry / TTL row.
                  authKind === "key"   → user-editable TTL + countdown
                  authKind === "oauth" → fixed lifetime set at token-exchange
                                         time; show countdown read-only.
                Neither row exposes the raw key value — leaking it through
                the UI is a footgun (screen-share, screenshots, browser
                history). Copy is gone for the same reason. */}
            <div className="flex items-center gap-2 flex-wrap">
              {conn.authKind === "key" ? (
                <>
                  <KeyTtlSelect
                    keyId={conn.keyId}
                    currentTtlSeconds={conn.ttlSeconds}
                  />
                  {conn.ttlSeconds !== null && (
                    <span
                      className="text-xs text-muted-foreground"
                      title={t("ws.expiry.hint")}
                    >
                      {formatExpiry(conn.expiresAt, t)}
                    </span>
                  )}
                </>
              ) : (
                // OAuth: deliberately NO countdown. The access token
                // expires in ~1h, but the agent host transparently mints
                // a new one via refresh_token before then — exposing that
                // 1h figure would make users think "this connection is
                // about to die" when in practice it's rotating silently.
                // The refresh-token's own 30-day inactivity window is
                // the real ceiling, but user can't influence it from
                // here either (using the agent resets the clock; not
                // using it for 30 days is itself the revocation). So
                // we just say "the host owns the lifecycle, you don't
                // need to babysit it" and move the actionable bits
                // (Check / Revoke) below.
                <span
                  className="text-xs text-muted-foreground italic"
                  title="The MCP host (agent) automatically rotates this token via refresh_token. You never need to renew it; revoking ends the OAuth grant entirely."
                >
                  Auto-managed by host
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <CheckStatusButton keyId={conn.keyId} />
              <RevokeKeyButton keyId={conn.keyId} label={conn.label} />
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * "Last action" row shown inside the expanded connection detail.
 * Three states the Agent can be in:
 *   - Never called any tool           → "No actions yet"
 *   - Called only tools/list pings    → "Pinged · <relative time>" (no action fields)
 *   - Called a real tool              → "huozi_write · blog/post.md · <relative time>"
 */
function LastActionLine({
  conn,
  nowLabel,
}: {
  conn: StatusSummaryConnection;
  nowLabel: string;
}) {
  const freshness = presenceBucket(conn.lastUsedAt);

  return (
    <div className="flex items-center gap-2 flex-wrap text-xs">
      <PresenceDot bucket={freshness} />
      {conn.lastUsedAt === null ? (
        <span className="text-muted-foreground italic">No activity yet</span>
      ) : conn.lastActionTool ? (
        <>
          <code className="font-mono text-foreground">
            {conn.lastActionTool}
          </code>
          {conn.lastActionTarget && (
            <>
              <span className="text-muted-foreground">·</span>
              <code
                className="font-mono text-muted-foreground truncate max-w-[260px]"
                title={conn.lastActionTarget}
              >
                {conn.lastActionTarget}
              </code>
            </>
          )}
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground tabular-nums">
            {formatRelative(conn.lastUsedAt, nowLabel)}
          </span>
        </>
      ) : (
        <span className="text-muted-foreground">
          Authenticated · {formatRelative(conn.lastUsedAt, nowLabel)}{" "}
          <span className="text-muted-foreground/70">(no tool call yet)</span>
        </span>
      )}
    </div>
  );
}

type Presence = "active" | "idle" | "cold";

function presenceBucket(lastUsedAt: number | null): Presence {
  if (lastUsedAt === null) return "cold";
  // Binary threshold at 5 minutes: any request within the last 5 min
  // reads as "still around", anything older reads as idle. The amber
  // in-between was added initially to soften the transition, but the
  // extra state made more noise than clarity — users want a clean yes/no.
  return Date.now() - lastUsedAt < 5 * 60_000 ? "active" : "idle";
}

function PresenceDot({ bucket }: { bucket: Presence }) {
  const map: Record<Presence, { cls: string; title: string }> = {
    active: {
      cls: "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]",
      title: "Active — last request < 5 min ago",
    },
    idle: {
      cls: "bg-muted-foreground/60",
      title: "Idle — no activity in the last 5 min",
    },
    cold: {
      cls: "bg-border",
      title: "Never seen — key was minted but has made no requests yet",
    },
  };
  const { cls, title } = map[bucket];
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${cls}`}
      title={title}
      aria-label={title}
    />
  );
}

/**
 * "Check status" — re-fetches the status endpoint for this key and shows
 * the result inline. Since MCP is pull-based for HTTP-streamable clients,
 * this is a PASSIVE presence poll (reads last_used_at from the Worker),
 * not an active ping. Still useful: if the Agent just made a request
 * between now and the last page render, the pill colour will update.
 */
function CheckStatusButton({ keyId }: { keyId: string }) {
  const router = typeof window !== "undefined" ? null : null;
  const [state, setState] = useState<"idle" | "checking" | "done">("idle");
  const [result, setResult] = useState<string | null>(null);
  void router;

  async function check() {
    setState("checking");
    setResult(null);
    try {
      const res = await fetch(
        `/api/app/connections/status?key_id=${encodeURIComponent(keyId)}`,
        { cache: "no-store" },
      );
      const body = (await res.json()) as {
        last_used_at?: number | null;
      };
      const bucket = presenceBucket(body.last_used_at ?? null);
      const labels: Record<Presence, string> = {
        active: "Active",
        idle: "Idle",
        cold: "Never used",
      };
      setResult(labels[bucket]);
      setState("done");
      setTimeout(() => setState("idle"), 2500);
    } catch {
      setResult("Error");
      setState("done");
      setTimeout(() => setState("idle"), 2500);
    }
  }

  return (
    <button
      type="button"
      onClick={check}
      disabled={state === "checking"}
      className="text-xs rounded border border-border px-2 py-1
                 text-muted-foreground hover:text-foreground hover:border-foreground/40
                 disabled:opacity-50 transition-colors whitespace-nowrap"
      title="Check the Agent's current presence"
    >
      {state === "checking"
        ? "Checking…"
        : state === "done"
          ? result
          : "Check"}
    </button>
  );
}

function formatRelative(ts: number, nowLabel: string): string {
  const diff = Math.max(0, Date.now() - ts);
  const s = Math.floor(diff / 1000);
  if (s < 30) return nowLabel;
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  return new Date(ts).toLocaleDateString();
}

function formatExpiry(
  expiresAt: number | null,
  t: (k: string) => string,
): string {
  if (expiresAt === null) return t("ws.expiry.never");
  const diff = expiresAt - Date.now();
  if (diff <= 0) return t("ws.expiry.expired");
  const days = Math.floor(diff / 86400000);
  if (days >= 2) return t("ws.expiry.inDays").replace("{n}", String(days));
  const hours = Math.floor(diff / 3600000);
  if (hours >= 2) return t("ws.expiry.inHours").replace("{n}", String(hours));
  const mins = Math.max(1, Math.floor(diff / 60000));
  return t("ws.expiry.inMinutes").replace("{n}", String(mins));
}
