import { createAdminClient } from "@/lib/supabase/admin";
import { renderMarkdown } from "@/lib/markdown/renderer";
import { processHtmlDirect } from "@/lib/html/sanitizer";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SITE_URL } from "@/lib/constants";
import { AccessGate } from "@/components/access-gate";

interface PageProps {
  params: Promise<{ workspace: string; slug: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { workspace, slug } = await params;
  const supabase = createAdminClient();

  const { data: ws } = await supabase
    .from("workspaces")
    .select("id")
    .eq("slug", workspace)
    .single();

  if (!ws) return {};

  const { data: page } = await supabase
    .from("pages")
    .select("title, description, access_token_hash")
    .eq("workspace_id", ws.id)
    .eq("slug", slug)
    .eq("is_published", true)
    .single();

  if (!page) return {};

  const desc = page.access_token_hash
    ? "This page is protected."
    : page.description || `${page.title} — published on Huozi`;

  return {
    title: page.title,
    description: desc,
    openGraph: {
      title: page.title,
      description: desc,
      url: `${SITE_URL}/${workspace}/${slug}`,
      type: "article",
      siteName: "活字 Huozi",
    },
    twitter: {
      card: "summary_large_image",
      title: page.title,
      description: desc,
    },
  };
}

export default async function PublicPage({ params }: PageProps) {
  const { workspace, slug } = await params;
  const supabase = createAdminClient();

  const { data: ws } = await supabase
    .from("workspaces")
    .select("id, name, slug")
    .eq("slug", workspace)
    .single();

  if (!ws) notFound();

  const { data: page } = await supabase
    .from("pages")
    .select("*")
    .eq("workspace_id", ws.id)
    .eq("slug", slug)
    .eq("is_published", true)
    .single();

  if (!page) notFound();

  // Get latest version
  const { data: version } = await supabase
    .from("page_versions")
    .select("version, content, content_type, rendered_html, created_at")
    .eq("page_id", page.id)
    .eq("version", page.latest_version)
    .single();

  if (!version) notFound();

  // Render if needed
  let html = version.rendered_html;
  if (!html) {
    if (version.content_type === "markdown") {
      html = await renderMarkdown(version.content);
    } else if (version.content_type === "html") {
      html = processHtmlDirect(version.content).html;
    }
    if (html) {
      supabase
        .from("page_versions")
        .update({ rendered_html: html })
        .eq("page_id", page.id)
        .eq("version", version.version)
        .then(() => {});
    }
  }

  // If page has access token, show gate
  if (page.access_token_hash) {
    return (
      <AccessGate
        pageId={page.id}
        title={page.title}
        hint={page.access_token_hint}
        html={html || ""}
        publishedAt={page.published_at}
        version={version.version}
        siteUrl={SITE_URL}
      />
    );
  }

  const isHtml = version.content_type === "html";

  if (isHtml) {
    return (
      <div className="min-h-screen">
        <div dangerouslySetInnerHTML={{ __html: html || "" }} />
        <footer className="mt-16 border-t border-neutral-200 pt-6 pb-8 px-6">
          <p className="text-sm text-neutral-500">
            Published on{" "}
            <a href={SITE_URL} className="underline hover:text-neutral-700">
              Huozi
            </a>
          </p>
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <article className="prose-huozi prose prose-neutral dark:prose-invert">
        <div dangerouslySetInnerHTML={{ __html: html || "" }} />
        {(page.published_at || page.latest_version > 1) && (
          <div className="not-prose mt-8 flex items-center gap-3 text-sm text-muted-foreground">
            {page.published_at && (
              <time dateTime={page.published_at}>
                {new Date(page.published_at).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </time>
            )}
            {page.latest_version > 1 && (
              <span>v{version.version}</span>
            )}
          </div>
        )}
      </article>
      <footer className="prose-huozi not-prose mt-16 border-t border-border pt-6 pb-8">
        <p className="text-sm text-muted-foreground">
          Published on{" "}
          <a href={SITE_URL} className="underline hover:text-foreground">
            Huozi
          </a>
        </p>
      </footer>
    </div>
  );
}
