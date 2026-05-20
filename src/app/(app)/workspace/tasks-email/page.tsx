/**
 * /workspace/tasks-email
 *
 * Per-user Tasks email magic-address management. Cloud-only — Edge
 * renders a "not available" placeholder, since Edge has no shared
 * inbound mail domain (see `app/docs/tasks.md` §10).
 *
 * Server component does the initial token fetch (get-or-mint) so the
 * client renders with the address already in hand. Mutations (rotate,
 * revoke, update allowlist) go through the client's `/api/app/tasks/email-token`
 * route. WS-driven `router.refresh()` isn't useful here — the token
 * table isn't part of the workspace's R2/D1 commit stream — so the
 * client updates its own state from each fetch response.
 */

import { getIdentity } from "@/lib/identity";
import {
  cloudAdminEmailTokenGetOrMint,
  slugToWorkspaceId,
} from "@/lib/drive/admin";
import { TasksEmailClient } from "./tasks-email-client";

export default async function TasksEmailPage() {
  const identity = await getIdentity();
  const principal = await identity.getPrincipal();
  const ws = await identity.getPrimaryWorkspace();

  if (!principal || !ws) return null;

  if (!identity.supportsEmailIngest()) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="font-serif text-2xl font-bold tracking-[0.05em] mb-2">
          Tasks · Email ingest
        </h1>
        <p className="text-sm text-muted-foreground mb-8">
          Inbound mail isn't part of this huozi deployment.
        </p>
        <section className="rounded border border-border/60 bg-muted/30 px-4 py-3 text-sm">
          <p className="mb-2">
            Email magic addresses are a Cloud feature — they live on the
            shared <code className="font-mono">huozi.chat</code>{" "}
            domain. Self-hosted Edge deployments don't have shared inbound
            mail infrastructure.
          </p>
          <p className="text-muted-foreground">
            You can still feed Tasks via webhook ingest or manual create.
            See <code className="font-mono">app/docs/tasks.md</code> §10
            for the supported channels on Edge.
          </p>
        </section>
      </main>
    );
  }

  const initial = await cloudAdminEmailTokenGetOrMint({
    workspace_id: slugToWorkspaceId(ws.slug),
    user_id: principal.userId,
  });

  if (!initial.ok) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="font-serif text-2xl font-bold tracking-[0.05em] mb-2">
          Tasks · Email ingest
        </h1>
        <p className="text-sm text-rose-600">
          Couldn't load your email address: {initial.error}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="font-serif text-2xl font-bold tracking-[0.05em] mb-2">
        Tasks · Email ingest
      </h1>
      <p className="text-sm text-muted-foreground mb-8">
        Forward mail to your magic address and it lands as a task in this
        workspace. Anyone who knows the address can deliver mail to you,
        so don't paste it into public places — rotate if it leaks.
      </p>
      <TasksEmailClient
        initialAddress={initial.address}
        initialCreatedAt={initial.created_at}
        initialLastUsedAt={initial.last_used_at}
        initialAllowedSenders={initial.allowed_senders}
      />
    </main>
  );
}
