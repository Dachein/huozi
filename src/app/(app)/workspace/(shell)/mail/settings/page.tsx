import type { Metadata } from "next";
import { SideDrawer } from "@/components/workspace/side-drawer";
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
      <SideDrawer title="Mail · Settings" closeFallback="/workspace/mail">
        <section className="rounded border border-border bg-muted px-4 py-3 text-sm">
          Mail forwarding is a Cloud-only feature. Self-hosted Edge
          deployments don&rsquo;t have shared inbound mail infrastructure.
        </section>
      </SideDrawer>
    );
  }

  const initial = await cloudAdminEmailAliasList({
    workspace_id: slugToWorkspaceId(ws.slug),
    user_id: principal.userId,
  });
  const initialAliases = initial.ok ? initial.aliases : [];
  const initialError = initial.ok ? null : initial.error;

  return (
    <SideDrawer title="Mail · Settings" closeFallback="/workspace/mail">
      <p className="text-sm text-muted-foreground mb-6">
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
    </SideDrawer>
  );
}
