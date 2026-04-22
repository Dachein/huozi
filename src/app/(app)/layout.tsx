import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { getIdentity } from "@/lib/identity";

/**
 * App layout — gated by identity. Anything under `(app)/` requires a
 * signed-in principal and a workspace. If either is missing the user is
 * bounced to the auth flow.
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
    redirect("/login?redirect=/workspace");
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
