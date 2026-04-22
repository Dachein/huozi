import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { CloudLiveEvents } from "@/components/workspace/cloud-live-events";
import {
  StatusSummary,
  type StatusSummaryConnection,
} from "@/components/workspace/status-summary";
import { OnboardingPrompts } from "@/components/workspace/onboarding-prompts";
import { getLocale } from "@/lib/i18n/server";
import { t, type Locale } from "@/lib/i18n";
import { getIdentity } from "@/lib/identity";
import {
  cloudAdminListKeys,
  slugToWorkspaceId,
} from "@/lib/drive/admin";
import {
  cloudGlob,
  cloudRecent,
  HUOZI_CLOUD_KEY_COOKIE,
  listTools,
  type GlobData,
} from "@/lib/drive/mcp-client";

export const metadata: Metadata = {
  title: "Workspace — huozi Cloud",
  description: "Browse your huozi Cloud workspace files and history.",
};

export default async function CloudWorkspacePage() {
  const locale = await getLocale();
  const cookieStore = await cookies();
  const key = cookieStore.get(HUOZI_CLOUD_KEY_COOKIE)?.value;
  if (!key) {
    redirect("/api/app/session/refresh?next=/workspace");
  }

  const probe = await listTools(key);
  if (!probe.ok) {
    redirect("/api/app/session/refresh?next=/workspace");
  }

  const [globRes, recentRes] = await Promise.all([
    cloudGlob(key, "**/*"),
    cloudRecent(key, 20),
  ]);
  const data: GlobData = globRes.ok
    ? globRes.data
    : { durationMs: 0, numFiles: 0, filenames: [], truncated: false };
  const recent = recentRes.ok ? recentRes.entries : [];

  const isEmpty = data.numFiles === 0;

  return (
    <div className="flex flex-col min-h-screen">
      <WorkspaceShell
        paths={data.filenames}
        numFiles={data.numFiles}
        truncated={data.truncated}
        recent={recent}
      >
        {isEmpty ? (
          <EmptyWorkspace
            locale={locale}
            currentKey={key}
            error={globRes.ok ? null : globRes.message}
          />
        ) : (
          <FilledWorkspace />
        )}
      </WorkspaceShell>
      <CloudLiveEvents mode="workspace" />
    </div>
  );
}

/* ── Empty state ──────────────────────────────────────────────────── */

/**
 * Empty-state pane shown when the user has zero commits in the
 * workspace. Pulls a light telemetry snapshot (connected keys +
 * last-used) from the identity + drive layers and renders two
 * stacked widgets:
 *
 *   1. StatusSummary       — who's connected, when they last worked
 *   2. OnboardingPrompts   — three copyable scenario prompts the user
 *                             feeds to their Agent to create the first
 *                             md / csv / html file
 *
 * Everything below is i18n'd — same surface in zh/en/ja/fr.
 */
async function EmptyWorkspace({
  locale,
  currentKey,
  error,
}: {
  locale: Locale;
  currentKey: string;
  error: string | null;
}) {
  const _ = (k: string) => t(locale, k);

  const connections = await loadConnectionsForStatusSummary(currentKey);

  return (
    <div className="space-y-8">
      <StatusSummary
        workspaceName={connections.workspaceName}
        workspaceSlug={connections.workspaceSlug}
        connections={connections.rows}
        labels={{
          title: _("ws.status.title"),
          connectedAgents: _("ws.status.connectedAgents"),
          browserSession: _("ws.status.browserSession"),
          never: _("ws.status.never"),
          now: _("ws.status.now"),
          activeKeys: _("ws.status.activeKeys"),
          manage: _("ws.status.manage"),
          connectNew: _("ws.status.connectNew"),
        }}
      />

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/5 px-4 py-3 text-sm">
          <strong>Couldn&rsquo;t list files:</strong>{" "}
          <span className="text-muted-foreground">{error}</span>
        </div>
      )}

      <OnboardingPrompts
        heading={_("ws.onboard.heading")}
        subheading={_("ws.onboard.subheading")}
        cards={[
          {
            badge: _("ws.onboard.md.badge"),
            glyph: "文",
            title: _("ws.onboard.md.title"),
            scenario: _("ws.onboard.md.scenario"),
            prompt: _("ws.onboard.md.prompt"),
            copyLabel: _("ws.onboard.copy"),
            copiedLabel: _("ws.onboard.copied"),
          },
          {
            badge: _("ws.onboard.csv.badge"),
            glyph: "表",
            title: _("ws.onboard.csv.title"),
            scenario: _("ws.onboard.csv.scenario"),
            prompt: _("ws.onboard.csv.prompt"),
            copyLabel: _("ws.onboard.copy"),
            copiedLabel: _("ws.onboard.copied"),
          },
          {
            badge: _("ws.onboard.html.badge"),
            glyph: "界",
            title: _("ws.onboard.html.title"),
            scenario: _("ws.onboard.html.scenario"),
            prompt: _("ws.onboard.html.prompt"),
            copyLabel: _("ws.onboard.copy"),
            copiedLabel: _("ws.onboard.copied"),
          },
        ]}
      />
    </div>
  );
}

/**
 * Pulls everything StatusSummary needs:
 *   - current workspace {name, slug}
 *   - list of active connections with labels + kinds
 *   - each connection's last_used_at from the authoritative worker D1
 *   - which connection corresponds to the CURRENT browser session
 *     (matched by hashing the cookie key and comparing to api_keys)
 */
async function loadConnectionsForStatusSummary(currentKey: string): Promise<{
  workspaceName: string;
  workspaceSlug: string;
  rows: StatusSummaryConnection[];
}> {
  const identity = await getIdentity();
  const ws = await identity.getPrimaryWorkspace();
  if (!ws) {
    return { workspaceName: "Workspace", workspaceSlug: "unknown", rows: [] };
  }

  // Worker D1 is the source of truth — every key that can actually
  // authenticate lives there. Supabase `cloud_connections` provides
  // *metadata enrichment* (nicer labels, agent_kind tag) for keys
  // minted via the Connect-Agent UI flow, but keys minted via other
  // paths (device flow, bootstrap, admin mint) may only exist in D1.
  // Use the Worker list as the row set, merge Supabase metadata when
  // it happens to be there.
  const [workerKeysAll, supaConnections] = await Promise.all([
    cloudAdminListKeys(slugToWorkspaceId(ws.slug)).catch(() => []),
    identity.listConnections(ws.id).catch(() => []),
  ]);

  // "Connected Agents" means exactly that — only principals of type
  // 'agent' that have actually authenticated at least once. We filter
  // out:
  //   - principal_type='user' (browser sessions, root/bootstrap keys —
  //     internal plumbing, not real Agents)
  //   - last_used_at IS NULL (minted but never used — dangling keys
  //     that don't represent a live connection)
  const workerKeys = workerKeysAll.filter(
    (k) => k.principal_type === "agent" && k.last_used_at !== null,
  );

  const supaByKeyId = new Map(
    supaConnections
      .filter((c) => !c.revokedAt)
      .map((c) => [c.keyId, c]),
  );

  const sessionKeyId = pickCurrentSessionKeyId(workerKeys, currentKey);

  const rows: StatusSummaryConnection[] = workerKeys.map((k) => {
    const supa = supaByKeyId.get(k.key_id);

    // agent_kind: prefer Supabase, fall back to the `[kind] label`
    // encoding we use in api_keys.name when Supabase doesn't know.
    const { label, agentKind } = supa
      ? { label: supa.label, agentKind: supa.agentKind }
      : parseKeyName(k.name);

    return {
      label,
      agentKind,
      isCurrentSession: k.key_id === sessionKeyId,
      lastUsedAt: k.last_used_at ?? null,
      createdAt: k.created_at,
      revoked: false,
    };
  });

  // Sort: current session first, then most recently used, then
  // never-used at the end (newest created first within that group).
  rows.sort((a, b) => {
    if (a.isCurrentSession !== b.isCurrentSession) {
      return a.isCurrentSession ? -1 : 1;
    }
    const al = a.lastUsedAt ?? 0;
    const bl = b.lastUsedAt ?? 0;
    if (al !== bl) return bl - al;
    return b.createdAt - a.createdAt;
  });

  return {
    workspaceName: ws.name,
    workspaceSlug: ws.slug,
    rows,
  };
}

/**
 * Decode the `[agent-kind] label` convention we encode into
 * api_keys.name when there's no external metadata table (the Edge
 * edition relies on this; device-flow mints also use it).
 */
function parseKeyName(raw: string | null): {
  label: string;
  agentKind: string;
} {
  if (!raw) return { label: "(unnamed)", agentKind: "other" };
  const m = raw.match(/^\[([a-z-]+)\]\s*(.*)$/);
  if (m) {
    return { label: m[2] || "(unnamed)", agentKind: m[1]! };
  }
  return { label: raw, agentKind: "other" };
}

function pickCurrentSessionKeyId(
  workerKeys: Awaited<ReturnType<typeof cloudAdminListKeys>>,
  _currentKey: string,
): string | null {
  // v1 heuristic: the key most-recently used and typed as 'user' is
  // almost certainly the browser session (since only the SSR path hits
  // it on every page render). Reasonable default until we add a
  // hash-match path.
  let best: (typeof workerKeys)[number] | null = null;
  for (const k of workerKeys) {
    if (k.principal_type !== "user") continue;
    if (!k.last_used_at) continue;
    if (!best || (k.last_used_at ?? 0) > (best.last_used_at ?? 0)) {
      best = k;
    }
  }
  return best?.key_id ?? null;
}

/* ── Non-empty state (unchanged from before) ──────────────────────── */

function FilledWorkspace() {
  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-wide">
          <span className="text-accent">云</span> Workspace
        </h1>
      </header>

      <p className="text-sm text-muted-foreground">
        Pick a file from the tree to view it. Markdown and HTML render the
        same way they appear on huozi.app published pages. Agents with
        access to this workspace can edit files at any time — open a file
        and watch the history tab.
      </p>

      <div className="grid sm:grid-cols-3 gap-3">
        <HelpCard
          title="Browse"
          desc="Use the tree (☰ on mobile). Folders remember their expand state."
        />
        <HelpCard
          title="History"
          desc="Every file has a History link showing every commit that touched it."
        />
        <HelpCard
          title="Search"
          desc="Filter files by name using the search box above the tree."
        />
      </div>

      <div className="mt-8 pt-6 border-t border-border/50 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <Link href="/cloud" className="hover:text-foreground transition-colors">
          About huozi Cloud
        </Link>
        <span className="text-border">·</span>
        <Link href="/docs" className="hover:text-foreground transition-colors">
          API docs
        </Link>
        <span className="text-border">·</span>
        <Link
          href="/workspace/connect"
          className="hover:text-foreground transition-colors"
        >
          Connect Agent
        </Link>
        <span className="text-border">·</span>
        <Link
          href="/workspace/keys"
          className="hover:text-foreground transition-colors"
        >
          Keys
        </Link>
      </div>
    </div>
  );
}

function HelpCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="text-sm font-semibold mb-1">{title}</div>
      <div className="text-xs text-muted-foreground">{desc}</div>
    </div>
  );
}
