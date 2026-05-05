/**
 * /authorize — OAuth 2.1 consent page.
 *
 * Agent's browser was redirected here from worker /oauth/authorize after
 * the agent posted its PKCE challenge. We:
 *
 *   1. Look up the pending session on the worker (admin secret).
 *   2. Resolve the current user; if not signed in, bounce to /login with a
 *      redirect back here so the same URL completes the round-trip.
 *   3. Render the consent panel: "[Cursor] wants to access workspace X".
 *      User clicks Approve → /api/app/oauth/approve → worker mints
 *      auth_code → 302 to redirect_uri?code=…&state=… (back to the agent).
 *
 * Both editions hit this page — only the login surface differs (Cloud
 * email-OTP, Edge email+password). Once logged in the consent panel is
 * identical.
 */

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getIdentity } from "@/lib/identity";
import { slugToWorkspaceId } from "@/lib/drive/admin";
import { oauthInspectPending } from "@/lib/drive/oauth-admin";
import { getServerT } from "@/lib/i18n/server";
import { ConsentForm } from "./consent-form";
import { AuthorizeError } from "./authorize-error";

export const metadata: Metadata = {
  title: "Authorize — huozi",
  robots: { index: false, follow: false },
};

interface Props {
  searchParams?: Promise<{ session?: string }>;
}

export default async function AuthorizePage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const sessionId = (params.session ?? "").trim();
  const _ = await getServerT();

  if (!sessionId) {
    return (
      <AuthorizeError
        title={_("auth.authorize.error.missingSession.title")}
        body={_("auth.authorize.error.missingSession.body")}
      />
    );
  }

  const inspect = await oauthInspectPending(sessionId);
  if (!inspect.ok) {
    const reason =
      inspect.error === "expired"
        ? _("auth.authorize.error.expired")
        : inspect.error === "already_consumed"
          ? _("auth.authorize.error.alreadyConsumed")
          : _("auth.authorize.error.notFound");
    return (
      <AuthorizeError title={_("auth.authorize.error.title")} body={reason} />
    );
  }

  const pending = inspect.data;

  // Identity check.
  const identity = await getIdentity();
  const principal = await identity.getPrincipal();
  const workspace = await identity.getPrimaryWorkspace();

  if (!principal) {
    // Bounce to login. After OTP success the user lands back here with the
    // same session_id; the worker row is still alive (15 min TTL).
    const back = `/authorize?session=${encodeURIComponent(sessionId)}`;
    redirect(`/login?redirect=${encodeURIComponent(back)}`);
  }

  if (!principal.workspaceId || !workspace) {
    // No workspace bound. In Cloud: send to /onboard. In Edge this should
    // never happen (the workspace is fixed at deploy time) but we degrade
    // gracefully to /workspace which will show the "no membership" UI.
    const back = `/authorize?session=${encodeURIComponent(sessionId)}`;
    redirect(`/onboard?redirect=${encodeURIComponent(back)}`);
  }

  return (
    <ConsentForm
      sessionId={sessionId}
      clientName={pending.client_name ?? "Unknown client"}
      clientUri={pending.client_uri}
      scope={pending.scope}
      redirectUriHost={(() => {
        try {
          return new URL(pending.redirect_uri).host;
        } catch {
          return pending.redirect_uri;
        }
      })()}
      workspaceName={workspace.name}
      workspaceSlug={workspace.slug}
      workspaceId={slugToWorkspaceId(workspace.slug)}
      principalEmail={principal.email ?? principal.displayLabel}
    />
  );
}
