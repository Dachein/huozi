/**
 * /select-workspace
 *
 * Multi-membership users land here after OTP. They pick which workspace
 * to enter; the JWT is re-minted with that wsid claim and they're sent
 * to /workspace.
 *
 * Single-membership users skip this page (Worker auto-bakes wsid into
 * JWT during /auth/otp/verify and sends them straight to /workspace).
 *
 * Zero-membership users skip this page too — they're sent to /onboard.
 */

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySession } from "@/lib/auth/jwt";
import { cloudAdminListWorkspaces } from "@/lib/drive/admin";
import { getServerT } from "@/lib/i18n/server";
import { SelectWorkspaceForm } from "./form";

export default async function SelectWorkspacePage() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    redirect("/login");
  }
  const claims = await verifySession(token);
  if (!claims) {
    redirect("/login");
  }
  // Already bound — no point being on this page.
  if (claims.wsid) {
    redirect("/workspace");
  }

  const workspaces = await cloudAdminListWorkspaces({ memberId: claims.sub });
  if (workspaces.length === 0) {
    redirect("/onboard");
  }
  if (workspaces.length === 1) {
    // Edge case: user landed here via direct URL; pick automatically.
    redirect("/workspace");
  }

  const _ = await getServerT();

  return (
    <div className="w-full max-w-md">
      <div className="text-center mb-8">
        <h1 className="font-serif text-2xl font-bold tracking-[0.08em]">
          {_("auth.selectWorkspace.title")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {_("auth.selectWorkspace.subtitle").replace(
            "{count}",
            String(workspaces.length),
          )}
        </p>
      </div>
      <SelectWorkspaceForm
        workspaces={workspaces.map((w) => ({
          id: w.id,
          slug: w.slug,
          name: w.name,
        }))}
      />
    </div>
  );
}
