"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

interface Props {
  folder: string;
}

export function EnableTasksButton({ folder }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onClick = useCallback(async () => {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/app/project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "enable_tasks", folder_path: folder }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { message?: string }
          | null;
        setError(body?.message ?? `Request failed (${res.status})`);
        setPending(false);
        return;
      }
      router.refresh();
      setPending(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPending(false);
    }
  }, [folder, router]);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="inline-flex w-fit items-center rounded border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pending ? "Enabling…" : "Enable Tasks"}
      </button>
      {error && (
        <div className="rounded border border-border bg-muted px-2 py-1 text-[11px] text-foreground/80">
          {error}
        </div>
      )}
    </div>
  );
}
