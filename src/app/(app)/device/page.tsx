import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getIdentity } from "@/lib/identity";
import {
  cloudAdminDeviceInspect,
  type DeviceGrantSummary,
} from "@/lib/drive/admin";
import { DeviceAuthorizeForm } from "@/components/app/device-authorize-form";

export const metadata: Metadata = {
  title: "Authorize device — huozi",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ code?: string }>;

/**
 * Device-flow authorization page. A signed-in user lands here (typically
 * via a link printed by their CLI) to grant an Agent access to one of
 * their workspaces.
 *
 * Shape:
 *   - If no `?code=` in URL: prompt the user to paste the user_code
 *     their Agent printed
 *   - If `?code=`: lookup the grant, show client info (client_name,
 *     agent_kind), and render the Authorize / Deny form
 *   - Bad code / expired / already authorized: show a clear state
 *
 * Layout note: `(app)` group gates the route on identity + workspace,
 * so by the time we reach the form we know we have both.
 */

export default async function DevicePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { code: rawCode } = await searchParams;
  const userCode = (rawCode ?? "").trim().toUpperCase();

  const identity = await getIdentity();
  const principal = await identity.getPrincipal();
  if (!principal) {
    // Should have been caught by (app) layout gate, but double-check.
    redirect(
      `/login?redirect=${encodeURIComponent(`/device${userCode ? `?code=${userCode}` : ""}`)}`,
    );
  }
  const workspace = await identity.getPrimaryWorkspace();
  if (!workspace) {
    redirect(`/onboard`);
  }

  // If no user_code yet, show the input form.
  if (!userCode) {
    return <EnterCodeForm />;
  }

  // Look up the grant by user_code.
  let grant: DeviceGrantSummary | null = null;
  let lookupError: string | null = null;
  try {
    grant = await cloudAdminDeviceInspect(userCode);
  } catch (err) {
    lookupError = err instanceof Error ? err.message : String(err);
  }

  if (lookupError) {
    return (
      <StatusPage tone="error" title="Couldn't check that code">
        <p>{lookupError}</p>
        <p>
          <Link href="/device" className="underline">
            Try a different code
          </Link>
        </p>
      </StatusPage>
    );
  }

  if (!grant) {
    return (
      <StatusPage tone="error" title="Unknown code">
        <p>
          <span className="font-mono">{userCode}</span> didn&rsquo;t match any
          active device request. Make sure you typed it exactly as it was
          printed by your Agent.
        </p>
        <p>
          <Link href="/device" className="underline">
            Enter a different code
          </Link>
        </p>
      </StatusPage>
    );
  }

  const now = Date.now();
  if (grant.status === "expired" || grant.expires_at < now) {
    return (
      <StatusPage tone="warn" title="Code expired">
        <p>
          This code has expired. Re-run the Agent command to get a fresh code.
        </p>
      </StatusPage>
    );
  }

  if (grant.status === "denied") {
    return (
      <StatusPage tone="warn" title="Request denied">
        <p>You (or someone on this workspace) previously denied this code.</p>
      </StatusPage>
    );
  }

  if (grant.status === "authorized" || grant.status === "consumed") {
    return (
      <StatusPage tone="ok" title="Already authorized">
        <p>
          This code has been used. Your Agent should already have its key.
          You can close this tab.
        </p>
      </StatusPage>
    );
  }

  // status === "pending" — render the authorize form.
  return (
    <DeviceAuthorizeForm
      userCode={grant.user_code}
      clientName={grant.client_name}
      agentKind={grant.agent_kind}
      workspace={{ id: workspace.id, slug: workspace.slug, name: workspace.name }}
      userDisplay={principal.email ?? principal.displayLabel}
    />
  );
}

function EnterCodeForm() {
  return (
    <div className="w-full max-w-md mx-auto px-6 py-16">
      <h1 className="font-serif text-3xl font-bold tracking-[0.08em] text-center mb-3">
        Authorize a device
      </h1>
      <p className="text-sm text-muted-foreground text-center mb-10">
        Enter the code your Agent printed in its terminal.
      </p>
      <form method="GET" action="/device" className="space-y-6">
        <div>
          <label
            htmlFor="code"
            className="block text-xs uppercase tracking-[0.15em] text-muted-foreground mb-2"
          >
            User code
          </label>
          <input
            id="code"
            name="code"
            type="text"
            autoFocus
            autoComplete="off"
            spellCheck={false}
            placeholder="ABCD-1234"
            maxLength={9}
            className="w-full border-0 border-b border-border bg-transparent px-0 py-2
                       text-center text-2xl font-mono tracking-[0.35em] uppercase
                       focus:outline-none focus:border-foreground/60 transition-colors
                       placeholder:text-muted-foreground/40"
          />
        </div>
        <button
          type="submit"
          className="w-full rounded-full bg-foreground px-4 py-3 text-sm font-medium text-background hover:opacity-90"
        >
          Continue
        </button>
      </form>
    </div>
  );
}

function StatusPage({
  tone,
  title,
  children,
}: {
  tone: "ok" | "warn" | "error";
  title: string;
  children: React.ReactNode;
}) {
  const toneCls =
    tone === "ok"
      ? "border-emerald-500/30 bg-emerald-500/5"
      : tone === "warn"
        ? "border-yellow-500/30 bg-yellow-500/5"
        : "border-red-500/30 bg-red-500/5";
  const dotCls =
    tone === "ok"
      ? "bg-emerald-500"
      : tone === "warn"
        ? "bg-yellow-500"
        : "bg-red-500";
  return (
    <div className="w-full max-w-md mx-auto px-6 py-16">
      <h1 className="font-serif text-3xl font-bold tracking-[0.08em] text-center mb-6">
        {title}
      </h1>
      <div className={`rounded-lg border ${toneCls} px-4 py-4 text-sm space-y-3`}>
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider">
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotCls}`} />
          <span>status</span>
        </div>
        <div className="text-sm space-y-2">{children}</div>
      </div>
      <div className="mt-6 text-center">
        <Link
          href="/workspace"
          className="text-xs text-muted-foreground hover:text-foreground underline"
        >
          Back to workspace
        </Link>
      </div>
    </div>
  );
}
