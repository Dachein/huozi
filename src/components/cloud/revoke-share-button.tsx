"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RevokeShareButton({
  slug,
  path,
}: {
  slug: string;
  path: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle() {
    const ok = window.confirm(
      `Revoke the share for "${path}"?\n\nThe URL will stop working immediately. Viewers who saved the link get 404.`,
    );
    if (!ok) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/cloud/shares/${encodeURIComponent(slug)}`,
        { method: "DELETE" },
      );
      const body = (await res.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok || !body.ok) {
        setError(body.message || body.error || `HTTP ${res.status}`);
        setBusy(false);
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={handle}
        disabled={busy}
        className="text-xs rounded border border-red-500/40 text-red-500 px-2 py-1 hover:bg-red-500/5 disabled:opacity-50"
      >
        {busy ? "Revoking…" : "Revoke"}
      </button>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </span>
  );
}
