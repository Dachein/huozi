import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { AppHeader } from "@/components/app-header";
import { getIdentity } from "@/lib/identity";

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
    const h = await headers();
    const pathname = h.get("x-pathname") ?? "/workspace";
    redirect(`/login?redirect=${encodeURIComponent(pathname)}`);
  }

  const workspace = await identity.getPrimaryWorkspace();
  if (!workspace) {
    redirect("/onboard");
  }

  return (
    <div className="flex flex-col min-h-screen">
      <AppHeader principal={principal} workspace={workspace} />
      {children}
    </div>
  );
}
