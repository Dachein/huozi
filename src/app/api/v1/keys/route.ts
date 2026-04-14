import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateApiKey } from "@/lib/auth/api-key";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { workspace_id, name } = body;

  // Verify workspace ownership
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id")
    .eq("id", workspace_id)
    .eq("owner_id", user.id)
    .single();

  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const { raw, hash, prefix } = generateApiKey();
  const keyHash = await hash;

  const admin = createAdminClient();
  const { error } = await admin.from("api_keys").insert({
    workspace_id,
    key_hash: keyHash,
    key_prefix: prefix,
    name: name || "Default",
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ key: raw }, { status: 201 });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { id } = body;

  // Verify ownership via workspace
  const admin = createAdminClient();
  const { data: key } = await admin
    .from("api_keys")
    .select("id, workspace_id")
    .eq("id", id)
    .single();

  if (!key) {
    return NextResponse.json({ error: "Key not found" }, { status: 404 });
  }

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id")
    .eq("id", key.workspace_id)
    .eq("owner_id", user.id)
    .single();

  if (!workspace) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  await admin
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id);

  return NextResponse.json({ revoked: true });
}
