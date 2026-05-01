import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { RevokeShareButton } from "@/components/workspace/revoke-share-button";
import { getLocale } from "@/lib/i18n/server";
import { getIdentity } from "@/lib/identity";
import { HUOZI_CLOUD_KEY_COOKIE } from "@/lib/drive/mcp-client";
import { listShares } from "@/lib/drive/shares";

export const metadata: Metadata = {
  title: "Shares — huozi Cloud",
  description: "Manage public share URLs for your workspace files.",
};

function formatTime(ts: number | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export default async function SharesPage() {
  const locale = await getLocale();
  const identity = await getIdentity();
  const principal = await identity.getPrincipal();
  if (!principal) {
    redirect("/login?redirect=/workspace/shares");
  }
  const ws = await identity.getPrimaryWorkspace();
  if (!ws) {
    redirect("/onboard");
  }

  const cookieStore = await cookies();
  const key = cookieStore.get(HUOZI_CLOUD_KEY_COOKIE)?.value;
  if (!key) {
    redirect("/api/app/session/refresh?next=/workspace/shares");
  }

  const res = await listShares(key);
  const shares = res.ok ? res.shares.filter((s) => s.revoked_at === null) : [];
  const err = res.ok ? null : res.message;

  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-6 py-12">
          {/* Top-of-page "← Workspace" return link.  Same pattern as
              /workspace/connect — primary escape hatch at the top. */}
          <Link
            href="/workspace"
            className="inline-flex items-center gap-1 text-xs uppercase tracking-wider text-accent hover:text-foreground transition-colors mb-6"
          >
            <span aria-hidden>←</span>
            <span>Workspace</span>
            <span className="text-border mx-0.5">·</span>
            <code className="rounded bg-muted px-1 font-mono normal-case">
              {ws.slug}
            </code>
          </Link>

          <div className="mb-8">
            <h1 className="font-serif text-3xl font-bold tracking-wide">
              Shares
            </h1>
            <p className="mt-3 text-sm text-muted-foreground max-w-lg leading-relaxed">
              Each share is a public URL that tracks a file live — every visit
              serves the latest bytes. Revoking turns the URL off immediately;
              the file itself is unchanged.
            </p>
          </div>

          {err && (
            <div className="mb-6 rounded-lg border border-red-500/40 bg-red-500/5 px-4 py-2 text-sm">
              <strong>Couldn&rsquo;t load shares:</strong>{" "}
              <span className="text-muted-foreground">{err}</span>
            </div>
          )}

          {shares.length === 0 && !err ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-sm text-muted-foreground">
              No active shares.{" "}
              <Link
                href="/workspace"
                className="underline hover:text-foreground"
              >
                Open a file
              </Link>{" "}
              and use the <span className="font-mono">⋯ · Publish</span> menu
              to create one.
            </div>
          ) : shares.length > 0 ? (
            <div className="huozi-card rounded-lg border border-border/60 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wider text-muted-foreground border-b border-border/60">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">File</th>
                    <th className="text-left px-4 py-2 font-medium">URL</th>
                    <th className="text-left px-4 py-2 font-medium">Gate</th>
                    <th className="text-left px-4 py-2 font-medium">Views</th>
                    <th className="text-left px-4 py-2 font-medium">Created</th>
                    <th className="text-right pl-4 pr-6 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {shares.map((s) => {
                    const shareUrl = `/p/${s.slug}`;
                    return (
                      <tr
                        key={s.slug}
                        className="border-t border-border/60 align-top"
                      >
                        <td className="px-4 py-3">
                          <Link
                            href={`/workspace/view?path=${encodeURIComponent(s.file_path)}`}
                            className="font-mono text-xs hover:text-foreground underline"
                          >
                            {s.file_path}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <a
                            href={shareUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono underline hover:text-foreground"
                          >
                            /p/{s.slug}
                          </a>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {s.has_passcode ? (
                            <span className="text-accent">6-digit</span>
                          ) : (
                            <span className="text-muted-foreground">Public</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs tabular-nums">
                          {s.view_count}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {formatTime(s.created_at)}
                        </td>
                        <td className="pl-4 pr-6 py-3 text-right whitespace-nowrap">
                          <RevokeShareButton
                            slug={s.slug}
                            path={s.file_path}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

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
