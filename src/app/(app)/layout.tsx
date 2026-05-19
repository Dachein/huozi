import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { Suspense } from "react";
import { AppHeader } from "@/components/app-header";
import { JoinedToast } from "@/components/joined-toast";
import { ConfirmProvider } from "@/components/confirm-provider";
import { getIdentity } from "@/lib/identity";
import { cloudAdminListWorkspaces } from "@/lib/drive/admin";
import { isCloud } from "@/lib/edition";
import { getTheme } from "@/lib/theme/server";
import { ThemeProvider } from "@/lib/theme/context";

/**
 * App layout — gated by identity. Anything under `(app)/` requires a
 * signed-in principal and a workspace. If either is missing the user is
 * bounced to the auth flow.
 *
 * The redirect target preserves the exact path the user tried to reach,
 * so that after login they land where they were headed rather than on
 * a generic /workspace. Middleware injects `x-pathname` on every cloud
 * request; if it's missing (Edge build, direct-layout call, etc.) we
 * fall back to /workspace.
 *
 * Active-subnav highlighting is done client-side by AppHeader itself
 * (via `usePathname`) rather than by threading the path through this
 * layout.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const identity = await getIdentity();
  const principal = await identity.getPrincipal();
  if (!principal) {
    // Both editions now have /login as the entry point — Cloud uses
    // email-OTP, Edge uses email + password (Phase A onwards). The
    // legacy /connect paste-key flow still exists for Edge users who
    // already minted an API key, but is no longer the auth landing.
    const h = await headers();
    const pathname = h.get("x-pathname") ?? "/workspace";
    redirect(`/login?redirect=${encodeURIComponent(pathname)}`);
  }

  const workspace = await identity.getPrimaryWorkspace();
  if (!workspace) {
    // No workspace bound to the session. Cloud distinguishes "no
    // memberships → onboard" from "multiple memberships → pick one".
    // Edge has exactly one workspace pinned at deploy time; reaching
    // here on Edge means something is misconfigured (e.g.
    // HUOZI_EDGE_WORKSPACE_SLUG mismatch with D1) — bounce back to
    // /login so the user can re-auth or re-bootstrap via /admin/setup.
    if (isCloud()) {
      const memberships = await cloudAdminListWorkspaces({
        memberId: principal.userId,
      }).catch(() => []);
      if (memberships.length === 0) {
        redirect("/onboard");
      }
      redirect("/select-workspace");
    }
    redirect("/login");
  }

  // List of every workspace the user belongs to — feeds the switcher in
  // the user menu (only renders when length > 1). Cheap; one D1 query.
  const [memberships, theme] = await Promise.all([
    isCloud()
      ? cloudAdminListWorkspaces({ memberId: principal.userId }).catch(() => [])
      : Promise.resolve([]),
    getTheme(),
  ]);

  return (
    <ConfirmProvider>
      <ThemeProvider theme={theme}>
        <div className="flex flex-col h-dvh overflow-hidden">
          <AppHeader
            principal={principal}
            workspace={workspace}
            theme={theme}
            memberships={memberships.map((w) => ({
              id: w.id,
              slug: w.slug,
              name: w.name,
            }))}
          />
          <Suspense fallback={null}>
            <JoinedToast />
          </Suspense>
          {children}
        </div>
      </ThemeProvider>
    </ConfirmProvider>
  );
}
