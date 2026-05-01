"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "@/lib/i18n/context";
import { useConfirm } from "@/components/confirm-provider";

export function RevokeShareButton({
  slug,
  path,
}: {
  slug: string;
  path: string;
}) {
  const t = useT();
  const router = useRouter();
  const ask = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle() {
    const ok = await ask({
      title: t("confirm.revokeShare.title"),
      body: t("confirm.revokeShare.body").replace("{path}", path),
      actionLabel: t("confirm.revokeShare.action"),
      cancelLabel: t("confirm.cancel"),
      tone: "danger",
    });
    if (!ok) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/app/shares/${encodeURIComponent(slug)}`,
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
        className="huozi-button-danger text-xs rounded border border-destructive/40 text-destructive px-2 py-1 hover:bg-destructive/5 disabled:opacity-50"
      >
        {busy ? "Revoking…" : "Revoke"}
      </button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
