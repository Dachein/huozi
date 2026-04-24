"use client";

import Link from "next/link";
import { useState } from "react";
import { AgentLogo, agentKindName } from "./agent-logo";
import { KeyTtlSelect } from "./key-ttl-select";
import { RevokeKeyButton } from "./revoke-key-button";
import { useT } from "@/lib/i18n/context";

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
}

interface StatusSummaryProps {
  connections: StatusSummaryConnection[];
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
export function StatusSummary({ connections, labels }: StatusSummaryProps) {
  const t = useT();
  const [openId, setOpenId] = useState<string | null>(null);

  const active = connections.filter((c) => !c.revoked);
  const lastActivity = active.reduce<number | null>((acc, c) => {
    if (c.lastUsedAt === null) return acc;
    if (acc === null || c.lastUsedAt > acc) return c.lastUsedAt;
    return acc;
  }, null);

  return (
    <section className="rounded-xl border border-border/60 bg-muted/30 p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
          {labels.connectedAgents} · {active.length}
        </div>
        <Link
          href="/workspace/connect"
          className="shrink-0 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 transition-opacity"
        >
          + {labels.connectNew}
        </Link>
      </div>

      <ul className="space-y-1.5">
        {active.length === 0 && (
          <li className="text-xs text-muted-foreground italic py-2">—</li>
        )}
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
        {lastActivity !== null && (
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
  const isDistinguishingLabel =
    conn.label &&
    !/^Device\b/i.test(conn.label) &&
    conn.label !== kindLabel;

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
          <span className="block truncate font-medium text-foreground">
            {kindLabel}
          </span>
          {isDistinguishingLabel && (
            <span className="block text-xs text-muted-foreground truncate">
              {conn.label}
            </span>
          )}
        </span>
        {/* Presence dot moved to end-of-row (sits next to the relative
            timestamp instead of overlapping the agent logo). Cleaner
            reading order: "who · when · how alive". */}
        <PresenceDot bucket={presenceBucket(conn.lastUsedAt)} />
        <span className="text-xs text-muted-foreground whitespace-nowrap tabular-nums">
          {conn.lastUsedAt === null
            ? neverLabel
            : formatRelative(conn.lastUsedAt, nowLabel)}
        </span>
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
            <div className="flex items-center gap-2 flex-wrap">
              <KeyTtlSelect
                keyId={conn.keyId}
                currentTtlSeconds={conn.ttlSeconds}
              />
              {conn.ttlSeconds !== null && (
                // Only render the relative countdown when there IS a
                // finite expiry. "Never" in the dropdown already says
                // "never expires" — a second text tag would be noise.
                <span
                  className="text-xs text-muted-foreground"
                  title={t("ws.expiry.hint")}
                >
                  {formatExpiry(conn.expiresAt, t)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <code
                className="flex-1 min-w-0 text-xs text-muted-foreground font-mono truncate"
                title={conn.keyId}
              >
                {conn.keyId}
              </code>
              <CopyButton value={conn.keyId} />
              <CheckStatusButton keyId={conn.keyId} />
              <RevokeKeyButton keyId={conn.keyId} label={conn.label} />
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

function CopyButton({ value }: { value: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          /* ignore */
        }
      }}
      className="text-xs rounded border border-border px-2 py-1
                 text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
    >
      {copied ? t("ws.action.copied") : t("ws.action.copy")}
    </button>
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

type Presence = "active" | "recent" | "idle" | "cold";

function presenceBucket(lastUsedAt: number | null): Presence {
  if (lastUsedAt === null) return "cold";
  const elapsed = Date.now() - lastUsedAt;
  // Thresholds tuned so the dot matches a user's intuitive sense of
  // "are they here right now?" — an Agent that made any request in the
  // last 3 minutes is probably still in a working session; past 5
  // minutes it feels genuinely idle. The amber gap (3–5 min) softens
  // the transition rather than flipping green→gray abruptly.
  if (elapsed < 3 * 60_000) return "active";
  if (elapsed < 5 * 60_000) return "recent";
  return "idle";
}

function PresenceDot({ bucket }: { bucket: Presence }) {
  const map: Record<Presence, { cls: string; title: string }> = {
    active: {
      cls: "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]",
      title: "Active — last request < 3 min ago",
    },
    recent: {
      cls: "bg-amber-500",
      title: "Recently active — last request 3–5 min ago",
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
        recent: "Recent",
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
