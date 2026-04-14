import { NextResponse } from "next/server";
import { validateApiKey } from "@/lib/auth/api-key";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateRandomToken, hashAccessToken } from "@/lib/auth/access-token";
import { z } from "zod/v4";

const TokenSchema = z.object({
  access_token: z.string().nullable(),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const auth = await validateApiKey(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = TokenSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "access_token must be a string or null" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  const { data: page } = await supabase
    .from("pages")
    .select("id")
    .eq("workspace_id", auth.workspaceId)
    .eq("slug", slug)
    .single();

  if (!page) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  let rawToken: string | undefined;
  let tokenHash: string | null = null;
  let tokenHint: string | null = null;

  if (parsed.data.access_token === null) {
    // Remove token — make public
  } else if (parsed.data.access_token === "random") {
    rawToken = generateRandomToken();
    const hashed = await hashAccessToken(rawToken);
    tokenHash = hashed.hash;
    tokenHint = hashed.hint;
  } else {
    const hashed = await hashAccessToken(parsed.data.access_token);
    tokenHash = hashed.hash;
    tokenHint = hashed.hint;
  }

  const { error } = await supabase
    .from("pages")
    .update({
      access_token_hash: tokenHash,
      access_token_hint: tokenHint,
      updated_at: new Date().toISOString(),
    })
    .eq("id", page.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const result: Record<string, unknown> = {
    slug,
    has_access_token: !!tokenHash,
    hint: tokenHint,
  };
  if (rawToken) result.access_token = rawToken;

  return NextResponse.json(result);
}
