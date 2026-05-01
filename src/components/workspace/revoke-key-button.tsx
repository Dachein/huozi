"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "@/lib/i18n/context";
import { useConfirm } from "@/components/confirm-provider";

interface Props {
  keyId: string;
  label: string;
}

export function RevokeKeyButton({ keyId, label }: Props) {
  const t = useT();
  const router = useRouter();
  const ask = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRevoke() {
    const ok = await ask({
      title: t("confirm.revokeKey.title"),
      body: t("confirm.revokeKey.body").replace("{label}", label),
      warning: t("confirm.revokeKey.warning"),
      actionLabel: t("confirm.revokeKey.action"),
      cancelLabel: t("confirm.cancel"),
      tone: "danger",
    });
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
        className="huozi-button-danger text-xs rounded border border-destructive/50 text-destructive px-2 py-1 hover:bg-destructive/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {busy ? t("ws.action.revoking") : t("ws.action.revoke")}
      </button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
