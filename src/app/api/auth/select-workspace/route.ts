/**
 * POST /api/auth/select-workspace
 *
 * Browser → Next.js (here) → Worker /auth/select-workspace.
 * The Worker re-issues the JWT cookie with the new wsid claim. We forward
 * the cookie passthrough so the user's browser ends up with both:
 *   - the existing huozi_session cookie (now bound to a workspace)
 *   - any other cookies untouched.
 */

import { NextResponse, type NextRequest } from "next/server";
import { workerSelectWorkspace } from "@/lib/auth/worker-client";
import { buildSessionCookie } from "@/lib/auth/jwt";

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { workspace_id?: string };
  try {
    body = (await req.json()) as { workspace_id?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const wsid = (body.workspace_id ?? "").trim();
  if (!wsid) {
    return NextResponse.json(
      { error: "missing_workspace_id" },
      { status: 400 },
    );
  }

  // Forward only our session cookie so the Worker can identify the user.
  const cookieHeader = req.headers.get("cookie") ?? "";

  const result = await workerSelectWorkspace({ cookieHeader, workspaceId: wsid });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const res = NextResponse.json({
    ok: true,
    wsid: result.wsid,
    role: result.role,
  });
  res.headers.set("set-cookie", buildSessionCookie(result.token));
  return res;
}
