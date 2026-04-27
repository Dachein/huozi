import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { CloudLiveEvents } from "@/components/workspace/cloud-live-events";
import {
  StatusSummary,
  type StatusSummaryConnection,
} from "@/components/workspace/status-summary";
import { OnboardingPrompts } from "@/components/workspace/onboarding-prompts";
import { WorkspaceStats } from "@/components/workspace/workspace-stats";
import { WorkspaceSearch } from "@/components/workspace/workspace-search";
import { getLocale } from "@/lib/i18n/server";
import { t } from "@/lib/i18n";
import { getIdentity } from "@/lib/identity";
import {
  cloudAdminListFolderAcls,
  cloudAdminListKeys,
  cloudAdminListMembers,
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

  const identity = await getIdentity();
  const principal = await identity.getPrincipal();
  const ws = await identity.getPrimaryWorkspace();

  const [globRes, recentRes, connections, members, folderAcls] =
    await Promise.all([
      cloudGlob(key, "**/*"),
      cloudRecent(key, 20),
      loadConnectionsForStatusSummary(key),
      principal && principal.workspaceId
        ? cloudAdminListMembers(principal.workspaceId).catch(() => [])
        : Promise.resolve([]),
      principal && principal.workspaceId
        ? cloudAdminListFolderAcls({
            workspaceId: principal.workspaceId,
          }).catch(() => [])
        : Promise.resolve([]),
    ]);
  // Member view: only show ACLs they're in (matches what the Worker
  // would actually let them through). Owner sees all.
  const me = members.find((m) => m.user_id === principal?.userId);
  const visibleAcls =
    me?.role === "owner"
      ? folderAcls
      : folderAcls.filter((a) =>
          principal ? a.members.includes(principal.userId) : false,
        );
  const privatePrefixes = new Set(visibleAcls.map((a) => a.path_prefix));
  void ws;
  const data: GlobData = globRes.ok
    ? globRes.data
    : { durationMs: 0, numFiles: 0, filenames: [], truncated: false };
  const recent = recentRes.ok ? recentRes.entries : [];

  const isEmpty = data.numFiles === 0;
  const _ = (k: string) => t(locale, k);

  // Stats: edits in the last 24 h based on the recent feed (we already
  // pull the top 20). Connected-agent count comes from the same row set
  // StatusSummary uses.
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const recent24h = recent.filter((r) => r.timestamp >= cutoff).length;

  return (
    <div className="flex flex-col min-h-screen">
      <WorkspaceShell
        paths={data.filenames}
        numFiles={data.numFiles}
        truncated={data.truncated}
        recent={recent}
        privatePrefixes={privatePrefixes}
        members={members.map((m) => ({
          user_id: m.user_id,
          email: m.email,
          display_name: m.display_name,
        }))}
        currentUserId={principal?.userId}
      >
        <div className="space-y-8">
          {/* Stats strip — three quick numbers so the workspace home leads
              with state instead of explanatory copy. Only meaningful once
              the workspace has files. */}
          {!isEmpty && (
            <WorkspaceStats
              files={data.numFiles}
              recent24h={recent24h}
              agents={connections.rows.length}
              labels={{
                files: _("ws.stats.files"),
                recent: _("ws.stats.recent"),
                agents: _("ws.stats.agents"),
              }}
            />
          )}

          {/* Agent connection status — shown in both empty and filled states.
              It's the user's answer to "who is plugged into this workspace
              right now?" and that question matters regardless of whether
              there are files yet. */}
          <StatusSummary
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

          {!globRes.ok && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/5 px-4 py-3 text-sm">
              <strong>Couldn&rsquo;t list files:</strong>{" "}
              <span className="text-muted-foreground">{globRes.message}</span>
            </div>
          )}

          {isEmpty ? (
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
          ) : (
            <WorkspaceSearch paths={data.filenames} />
          )}
        </div>
      </WorkspaceShell>
      <CloudLiveEvents mode="workspace" />
    </div>
  );
}

/* ── Connection status loader ─────────────────────────────────────── */

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
  const principal = await identity.getPrincipal();
  const ws = await identity.getPrimaryWorkspace();
  if (!ws || !principal) {
    return { workspaceName: "Workspace", workspaceSlug: "unknown", rows: [] };
  }

  // Worker D1 is the single source of truth: api_keys.name carries
  // `[kind] label`, revoked rows are filtered server-side, and every
  // active key necessarily lives here (mints from any path go through
  // the Worker admin API).
  const workerKeysAll = await cloudAdminListKeys(
    slugToWorkspaceId(ws.slug),
  ).catch(() => []);

  // StatusSummary shows the *current user's* Agents only. In a multi-member
  // workspace each member sees their own list — owner's audit view of
  // others' keys lives on /workspace/members.
  // Filters:
  //   - principal_id == current user (own keys only)
  //   - principal_type='agent' (skip browser sessions / system keys)
  //   - last_used_at IS NOT NULL (minted but never used = dangling)
  const workerKeys = workerKeysAll.filter(
    (k) =>
      k.principal_id === principal.userId &&
      k.principal_type === "agent" &&
      k.last_used_at !== null,
  );

  const sessionKeyId = pickCurrentSessionKeyId(workerKeys, currentKey);

  const rows: StatusSummaryConnection[] = workerKeys.map((k) => {
    const { label, agentKind } = parseKeyName(k.name);
    return {
      id: k.key_id,
      keyId: k.key_id,
      label,
      agentKind,
      isCurrentSession: k.key_id === sessionKeyId,
      lastUsedAt: k.last_used_at ?? null,
      lastActionTool: k.last_action_tool ?? null,
      lastActionTarget: k.last_action_target ?? null,
      createdAt: k.created_at,
      revoked: false,
      ttlSeconds: k.ttl_seconds ?? null,
      expiresAt: k.expires_at ?? null,
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

