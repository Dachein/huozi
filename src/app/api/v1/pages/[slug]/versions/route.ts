import { NextResponse } from "next/server";
import { validateApiKey } from "@/lib/auth/api-key";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const auth = await validateApiKey(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
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

  const { data: versions, error } = await supabase
    .from("page_versions")
    .select("version, content_type, created_at")
    .eq("page_id", page.id)
    .order("version", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ versions: versions || [] });
}
