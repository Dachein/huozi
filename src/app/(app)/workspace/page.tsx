import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { CloudLiveEvents } from "@/components/workspace/cloud-live-events";
import { getLocale } from "@/lib/i18n/server";
import { getIdentity } from "@/lib/identity";
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
    // No browser-session key. If the identity layer says the principal has
    // no workspace yet, push to onboarding; otherwise fall back to the
    // paste-key flow for legacy / raw-key users.
    const identity = await getIdentity();
    const principal = await identity.getPrincipal();
    if (principal) {
      const ws = await identity.getPrimaryWorkspace();
      if (!ws) redirect("/onboard");
    }
    redirect("/connect");
  }

  const probe = await listTools(key);
  if (!probe.ok) {
    redirect(
      `/connect?error=${encodeURIComponent(probe.message.slice(0, 120))}`,
    );
  }

  const [globRes, recentRes] = await Promise.all([
    cloudGlob(key, "**/*"),
    cloudRecent(key, 20),
  ]);
  const data: GlobData = globRes.ok
    ? globRes.data
    : { durationMs: 0, numFiles: 0, filenames: [], truncated: false };
  const recent = recentRes.ok ? recentRes.entries : [];

  return (
    <div className="flex flex-col min-h-screen">
      <WorkspaceShell
        paths={data.filenames}
        numFiles={data.numFiles}
        truncated={data.truncated}
        recent={recent}
      >
        <WelcomePane hasFiles={data.numFiles > 0} error={globRes.ok ? null : globRes.message} />
      </WorkspaceShell>
      <CloudLiveEvents mode="workspace" />
    </div>
  );
}

function WelcomePane({
  hasFiles,
  error,
}: {
  hasFiles: boolean;
  error: string | null;
}) {
  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-wide">
          <span className="text-accent">云</span> Workspace
        </h1>
      </header>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/5 px-4 py-3 text-sm">
          <strong>Couldn&rsquo;t list files:</strong>{" "}
          <span className="text-muted-foreground">{error}</span>
        </div>
      )}

      {!hasFiles && !error && (
        <div className="rounded-lg border border-dashed border-border p-8 text-sm text-muted-foreground">
          <p className="mb-3 text-foreground font-medium">
            This workspace is empty.
          </p>
          <p className="mb-2">
            Connect an Agent (Claude Code, Cursor, Claude Desktop) to{" "}
            <code className="rounded bg-muted px-1 font-mono">
              cloud.huozi.app/mcp
            </code>{" "}
            with your API key and have it create files here. Visit{" "}
            <Link
              href="/workspace/connect"
              className="underline hover:text-foreground"
            >
              Connect an Agent
            </Link>{" "}
            to get a ready-to-paste setup snippet.
          </p>
          <p>
            Your changes and any Agent&rsquo;s changes will show up in the file
            tree on the left (or behind the ☰ menu on mobile).
          </p>
        </div>
      )}

      {hasFiles && (
        <div className="space-y-4">
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
        </div>
      )}

      {/* Secondary nav (always visible) */}
      <div className="mt-8 pt-6 border-t border-border/50 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <Link href="/cloud" className="hover:text-foreground transition-colors">
          About huozi Cloud
        </Link>
        <span className="text-border">·</span>
        <Link
          href="/docs"
          className="hover:text-foreground transition-colors"
        >
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
        <span className="ml-auto">
          <form method="POST" action="/api/app/disconnect" className="inline">
            <button
              type="submit"
              className="hover:text-foreground transition-colors underline"
            >
              Disconnect
            </button>
          </form>
        </span>
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
