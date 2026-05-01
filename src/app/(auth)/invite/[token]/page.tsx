/**
 * /invite/[token]
 *
 * Public landing for invite emails. We render context (workspace name,
 * inviter, email) and a CTA. Actual redeem + cookie re-issue happens in
 * the sibling route handler `/api/app/invites/[token]/accept` so we can
 * mutate cookies cleanly.
 */

import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME, verifySession } from "@/lib/auth/jwt";
import { isEdge } from "@/lib/edition";
import { cloudAdminInspectInvite } from "@/lib/drive/admin";
import { getServerT } from "@/lib/i18n/server";
import { EdgeInviteAcceptForm } from "./edge-invite-form";

interface PageProps {
  params: Promise<{ token: string }>;
  searchParams?: Promise<{ error?: string }>;
}

export default async function InvitePage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const errorCode = (await searchParams)?.error ?? null;
  const _ = await getServerT();

  const invite = await cloudAdminInspectInvite(token).catch(() => null);
  if (!invite) {
    return (
      <Status
        title={_("invite.notFound.title")}
        message={_("invite.notFound.message")}
      />
    );
  }
  if (invite.status === "accepted") {
    return (
      <Status
        title={_("invite.accepted.title")}
        message={_("invite.accepted.message")}
      />
    );
  }
  if (invite.status === "revoked") {
    return (
      <Status
        title={_("invite.revoked.title")}
        message={_("invite.revoked.message")}
      />
    );
  }
  if (invite.status === "expired") {
    return (
      <Status
        title={_("invite.expired.title")}
        message={_("invite.expired.message")}
      />
    );
  }

  // ── Edge edition: render the password-set form. Email is editable
  //    (treated as username; URL is the trust). No "already signed in"
  //    branch — Edge users bootstrap fresh on this page.
  if (isEdge()) {
    return (
      <EdgeInviteAcceptForm
        token={token}
        suggestedEmail={invite.email}
        workspaceName={invite.workspace_name}
        workspaceSlug={invite.workspace_slug}
        inviterEmail={invite.inviter_email}
        errorCode={errorCode}
      />
    );
  }

  const store = await cookies();
  const sessionToken = store.get(SESSION_COOKIE_NAME)?.value;
  const claims = sessionToken ? await verifySession(sessionToken) : null;

  // Already signed in with the matching email — kick off the accept flow.
  if (claims && claims.email.toLowerCase() === invite.email.toLowerCase()) {
    redirect(`/api/app/invites/${token}/accept`);
  }

  // Signed in as a different user — instruct sign-out.
  if (claims) {
    return (
      <Status
        title={_("invite.wrongAccount.title")}
        message={_("invite.wrongAccount.message")
          .replace("{current}", claims.email)
          .replace("{target}", invite.email)}
        cta={{
          href: "/api/app/disconnect",
          label: _("invite.wrongAccount.signOut"),
        }}
      />
    );
  }

  // Not signed in.
  return (
    <div className="w-full max-w-md text-center">
      <h1 className="font-serif text-2xl font-bold tracking-[0.08em] mb-2">
        {_("invite.welcome.title")}
      </h1>
      <p className="text-sm text-muted-foreground mb-1">
        {_("invite.welcome.invitedYouTo").replace(
          "{inviter}",
          invite.inviter_email,
        )}
      </p>
      <p className="font-medium mb-6">
        <span className="block text-base">{invite.workspace_name}</span>
        <span className="block text-xs text-muted-foreground font-mono">
          huozi.app/{invite.workspace_slug}
        </span>
      </p>
      <Link
        href={`/login?redirect=${encodeURIComponent(`/invite/${token}`)}&email=${encodeURIComponent(invite.email)}`}
        className="inline-block w-full rounded-full bg-foreground text-background px-4 py-3 text-sm font-medium hover:opacity-90 transition-opacity"
      >
        {_("invite.welcome.signInAs").replace("{email}", invite.email)}
      </Link>
      <p className="mt-6 text-xs text-muted-foreground">
        {_("invite.welcome.codeNotice").replace("{email}", invite.email)}
      </p>
    </div>
  );
}

function Status({
  title,
  message,
  cta,
}: {
  title: string;
  message: string;
  cta?: { href: string; label: string };
}) {
  return (
    <div className="w-full max-w-md text-center">
      <h1 className="font-serif text-2xl font-bold tracking-[0.08em] mb-3">
        {title}
      </h1>
      <p className="text-sm text-muted-foreground mb-6">{message}</p>
      {cta && (
        <Link
          href={cta.href}
          className="inline-block rounded-full border border-foreground/20 px-4 py-2 text-sm hover:bg-foreground/5 transition-colors"
        >
          {cta.label}
        </Link>
      )}
    </div>
  );
}
