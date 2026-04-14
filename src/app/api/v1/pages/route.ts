import { NextResponse } from "next/server";
import { validateApiKey } from "@/lib/auth/api-key";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderMarkdown } from "@/lib/markdown/renderer";
import { processHtmlDirect } from "@/lib/html/sanitizer";
import { slugify } from "@/lib/utils";
import { generateRandomToken, hashAccessToken } from "@/lib/auth/access-token";
import { z } from "zod/v4";

const CreatePageSchema = z.object({
  slug: z
    .string()
    .regex(/^[a-z0-9]([a-z0-9-]{0,98}[a-z0-9])?$/)
    .optional(),
  title: z.string().min(1).max(500),
  content: z.string().min(1),
  description: z.string().max(500).optional(),
  content_type: z.enum(["markdown", "html"]).default("markdown"),
  published: z.boolean().default(true),
  access_token: z.string().nullable().optional(), // "random", custom string, or null
});

export async function POST(request: Request) {
  const auth = await validateApiKey(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = CreatePageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const pageSlug = data.slug || slugify(data.title);

  if (!pageSlug) {
    return NextResponse.json(
      { error: "Could not generate slug from title" },
      { status: 400 }
    );
  }

  // Content size check (2MB)
  if (new TextEncoder().encode(data.content).length > 2 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Content exceeds 2MB limit" },
      { status: 413 }
    );
  }

  // Render / sanitize content
  let renderedHtml: string | null = null;
  let htmlMeta: { description?: string; ogTitle?: string; ogDescription?: string; ogImage?: string } | undefined;

  if (data.content_type === "markdown") {
    renderedHtml = await renderMarkdown(data.content);
  } else if (data.content_type === "html") {
    const result = processHtmlDirect(data.content);
    renderedHtml = result.html;
    htmlMeta = result.meta;
  }

  const supabase = createAdminClient();

  // Get workspace slug for URL
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("slug")
    .eq("id", auth.workspaceId)
    .single();

  if (!workspace) {
    return NextResponse.json(
      { error: "Workspace not found" },
      { status: 404 }
    );
  }

  const now = new Date().toISOString();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://huozi.app";

  // Handle access token
  let rawToken: string | undefined;
  let tokenHash: string | null = null;
  let tokenHint: string | null = null;

  if (data.access_token === "random") {
    rawToken = generateRandomToken();
    const hashed = await hashAccessToken(rawToken);
    tokenHash = hashed.hash;
    tokenHint = hashed.hint;
  } else if (data.access_token && data.access_token !== "random") {
    const hashed = await hashAccessToken(data.access_token);
    tokenHash = hashed.hash;
    tokenHint = hashed.hint;
  }

  // Use HTML meta as fallback for description
  const description = data.description || htmlMeta?.ogDescription || htmlMeta?.description || null;

  // Check if page exists
  const { data: existing } = await supabase
    .from("pages")
    .select("id, latest_version")
    .eq("workspace_id", auth.workspaceId)
    .eq("slug", pageSlug)
    .single();

  if (existing) {
    // Existing page → create new version
    const newVersion = existing.latest_version + 1;

    // Insert new version
    const { error: versionError } = await supabase
      .from("page_versions")
      .insert({
        page_id: existing.id,
        version: newVersion,
        content: data.content,
        content_type: data.content_type,
        rendered_html: renderedHtml,
      });

    if (versionError) {
      return NextResponse.json(
        { error: versionError.message },
        { status: 500 }
      );
    }

    // Update page metadata
    const updates: Record<string, unknown> = {
      title: data.title,
      description: description,
      is_published: data.published,
      latest_version: newVersion,
      updated_at: now,
    };

    // Only update token if explicitly provided
    if (data.access_token !== undefined) {
      updates.access_token_hash = tokenHash;
      updates.access_token_hint = tokenHint;
    }

    const { data: page, error } = await supabase
      .from("pages")
      .update(updates)
      .eq("id", existing.id)
      .select("id, slug, title, latest_version, created_at, updated_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const result: Record<string, unknown> = {
      ...page,
      version: newVersion,
      url: `${siteUrl}/${workspace.slug}/${page!.slug}`,
    };
    if (rawToken) result.access_token = rawToken;

    return NextResponse.json(result);
  }

  // New page → create page + v1
  const { data: page, error } = await supabase
    .from("pages")
    .insert({
      workspace_id: auth.workspaceId,
      slug: pageSlug,
      title: data.title,
      description: description,
      content_type: data.content_type,
      is_published: data.published,
      latest_version: 1,
      access_token_hash: tokenHash,
      access_token_hint: tokenHint,
      published_at: data.published ? now : null,
    })
    .select("id, slug, title, latest_version, created_at, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Insert v1
  await supabase.from("page_versions").insert({
    page_id: page!.id,
    version: 1,
    content: data.content,
    content_type: data.content_type,
    rendered_html: renderedHtml,
  });

  const result: Record<string, unknown> = {
    ...page,
    version: 1,
    url: `${siteUrl}/${workspace.slug}/${page!.slug}`,
  };
  if (rawToken) result.access_token = rawToken;

  return NextResponse.json(result, { status: 201 });
}

export async function GET(request: Request) {
  const auth = await validateApiKey(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
  const offset = parseInt(searchParams.get("offset") || "0");

  const supabase = createAdminClient();
  const { data: pages, error } = await supabase
    .from("pages")
    .select(
      "id, slug, title, content_type, is_published, latest_version, access_token_hint, created_at, updated_at"
    )
    .eq("workspace_id", auth.workspaceId)
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    pages: (pages || []).map((p) => ({
      ...p,
      has_access_token: !!p.access_token_hint,
    })),
  });
}
