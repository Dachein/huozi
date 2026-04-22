import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { RevokeKeyButton } from "@/components/workspace/revoke-key-button";
import { getLocale } from "@/lib/i18n/server";
import { getIdentity } from "@/lib/identity";
import { cloudAdminListKeys, slugToWorkspaceId } from "@/lib/drive/admin";

export const metadata: Metadata = {
  title: "Keys — huozi Cloud",
  description: "Manage API keys connecting Agents to your huozi Cloud workspace.",
};

function formatTimestamp(ts: number | string | null): string {
  if (!ts) return "—";
  const d = new Date(typeof ts === "number" ? ts : ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function agentKindLabel(kind: string): string {
  switch (kind) {
    case "claude-code":
      return "Claude Code";
    case "cursor":
      return "Cursor";
    case "desktop":
      return "Claude Desktop";
    case "raw-curl":
      return "Terminal";
    default:
      return "Other";
  }
}

export default async function KeysPage() {
  const locale = await getLocale();
  const identity = await getIdentity();
  const principal = await identity.getPrincipal();

  if (!principal) {
    redirect("/login?redirect=/workspace/keys");
  }

  const ws = await identity.getPrimaryWorkspace();
  if (!ws) {
    redirect("/onboard");
  }

  // UI metadata (labels, agent kind, revoked_at).
  const connections = await identity.listConnections(ws.id);

  // huozi-cloud side: authoritative last_used_at from the Worker's D1.
  let cloudLastUsed = new Map<string, number | null>();
  let cloudError: string | null = null;
  try {
    const keys = await cloudAdminListKeys(slugToWorkspaceId(ws.slug));
    cloudLastUsed = new Map(keys.map((k) => [k.key_id, k.last_used_at]));
  } catch (err) {
    cloudError = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-6 py-12">
          <div className="mb-8 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-accent mb-2">
                Workspace ·{" "}
                <code className="rounded bg-muted px-1 font-mono">
                  {ws.slug}
                </code>
              </p>
              <h1 className="font-serif text-3xl font-bold tracking-wide">
                API keys
              </h1>
              <p className="mt-3 text-sm text-muted-foreground max-w-lg leading-relaxed">
                Each row is one Agent connected to this workspace. Revoking a
                key stops it from being used immediately; existing commits
                stay in history.
              </p>
            </div>
            <Link
              href="/workspace/connect"
              className="shrink-0 rounded-md bg-foreground px-3 py-2 text-xs font-medium text-background hover:opacity-90 transition-opacity"
            >
              + Connect Agent
            </Link>
          </div>

          {cloudError && (
            <div className="mb-6 rounded-lg border border-yellow-500/40 bg-yellow-500/5 px-4 py-2 text-xs">
              <strong>Last-used data unavailable:</strong>{" "}
              <span className="text-muted-foreground">{cloudError}</span>
            </div>
          )}

          {connections.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-sm text-muted-foreground">
              No keys yet.{" "}
              <Link
                href="/workspace/connect"
                className="underline hover:text-foreground"
              >
                Connect your first Agent
              </Link>
              .
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Label</th>
                    <th className="text-left px-4 py-2 font-medium">Agent</th>
                    <th className="text-left px-4 py-2 font-medium">Created</th>
                    <th className="text-left px-4 py-2 font-medium">Last used</th>
                    <th className="text-right px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {connections.map((c) => {
                    const lastUsed = cloudLastUsed.get(c.keyId) ?? null;
                    const revoked = !!c.revokedAt;
                    return (
                      <tr
                        key={c.id}
                        className="border-t border-border/60 align-top"
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium">{c.label}</div>
                          <code className="text-xs text-muted-foreground font-mono">
                            {c.keyId}
                          </code>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {agentKindLabel(c.agentKind)}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {formatTimestamp(c.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {formatTimestamp(lastUsed)}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {revoked ? (
                            <span className="text-xs text-muted-foreground italic">
                              revoked {formatTimestamp(c.revokedAt)}
                            </span>
                          ) : (
                            <RevokeKeyButton
                              keyId={c.keyId}
                              label={c.label}
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-10 pt-6 border-t border-border/50 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <Link
              href="/workspace"
              className="hover:text-foreground transition-colors"
            >
              ← Back to workspace
            </Link>
            <span className="text-border">·</span>
            <Link
              href="/docs"
              className="hover:text-foreground transition-colors"
            >
              API docs
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
