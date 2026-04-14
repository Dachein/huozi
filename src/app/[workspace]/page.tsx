import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { SITE_URL } from "@/lib/constants";

interface PageProps {
  params: Promise<{ workspace: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { workspace } = await params;
  const supabase = createAdminClient();

  const { data: ws } = await supabase
    .from("workspaces")
    .select("name, slug")
    .eq("slug", workspace)
    .single();

  if (!ws) return {};

  const name = ws.name || ws.slug;
  const desc = `Pages published by ${name} on Huozi`;
  return {
    title: name,
    description: desc,
    openGraph: {
      title: name,
      description: desc,
      url: `${SITE_URL}/${ws.slug}`,
      type: "profile",
      siteName: "活字 Huozi",
    },
    twitter: {
      card: "summary_large_image",
      title: name,
      description: desc,
    },
  };
}

export default async function WorkspacePage({ params }: PageProps) {
  const { workspace } = await params;
  const supabase = createAdminClient();

  const { data: ws } = await supabase
    .from("workspaces")
    .select("id, name, slug")
    .eq("slug", workspace)
    .single();

  if (!ws) notFound();

  const { data: pages } = await supabase
    .from("pages")
    .select("slug, title, description, published_at")
    .eq("workspace_id", ws.id)
    .eq("is_published", true)
    .order("published_at", { ascending: false });

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[680px] px-4 py-16">
        <h1 className="text-2xl font-bold">{ws.name || ws.slug}</h1>

        {pages && pages.length > 0 ? (
          <ul className="mt-8 space-y-4">
            {pages.map((page) => (
              <li key={page.slug}>
                <Link
                  href={`${SITE_URL}/${ws.slug}/${page.slug}`}
                  className="group block"
                >
                  <h2 className="font-medium group-hover:underline">
                    {page.title}
                  </h2>
                  {page.description && (
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {page.description}
                    </p>
                  )}
                  {page.published_at && (
                    <time className="text-xs text-muted-foreground">
                      {new Date(page.published_at).toLocaleDateString()}
                    </time>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-8 text-muted-foreground">No pages published yet.</p>
        )}
      </div>
    </div>
  );
}
