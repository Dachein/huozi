"use client";

import { createClient } from "@/lib/supabase/client";
import { RESERVED_SLUGS, WORKSPACE_SLUG_REGEX } from "@/lib/constants";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "@/lib/i18n/context";

export function SetupWorkspace() {
  const [slug, setSlug] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const _ = useT();

  function handleSlugChange(value: string) {
    setSlug(value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!WORKSPACE_SLUG_REGEX.test(slug)) {
      setError(
        "Slug must be 1-40 characters, lowercase letters, numbers, and hyphens only."
      );
      return;
    }

    if (RESERVED_SLUGS.includes(slug)) {
      setError("This slug is reserved. Please choose another.");
      return;
    }

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

    const { error: insertError } = await supabase.from("workspaces").insert({
      owner_id: user.id,
      slug,
      name: slug,
    });

    if (insertError) {
      if (insertError.code === "23505") {
        setError("This slug is already taken.");
      } else {
        setError(insertError.message);
      }
      setLoading(false);
      return;
    }

    router.refresh();
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-full max-w-md space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{_("workspace.setup.title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {_("workspace.setup.desc")}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="slug" className="block text-sm font-medium mb-1">
              {_("workspace.setup.label")}
            </label>
            <div className="flex items-center gap-0">
              <span className="rounded-l-md border border-r-0 border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                huozi.app/
              </span>
              <input
                id="slug"
                type="text"
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                placeholder={_("workspace.setup.placeholder")}
                required
                maxLength={40}
                className="flex-1 rounded-r-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !slug}
            className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {loading ? _("workspace.setup.loading") : _("workspace.setup.submit")}
          </button>
        </form>
      </div>
    </div>
  );
}
