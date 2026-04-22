import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ConnectAgent } from "@/components/workspace/connect-agent";
import { getLocale } from "@/lib/i18n/server";
import { getIdentity } from "@/lib/identity";

export const metadata: Metadata = {
  title: "Connect an Agent — huozi Cloud",
  description: "Generate a workspace API key for Claude Code, Cursor, or Claude Desktop.",
};

export default async function ConnectAgentPage() {
  const locale = await getLocale();
  const identity = await getIdentity();
  const principal = await identity.getPrincipal();

  if (!principal) {
    redirect("/login?redirect=/workspace/connect");
  }

  const ws = await identity.getPrimaryWorkspace();
  if (!ws) {
    redirect("/onboard");
  }

  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex-1">
        <div className="mx-auto max-w-2xl px-6 py-12">
          <div className="mb-8">
            <p className="text-xs uppercase tracking-wider text-accent mb-2">
              Workspace ·{" "}
              <code className="rounded bg-muted px-1 font-mono">{ws.slug}</code>
            </p>
            <h1 className="font-serif text-3xl font-bold tracking-wide">
              Connect an Agent
            </h1>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
              Each Agent (Claude Code, Cursor, Claude Desktop…) gets its own API
              key. Keys are independent — you can revoke one without affecting
              the others.
            </p>
          </div>

          <ConnectAgent />

          <div className="mt-10 pt-6 border-t border-border/50 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <Link
              href="/workspace"
              className="hover:text-foreground transition-colors"
            >
              ← Back to workspace
            </Link>
            <span className="text-border">·</span>
            <Link
              href="/workspace/keys"
              className="hover:text-foreground transition-colors"
            >
              Manage existing keys
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
