/**
 * Workspace-side trigger for Cloudflare Email Routing setup.
 *
 *   GET  → current routing status (any authenticated workspace member)
 *   POST → run the idempotent enable + catch-all wiring (workspace owner only)
 *
 * Both calls forward to the huozi-cloud admin endpoints under
 * `/admin/mail/*` using the shared admin secret. The deployer is
 * responsible for setting CF_API_TOKEN + CF_MAIL_ZONE_ID on the
 * huozi-cloud Worker — without those, `configured: false` comes back
 * and the UI shows a maintainer hint.
 *
 * Cloud-only: Edge deployments have no shared inbound mail domain
 * (see `app/docs/tasks.md` §10), so the routes return 404.
 */

import { NextResponse } from "next/server";
import { getIdentity } from "@/lib/identity";
import {
  cloudAdminMailSetup,
  cloudAdminMailStatus,
} from "@/lib/drive/admin";

async function guard(requireOwner: boolean): Promise<NextResponse | null> {
  const identity = await getIdentity();
  if (!identity.supportsEmailIngest()) {
    return NextResponse.json(
      {
        error: "unsupported_on_edge",
        message: "Email routing setup is a Cloud-only feature.",
      },
      { status: 404 },
    );
  }
  const principal = await identity.getPrincipal();
  if (!principal) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const ws = await identity.getPrimaryWorkspace();
  if (!ws) {
    return NextResponse.json(
      { error: "no_workspace" },
      { status: 404 },
    );
  }
  if (requireOwner && ws.ownerId !== principal.userId) {
    return NextResponse.json(
      {
        error: "forbidden",
        message:
          "Only the workspace owner can change email routing settings.",
      },
      { status: 403 },
    );
  }
  return null;
}

export async function GET(): Promise<NextResponse> {
  const blocked = await guard(false);
  if (blocked) return blocked;
  const result = await cloudAdminMailStatus();
  if (!result.ok) {
    return NextResponse.json(
      { error: "upstream_error", message: result.error },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, status: result.status });
}

export async function POST(): Promise<NextResponse> {
  const blocked = await guard(true);
  if (blocked) return blocked;
  const result = await cloudAdminMailSetup();
  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        status: result.status,
        actions_taken: result.actions_taken,
        error: result.error,
      },
      { status: 502 },
    );
  }
  return NextResponse.json({
    ok: true,
    status: result.status,
    actions_taken: result.actions_taken,
  });
}
