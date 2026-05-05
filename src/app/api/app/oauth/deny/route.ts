/**
 * POST /api/app/oauth/deny
 *
 * Body: { session_id }
 *
 * The user clicked "Reject". We bounce control back to the agent with
 * `?error=access_denied&state=…`.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getIdentity } from "@/lib/identity";
import { oauthDeny } from "@/lib/drive/oauth-admin";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const identity = await getIdentity();
  const principal = await identity.getPrincipal();
  if (!principal) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  let body: { session_id?: string };
  try {
    body = (await req.json()) as { session_id?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const sessionId = (body.session_id ?? "").trim();
  if (!sessionId) {
    return NextResponse.json({ error: "missing_session_id" }, { status: 400 });
  }
  const result = await oauthDeny({ session_id: sessionId });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }
  return NextResponse.json({ ok: true, redirect_url: result.redirect_url });
}
