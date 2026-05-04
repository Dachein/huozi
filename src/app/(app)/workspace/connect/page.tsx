import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ConnectAgent } from "@/components/workspace/connect-agent";
import { getPublicMcpUrl } from "@/lib/cloud-fetch";
import { getIdentity } from "@/lib/identity";
import { getLocale } from "@/lib/i18n/server";
import { t } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Connect an Agent — huozi Cloud",
  description:
    "Generate a workspace API key for Claude Code, Cursor, or OpenClaw — paste one snippet, done.",
};

export default async function ConnectAgentPage() {
  const identity = await getIdentity();
  const principal = await identity.getPrincipal();

  if (!principal) {
    redirect("/login?redirect=/workspace/connect");
  }

  const ws = await identity.getPrimaryWorkspace();
  if (!ws) {
    redirect("/onboard");
  }

  const locale = await getLocale();
  const tx = (key: string) => t(locale, key);
  const mcpUrl = getPublicMcpUrl();

  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex-1">
        <div className="mx-auto max-w-2xl px-6 py-12">
          {/* Top-of-page "← Workspace" return link.  The breadcrumb
              doubles as the primary escape hatch back to /workspace,
              replacing the old bottom-of-page "Back to workspace" that
              users had to scroll to find. */}
          <Link
            href="/workspace"
            className="inline-flex items-center gap-1 text-xs uppercase tracking-wider text-accent hover:text-foreground transition-colors mb-6"
          >
            <span>{tx("connect.back")}</span>
            <span className="text-border mx-0.5">·</span>
            <code className="rounded bg-muted px-1 font-mono normal-case">
              {ws.slug}
            </code>
          </Link>

          <div className="mb-8">
            <h1 className="font-serif text-3xl font-bold tracking-wide">
              {tx("connect.title")}
            </h1>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
              {tx("connect.desc")}
            </p>
          </div>

          <ConnectAgent mcpUrl={mcpUrl} />

          <div className="mt-10 pt-6 border-t border-border/50 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <Link
              href="/workspace"
              className="hover:text-foreground transition-colors"
            >
              {tx("connect.footer.back")}
            </Link>
            <span className="text-border">·</span>
            <Link
              href="/start"
              className="hover:text-foreground transition-colors"
            >
              {tx("connect.footer.start")}
            </Link>
            <span className="text-border">·</span>
            <Link
              href="/docs"
              className="hover:text-foreground transition-colors"
            >
              {tx("connect.footer.docs")}
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
