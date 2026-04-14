"use client";

import { useState, useEffect } from "react";

const STORAGE_KEY_PREFIX = "huozi_access_";

interface AccessGateProps {
  pageId: string;
  title: string;
  hint: string | null;
  html: string;
  publishedAt: string | null;
  version: number;
  siteUrl: string;
}

export function AccessGate({
  pageId,
  title,
  hint,
  html,
  publishedAt,
  version,
  siteUrl,
}: AccessGateProps) {
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const cached = localStorage.getItem(STORAGE_KEY_PREFIX + pageId);
    if (!cached) {
      setChecking(false);
      return;
    }
    fetch("/api/v1/access/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page_id: pageId, token: cached }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.valid) {
          setUnlocked(true);
        } else {
          localStorage.removeItem(STORAGE_KEY_PREFIX + pageId);
        }
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, [pageId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/v1/access/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page_id: pageId, token }),
    });

    const data = await res.json();

    if (!res.ok || !data.valid) {
      setError("Incorrect access code.");
      setLoading(false);
      return;
    }

    localStorage.setItem(STORAGE_KEY_PREFIX + pageId, token);
    setUnlocked(true);
    setLoading(false);
  }

  if (checking) {
    return <div className="min-h-screen" />;
  }

  if (unlocked) {
    return (
      <div className="min-h-screen bg-background">
        <article className="prose-huozi prose prose-neutral dark:prose-invert">
          <header className="mb-8 not-prose">
            <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
            <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
              {publishedAt && (
                <time dateTime={publishedAt}>
                  {new Date(publishedAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </time>
              )}
              {version > 1 && <span>v{version}</span>}
            </div>
          </header>
          <div dangerouslySetInnerHTML={{ __html: html }} />
        </article>
        <footer className="prose-huozi not-prose mt-16 border-t border-border pt-6 pb-8">
          <p className="text-sm text-muted-foreground">
            Published on{" "}
            <a href={siteUrl} className="underline hover:text-foreground">
              Huozi
            </a>
          </p>
        </footer>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This page is protected. Enter the access code to view.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <input
            type="text"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={hint ? `Code ends with ...${hint}` : "Access code"}
            required
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-center font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-primary"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Verifying..." : "Unlock"}
          </button>
        </form>
      </div>
    </div>
  );
}
