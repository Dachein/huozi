import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateApiKey } from "@/lib/auth/api-key";
import { RESERVED_SLUGS, WORKSPACE_SLUG_REGEX } from "@/lib/constants";
import { z } from "zod/v4";

const SetupSchema = z.object({
  workspace_slug: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/),
  api_key_name: z.string().max(100).optional(),
});

export async function POST(request: Request) {
  // Authenticate via access_token from verify step
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Authorization header with access_token required" },
      { status: 401 }
    );
  }

  const accessToken = authHeader.slice(7);
  const supabase = createAdminClient();

  // Verify the access token
  const { data: userData, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !userData.user) {
    return NextResponse.json({ error: "Invalid access token" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = SetupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid workspace slug. Use lowercase letters, numbers, and hyphens (1-40 chars)." },
      { status: 400 }
    );
  }

  const slug = parsed.data.workspace_slug;

  if (RESERVED_SLUGS.includes(slug)) {
    return NextResponse.json(
      { error: "This slug is reserved. Please choose another." },
      { status: 400 }
    );
  }

  if (!WORKSPACE_SLUG_REGEX.test(slug)) {
    return NextResponse.json(
      { error: "Invalid slug format." },
      { status: 400 }
    );
  }

  // Check if user already has a workspace
  const { data: existing } = await supabase
    .from("workspaces")
    .select("id, slug")
    .eq("owner_id", userData.user.id)
    .single();

  let workspaceId: string;
  let workspaceSlug: string;

  if (existing) {
    workspaceId = existing.id;
    workspaceSlug = existing.slug;
  } else {
    // Create workspace
    const { data: workspace, error: wsError } = await supabase
      .from("workspaces")
      .insert({
        owner_id: userData.user.id,
        slug,
        name: slug,
      })
      .select("id, slug")
      .single();

    if (wsError) {
      if (wsError.code === "23505") {
        return NextResponse.json(
          { error: "This slug is already taken." },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: wsError.message }, { status: 500 });
    }

    workspaceId = workspace!.id;
    workspaceSlug = workspace!.slug;
  }

  // Generate API key
  const { raw, hash, prefix } = generateApiKey();
  const keyHash = await hash;

  const { error: keyError } = await supabase.from("api_keys").insert({
    workspace_id: workspaceId,
    key_hash: keyHash,
    key_prefix: prefix,
    name: parsed.data.api_key_name || "Default",
  });

  if (keyError) {
    return NextResponse.json({ error: keyError.message }, { status: 500 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://huozi.app";

  return NextResponse.json({
    message: "Setup complete! You can now publish pages.",
    workspace: {
      slug: workspaceSlug,
      url: `${siteUrl}/${workspaceSlug}`,
    },
    api_key: raw,
    usage_example: {
      method: "POST",
      url: `${siteUrl}/api/v1/pages`,
      headers: {
        "Authorization": `Bearer ${raw}`,
        "Content-Type": "application/json",
      },
      body: {
        title: "My First Page",
        content: "# Hello World",
      },
    },
  });
}
