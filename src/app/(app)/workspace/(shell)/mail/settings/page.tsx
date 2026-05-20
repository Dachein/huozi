import type { Metadata } from "next";
import Link from "next/link";
import { getIdentity } from "@/lib/identity";
import {
  cloudAdminEmailAliasList,
  slugToWorkspaceId,
} from "@/lib/drive/admin";
import { MailAliasesClient } from "../mail-aliases-client";

export const metadata: Metadata = {
  title: "Mail · Settings — huozi Cloud",
};

/**
 * /workspace/mail/settings — claim / pause / release email aliases and
 * read the per-provider forwarding walkthrough. Split off from the main
 * /workspace/mail page so the inbox can be the default landing view.
 */
export default async function MailSettingsPage() {
  const identity = await getIdentity();
  const principal = await identity.getPrincipal();
  const ws = await identity.getPrimaryWorkspace();
  const supported = identity.supportsEmailIngest();

  const zoneDomain = "huozi.chat";

  if (!supported || !principal || !ws) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <BackLink />
        <h1 className="font-serif text-2xl font-bold tracking-[0.05em] mb-2">
          Mail · Settings
        </h1>
        <section className="rounded border border-border/60 bg-muted/30 px-4 py-3 text-sm">
          Mail forwarding is a Cloud-only feature. Self-hosted Edge
          deployments don&rsquo;t have shared inbound mail infrastructure.
        </section>
      </main>
    );
  }

  const initial = await cloudAdminEmailAliasList({
    workspace_id: slugToWorkspaceId(ws.slug),
    user_id: principal.userId,
  });
  const initialAliases = initial.ok ? initial.aliases : [];
  const initialError = initial.ok ? null : initial.error;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <BackLink />
      <h1 className="font-serif text-2xl font-bold tracking-[0.05em] mb-2">
        Mail · Settings
      </h1>
      <p className="text-sm text-muted-foreground mb-8">
        Pick a memorable address at <code className="font-mono">@{zoneDomain}</code>{" "}
        and any mail sent there shows up in your inbox as a task. Pause an
        address anytime; release it when you&rsquo;re done with it.
      </p>

      <MailAliasesClient
        zoneDomain={zoneDomain}
        initialAliases={initialAliases}
        initialError={initialError}
        defaultPrefix={ws.slug}
      />
    </main>
  );
}

function BackLink() {
  return (
    <Link
      href="/workspace/mail"
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4"
    >
      <span aria-hidden="true">←</span> Back to inbox
    </Link>
  );
}
