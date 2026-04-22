import Link from "next/link";
import { AgentLogo, agentKindName } from "./agent-logo";

export interface StatusSummaryConnection {
  label: string;
  agentKind: string;
  isCurrentSession: boolean;
  /** ms timestamp, or null if never used. */
  lastUsedAt: number | null;
  /** ms timestamp. */
  createdAt: number;
  revoked: boolean;
}

interface StatusSummaryProps {
  workspaceName: string;
  workspaceSlug: string;
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
 * Empty-state status panel — shows at the top of /workspace when the
 * user has no files yet. Makes the abstract "workspace" feel concrete
 * by naming the Agents that are already connected and when they last
 * ran anything.
 */
export function StatusSummary({
  workspaceName,
  workspaceSlug,
  connections,
  labels,
}: StatusSummaryProps) {
  const active = connections.filter((c) => !c.revoked);
  const lastActivity = active.reduce<number | null>((acc, c) => {
    if (c.lastUsedAt === null) return acc;
    if (acc === null || c.lastUsedAt > acc) return c.lastUsedAt;
    return acc;
  }, null);

  return (
    <section className="rounded-xl border border-border/60 bg-muted/30 p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
            {labels.title}
          </div>
          <div className="mt-1 font-serif text-xl font-bold flex items-baseline gap-2">
            <span className="text-accent">云</span>
            <span>{workspaceName}</span>
            <code className="text-[11px] text-muted-foreground font-mono font-normal">
              ws_{workspaceSlug}
            </code>
          </div>
        </div>
        <Link
          href="/workspace/connect"
          className="shrink-0 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 transition-opacity"
        >
          + {labels.connectNew}
        </Link>
      </div>

      <div className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground mb-2">
        {labels.connectedAgents} · {active.length}
      </div>

      <ul className="space-y-2">
        {active.length === 0 && (
          <li className="text-xs text-muted-foreground italic">
            —
          </li>
        )}
        {active.map((c, idx) => {
          // Main line: Agent kind (Claude Code / Cursor / OpenClaw /
          // Hermes / …). The custom label only appears as a subtle
          // second line when it adds information (not the auto
          // "Device · <email>" which is the same for every row).
          const kindLabel = agentKindName(c.agentKind);
          const isDistinguishingLabel =
            c.label && !/^Device\b/i.test(c.label) && c.label !== kindLabel;
          return (
            <li
              key={idx}
              className="flex items-center gap-3 text-sm"
            >
              <span
                className={`shrink-0 ${
                  c.lastUsedAt !== null
                    ? "text-accent"
                    : "text-muted-foreground/50"
                }`}
              >
                <AgentLogo kind={c.agentKind} size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {kindLabel}
                </span>
                {isDistinguishingLabel && (
                  <span className="block text-[11px] text-muted-foreground/70 truncate">
                    {c.label}
                  </span>
                )}
              </span>
              <span className="text-xs text-muted-foreground whitespace-nowrap tabular-nums">
                {c.lastUsedAt === null
                  ? labels.never
                  : formatRelative(c.lastUsedAt, labels.now)}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          {active.length}{" "}
          {active.length === 1 ? labels.activeKeys.slice(0, -1) : labels.activeKeys}
          {lastActivity !== null && (
            <>
              {" · "}
              <span className="font-mono">
                last activity {formatRelative(lastActivity, labels.now)}
              </span>
            </>
          )}
        </span>
        <Link
          href="/workspace/keys"
          className="underline hover:text-foreground"
        >
          {labels.manage} →
        </Link>
      </div>
    </section>
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
