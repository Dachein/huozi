"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Copy, ExternalLink, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n/context";

interface Page {
  id: string;
  slug: string;
  title: string;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export function PageList({
  pages,
  workspaceSlug,
  siteUrl,
}: {
  pages: Page[];
  workspaceSlug: string;
  siteUrl: string;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState<string | null>(null);
  const _ = useT();

  async function copyUrl(slug: string) {
    const url = `${siteUrl}/${workspaceSlug}/${slug}`;
    await navigator.clipboard.writeText(url);
    setCopied(slug);
    setTimeout(() => setCopied(null), 2000);
  }

  async function deletePage(id: string) {
    if (!confirm(_("dashboard.confirmDelete"))) return;

    const supabase = createClient();
    await supabase.from("pages").delete().eq("id", id);
    router.refresh();
  }

  if (pages.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p className="text-lg">{_("dashboard.noPages")}</p>
        <p className="mt-2 text-sm">{_("dashboard.noPagesDesc")}</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border rounded-md border border-border">
      {pages.map((page) => (
        <div
          key={page.id}
          className="flex items-center justify-between px-4 py-3"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium truncate">{page.title}</span>
              {!page.is_published && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {_("dashboard.draft")}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              /{workspaceSlug}/{page.slug}
            </p>
          </div>

          <div className="flex items-center gap-1 ml-4">
            <button
              onClick={() => copyUrl(page.slug)}
              className="rounded-md p-2 text-muted-foreground hover:text-foreground hover:bg-muted"
              title={_("dashboard.copyUrl")}
            >
              <Copy size={16} />
              {copied === page.slug && (
                <span className="absolute -mt-8 -ml-4 rounded bg-foreground px-2 py-1 text-xs text-primary-foreground">
                  Copied!
                </span>
              )}
            </button>
            {page.is_published && (
              <a
                href={`${siteUrl}/${workspaceSlug}/${page.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md p-2 text-muted-foreground hover:text-foreground hover:bg-muted"
                title={_("dashboard.openPage")}
              >
                <ExternalLink size={16} />
              </a>
            )}
            <button
              onClick={() => deletePage(page.id)}
              className="rounded-md p-2 text-muted-foreground hover:text-destructive hover:bg-muted"
              title={_("dashboard.delete")}
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
