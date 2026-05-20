/**
 * Pre-submission availability check for an email alias prefix.
 *
 *   GET ?prefix=<local_part> → { ok: true, taken: boolean, reason? }
 *
 * Authenticated workspace members only (any role). The route exists so
 * the UI can show "available" / "taken" / "invalid" / "reserved" inline
 * as the user types, instead of forcing them to click Claim to find out.
 *
 * Deliberately does NOT reveal the owner of a taken prefix — only a
 * boolean. Combined with the workspace-member auth gate, this limits
 * enumeration to "is this specific name free" rather than "list all
 * claimed prefixes".
 */

import { NextResponse, type NextRequest } from "next/server";
import { getIdentity } from "@/lib/identity";
import { cloudAdminEmailAliasCheck } from "@/lib/drive/admin";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const identity = await getIdentity();
  if (!identity.supportsEmailIngest()) {
    return NextResponse.json({ error: "unsupported_on_edge" }, { status: 404 });
  }
  const principal = await identity.getPrincipal();
  if (!principal) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const prefix = request.nextUrl.searchParams.get("prefix") ?? "";
  if (!prefix) {
    return NextResponse.json({ error: "missing_prefix" }, { status: 400 });
  }

  const r = await cloudAdminEmailAliasCheck({ local_part: prefix });
  if (!r.ok) {
    return NextResponse.json(
      { error: "upstream", message: r.error },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, taken: r.taken, reason: r.reason });
}
