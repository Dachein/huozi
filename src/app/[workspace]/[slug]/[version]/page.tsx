import { createAdminClient } from "@/lib/supabase/admin";
import { renderMarkdown } from "@/lib/markdown/renderer";
import { processHtmlDirect } from "@/lib/html/sanitizer";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SITE_URL } from "@/lib/constants";
import { AccessGate } from "@/components/access-gate";
import Link from "next/link";

interface PageProps {
  params: Promise<{ workspace: string; slug: string; version: string }>;
}

function parseVersion(v: string): number | null {
  const match = v.match(/^v(\d+)$/);
  return match ? parseInt(match[1]) : null;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { workspace, slug, version: vStr } = await params;
  const vNum = parseVersion(vStr);
  if (!vNum) return {};

  const supabase = createAdminClient();

  const { data: ws } = await supabase
    .from("workspaces")
    .select("id")
    .eq("slug", workspace)
    .single();

  if (!ws) return {};

  const { data: page } = await supabase
    .from("pages")
    .select("title, description")
    .eq("workspace_id", ws.id)
    .eq("slug", slug)
    .eq("is_published", true)
    .single();

  if (!page) return {};

  return {
    title: `${page.title} (v${vNum})`,
    description: page.description || `${page.title} — v${vNum}`,
  };
}

export default async function VersionPage({ params }: PageProps) {
  const { workspace, slug, version: vStr } = await params;
  const vNum = parseVersion(vStr);
  if (!vNum) notFound();

  const supabase = createAdminClient();

  const { data: ws } = await supabase
    .from("workspaces")
    .select("id")
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

  const { data: version } = await supabase
    .from("page_versions")
    .select("version, content, content_type, rendered_html, created_at")
    .eq("page_id", page.id)
    .eq("version", vNum)
    .single();

  if (!version) {
    // Page exists but version doesn't
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="text-center max-w-md">
          <h1 className="font-serif text-6xl font-bold text-muted-foreground/30">
            v{vNum}
          </h1>
          <h2 className="mt-4 text-xl font-semibold">Version not found</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            &ldquo;{page.title}&rdquo; doesn&apos;t have a version {vNum}.
            The latest version is v{page.latest_version}.
          </p>
          <div className="mt-8 flex items-center justify-center gap-4">
            <Link
              href={`/${workspace}/${slug}`}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              View latest (v{page.latest_version})
            </Link>
          </div>
        </div>
      </div>
    );
  }

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
            {version.version !== page.latest_version && (
              <>
                <a
                  href={`${SITE_URL}/${workspace}/${slug}`}
                  className="underline hover:text-neutral-700 mr-4"
                >
                  View latest (v{page.latest_version})
                </a>
              </>
            )}
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
        <div className="not-prose mt-8 flex items-center gap-3 text-sm text-muted-foreground">
          {version.created_at && (
            <time dateTime={version.created_at}>
              {new Date(version.created_at).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </time>
          )}
          <span>v{version.version}</span>
          {version.version !== page.latest_version && (
            <a
              href={`/${workspace}/${slug}`}
              className="underline hover:text-foreground"
            >
              View latest (v{page.latest_version})
            </a>
          )}
        </div>
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
