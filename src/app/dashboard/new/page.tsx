"use client";

import { createClient } from "@/lib/supabase/client";
import { slugify } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "@/lib/i18n/context";

export default function NewPagePage() {
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const _ = useT();

  function handleTitleChange(value: string) {
    setTitle(value);
    if (!slug || slug === slugify(title)) {
      setSlug(slugify(value));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Not authenticated.");
      setLoading(false);
      return;
    }

    const { data: workspace } = await supabase
      .from("workspaces")
      .select("id")
      .eq("owner_id", user.id)
      .single();

    if (!workspace) {
      setError("No workspace found.");
      setLoading(false);
      return;
    }

    const { error: insertError } = await supabase.from("pages").insert({
      workspace_id: workspace.id,
      title,
      slug: slug || slugify(title),
      content,
      content_type: "markdown",
      is_published: true,
    });

    if (insertError) {
      if (insertError.code === "23505") {
        setError("A page with this slug already exists.");
      } else {
        setError(insertError.message);
      }
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-8">{_("dashboard.new.title")}</h1>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="title" className="block text-sm font-medium mb-1">
            {_("dashboard.new.titleLabel")}
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            required
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div>
          <label htmlFor="slug" className="block text-sm font-medium mb-1">
            {_("dashboard.new.slug")}
          </label>
          <input
            id="slug"
            type="text"
            value={slug}
            onChange={(e) =>
              setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
            }
            required
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div>
          <label htmlFor="content" className="block text-sm font-medium mb-1">
            {_("dashboard.new.content")}
          </label>
          <textarea
            id="content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required
            rows={16}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {loading ? _("dashboard.new.publishing") : _("dashboard.new.publish")}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
          >
            {_("dashboard.new.cancel")}
          </button>
        </div>
      </form>
    </div>
  );
}
