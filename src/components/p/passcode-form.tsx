"use client";

/**
 * Passcode unlock form for `/p/<slug>` when the share is 6-digit gated.
 * On success, reloads the server component with the unlocked content
 * surfaced via router.refresh() — the server `page.tsx` re-fetches and
 * renders the markdown/html.
 *
 * We keep the unlock state client-side only: no cookie, no persistence.
 * Refreshing the page brings back the passcode form. This matches the
 * "memorable share, no account" model — the viewer needs the code each
 * session.
 */

import { useState } from "react";
import type { ShareContent } from "@/lib/drive/shares";

interface PasscodeFormProps {
  slug: string;
  /** Called with the unlocked payload so the parent can render content. */
  onUnlocked: (content: ShareContent) => void;
}

export function PasscodeForm({ slug, onUnlocked }: PasscodeFormProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      setError("Passcode is 6 digits.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/p/${encodeURIComponent(slug)}/unlock`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passcode: code }),
      });
      const body = (await res.json()) as
        | ({ ok: true } & ShareContent)
        | { ok?: false; error?: string; message?: string };
      if (!res.ok || !("ok" in body) || !body.ok) {
        if (res.status === 403) {
          setError("Wrong passcode. Try again.");
        } else {
          setError(
            (body as { message?: string; error?: string }).message ||
              (body as { error?: string }).error ||
              `Error ${res.status}`,
          );
        }
        setSubmitting(false);
        return;
      }
      onUnlocked(body as ShareContent);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-sm rounded-lg border border-border bg-background p-6 space-y-4"
    >
      <div>
        <label htmlFor="passcode" className="block text-sm font-medium mb-2">
          Enter passcode
        </label>
        <input
          id="passcode"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          pattern="\d{6}"
          maxLength={6}
          value={code}
          onChange={(e) =>
            setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
          }
          placeholder="• • • • • •"
          className="w-full rounded-md border border-border bg-muted px-3 py-3 text-center text-2xl font-mono tracking-[0.4em] focus:outline-none focus:border-foreground/40"
        />
        <p className="mt-2 text-xs text-muted-foreground">
          This page is protected. Ask the person who shared it for the 6-digit
          passcode.
        </p>
      </div>
      {error && (
        <div className="text-xs text-red-500">{error}</div>
      )}
      <button
        type="submit"
        disabled={code.length !== 6 || submitting}
        className="w-full rounded-md bg-foreground px-4 py-2.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {submitting ? "Unlocking…" : "Unlock"}
      </button>
    </form>
  );
}
