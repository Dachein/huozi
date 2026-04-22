"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Props {
  keyId: string;
  label: string;
}

export function RevokeKeyButton({ keyId, label }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRevoke() {
    const ok = window.confirm(
      `Revoke "${label}"? Agents using this key will stop working immediately. This cannot be undone.`,
    );
    if (!ok) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/app/connections/revoke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key_id: keyId }),
      });
      const body = (await res.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
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
        onClick={handleRevoke}
        disabled={busy}
        className="text-xs rounded border border-red-500/40 text-red-500 px-2 py-1 hover:bg-red-500/5 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {busy ? "Revoking..." : "Revoke"}
      </button>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </span>
  );
}
