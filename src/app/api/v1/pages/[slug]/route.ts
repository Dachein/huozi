import { NextResponse } from "next/server";
import { validateApiKey } from "@/lib/auth/api-key";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderMarkdown } from "@/lib/markdown/renderer";
import { processHtmlDirect } from "@/lib/html/sanitizer";
import { z } from "zod/v4";

const UpdatePageSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  content: z.string().min(1).optional(),
  description: z.string().max(500).optional(),
  content_type: z.enum(["markdown", "html"]).optional(),
  published: z.boolean().optional(),
});

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

  const { data: page, error } = await supabase
    .from("pages")
    .select("*")
    .eq("workspace_id", auth.workspaceId)
    .eq("slug", slug)
    .single();

  if (error || !page) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  // Get latest version content
  const { data: version } = await supabase
    .from("page_versions")
    .select("version, content, content_type, rendered_html, created_at")
    .eq("page_id", page.id)
    .eq("version", page.latest_version)
    .single();

  return NextResponse.json({
    ...page,
    content: version?.content,
    rendered_html: version?.rendered_html,
    has_access_token: !!page.access_token_hash,
  });
}

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

  const parsed = UpdatePageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("pages")
    .select("id, latest_version, content_type")
    .eq("workspace_id", auth.workspaceId)
    .eq("slug", slug)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (parsed.data.title) updates.title = parsed.data.title;
  if (parsed.data.description !== undefined)
    updates.description = parsed.data.description;
  if (parsed.data.published !== undefined)
    updates.is_published = parsed.data.published;

  // Resolve content_type: use provided value, or fall back to existing
  const contentType = parsed.data.content_type || existing.content_type;

  // Update content_type on the page if changed
  if (parsed.data.content_type && parsed.data.content_type !== existing.content_type) {
    updates.content_type = parsed.data.content_type;
  }

  // If content changed or content_type changed, create new version
  if (parsed.data.content || parsed.data.content_type) {
    const content = parsed.data.content || null;

    if (content) {
      // Content size check (2MB)
      if (new TextEncoder().encode(content).length > 2 * 1024 * 1024) {
        return NextResponse.json(
          { error: "Content exceeds 2MB limit" },
          { status: 413 }
        );
      }
    }

    // If only content_type changed (no new content), fetch existing content to re-render
    let contentToRender = content;
    if (!contentToRender) {
      const { data: latestVersion } = await supabase
        .from("page_versions")
        .select("content")
        .eq("page_id", existing.id)
        .eq("version", existing.latest_version)
        .single();
      contentToRender = latestVersion?.content || null;
    }

    if (contentToRender) {
      const newVersion = existing.latest_version + 1;
      let renderedHtml: string | null = null;
      if (contentType === "markdown") {
        renderedHtml = await renderMarkdown(contentToRender);
      } else if (contentType === "html") {
        const result = processHtmlDirect(contentToRender);
        renderedHtml = result.html;
      }

      await supabase.from("page_versions").insert({
        page_id: existing.id,
        version: newVersion,
        content: contentToRender,
        content_type: contentType,
        rendered_html: renderedHtml,
      });

      updates.latest_version = newVersion;
    }
  }

  const { data: page, error } = await supabase
    .from("pages")
    .update(updates)
    .eq("id", existing.id)
    .select("id, slug, title, latest_version, is_published, created_at, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(page);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const auth = await validateApiKey(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("pages")
    .delete()
    .eq("workspace_id", auth.workspaceId)
    .eq("slug", slug);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
