"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface OnboardFormProps {
  suggestedSlug: string;
}

export function OnboardForm({ suggestedSlug }: OnboardFormProps) {
  const router = useRouter();
  const [slug, setSlug] = useState(suggestedSlug);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slugOk = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(slug);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!slugOk || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/app/workspaces", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, name: slug }),
      });
      const body = (await res.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
      };
      if (!res.ok || !body.ok) {
        setError(body.message || body.error || `HTTP ${res.status}`);
        setSubmitting(false);
        return;
      }
      // Cookie is set server-side; go directly to the workspace.
      router.push("/workspace");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="slug" className="block text-sm font-medium mb-2">
          Workspace name
        </label>
        <div className="flex items-stretch rounded-lg border border-border bg-muted overflow-hidden">
          <span className="px-3 py-2 text-sm text-muted-foreground font-mono border-r border-border bg-muted">
            huozi.app/
          </span>
          <input
            id="slug"
            type="text"
            value={slug}
            onChange={(e) =>
              setSlug(
                e.target.value
                  .toLowerCase()
                  .replace(/[^a-z0-9-]/g, "-")
                  .slice(0, 64),
              )
            }
            placeholder="my-research"
            autoFocus
            className="flex-1 px-3 py-2 text-sm font-mono bg-background focus:outline-none"
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {slugOk ? (
            <>
              ✓ Available:{" "}
              <code className="rounded bg-muted px-1 font-mono">
                ws_{slug}
              </code>{" "}
              on cloud.huozi.app
            </>
          ) : (
            <>
              Use 3–64 lowercase letters, digits, or hyphens. Cannot start or
              end with a hyphen.
            </>
          )}
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/5 px-4 py-2 text-sm">
          <strong>Couldn&rsquo;t create workspace:</strong>{" "}
          <span className="text-muted-foreground">{error}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={!slugOk || submitting}
        className="w-full rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
      >
        {submitting ? "Creating..." : "Create workspace"}
      </button>
    </form>
  );
}
