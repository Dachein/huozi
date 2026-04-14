import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAccessToken } from "@/lib/auth/access-token";

export async function POST(request: Request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { page_id, token } = body;
  if (!page_id || !token) {
    return NextResponse.json(
      { error: "page_id and token required" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  const { data: page } = await supabase
    .from("pages")
    .select("access_token_hash")
    .eq("id", page_id)
    .single();

  if (!page || !page.access_token_hash) {
    return NextResponse.json({ valid: false }, { status: 403 });
  }

  const valid = await verifyAccessToken(token, page.access_token_hash);
  return NextResponse.json({ valid });
}
