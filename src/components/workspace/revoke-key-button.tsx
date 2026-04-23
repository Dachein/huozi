"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "@/lib/i18n/context";

interface Props {
  keyId: string;
  label: string;
}

export function RevokeKeyButton({ keyId, label }: Props) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRevoke() {
    const prompt = t("ws.action.confirmRevoke").replace("{label}", label);
    const ok = window.confirm(prompt);
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
        className="text-xs rounded border border-red-500/50 text-red-500 px-2 py-1 hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {busy ? t("ws.action.revoking") : t("ws.action.revoke")}
      </button>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </span>
  );
}
