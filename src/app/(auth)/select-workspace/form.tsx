"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface WorkspaceOption {
  id: string;
  slug: string;
  name: string;
}

export function SelectWorkspaceForm({
  workspaces,
}: {
  workspaces: WorkspaceOption[];
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string>("");
  const router = useRouter();

  async function pick(ws: WorkspaceOption) {
    setError("");
    setPending(ws.id);
    const res = await fetch("/api/auth/select-workspace", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspace_id: ws.id }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      setError(body.error ?? "select_failed");
      setPending(null);
      return;
    }
    router.push("/workspace");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {error && (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
        >
          {error}
        </div>
      )}
      {workspaces.map((ws) => (
        <button
          key={ws.id}
          type="button"
          onClick={() => pick(ws)}
          disabled={pending !== null}
          className="w-full text-left rounded-lg border border-border bg-background px-4 py-3 hover:bg-muted/40 transition-colors flex items-center justify-between disabled:opacity-50"
        >
          <span>
            <span className="block font-medium">{ws.name}</span>
            <span className="block text-xs text-muted-foreground font-mono">
              huozi.app/{ws.slug}
            </span>
          </span>
          <span className="text-xs text-muted-foreground">
            {pending === ws.id ? "…" : "→"}
          </span>
        </button>
      ))}
    </div>
  );
}
