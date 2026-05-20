"use client";

import { useState } from "react";
import type { MailRoutingStatus } from "@/lib/drive/admin";

interface Props {
  initialStatus: MailRoutingStatus | null;
  initialError: string | null;
  isOwner: boolean;
}

function statusBadge(status: MailRoutingStatus | null): {
  label: string;
  tone: "ok" | "pending" | "warn" | "unknown";
} {
  if (!status) return { label: "Unknown", tone: "unknown" };
  if (!status.configured)
    return { label: "Not configured", tone: "warn" };
  if (status.status?.startsWith("api_error"))
    return { label: "API error", tone: "warn" };
  if (!status.enabled) return { label: "Disabled", tone: "warn" };
  if (status.pending_dns) return { label: "DNS pending", tone: "pending" };
  if (!status.catch_all_correct)
    return { label: "Catch-all not wired", tone: "pending" };
  return { label: "Live", tone: "ok" };
}

const TONE_CLASSES: Record<"ok" | "pending" | "warn" | "unknown", string> = {
  ok: "bg-emerald-600 text-white border-emerald-700",
  pending: "bg-amber-500 text-white border-amber-600",
  warn: "bg-rose-600 text-white border-rose-700",
  unknown: "bg-muted text-foreground border-border",
};

export function MailSetupClient({
  initialStatus,
  initialError,
  isOwner,
}: Props) {
  const [status, setStatus] = useState<MailRoutingStatus | null>(initialStatus);
  const [error, setError] = useState<string | null>(initialError);
  const [pending, setPending] = useState(false);
  const [lastActions, setLastActions] = useState<string[]>([]);

  const badge = statusBadge(status);

  async function runSetup() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/app/mail/setup", { method: "POST" });
      const body = (await res.json().catch(() => null)) as
        | {
            ok: true;
            status: MailRoutingStatus;
            actions_taken: string[];
          }
        | {
            ok: false;
            status?: MailRoutingStatus;
            actions_taken?: string[];
            error?: string;
            message?: string;
          }
        | null;
      if (!body) {
        setError(`http_${res.status}`);
      } else if ("ok" in body && body.ok) {
        setStatus(body.status);
        setLastActions(body.actions_taken);
      } else {
        setError(body.error ?? body.message ?? `http_${res.status}`);
        if (body.status) setStatus(body.status);
        if (body.actions_taken) setLastActions(body.actions_taken);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded border border-border/60 bg-card px-4 py-4 mb-6">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Cloudflare Email Routing
        </div>
        <span
          className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${TONE_CLASSES[badge.tone]}`}
        >
          {badge.label}
        </span>
      </div>

      {status && status.configured ? (
        <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground mb-3">
          <dt>Zone status</dt>
          <dd className="font-mono text-foreground/80">
            {status.status ?? "?"}
          </dd>
          <dt>Catch-all</dt>
          <dd className="font-mono text-foreground/80">
            {status.catch_all_target
              ? status.catch_all_target +
                (status.catch_all_correct ? " ✓" : " ✗")
              : "(none)"}
          </dd>
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground mb-3">
          The deployer hasn&rsquo;t wired this Worker to a Cloudflare API
          token yet. Set <code className="font-mono">CF_API_TOKEN</code> +{" "}
          <code className="font-mono">CF_MAIL_ZONE_ID</code> on the
          huozi-cloud Worker, then redeploy.
        </p>
      )}

      {isOwner && status?.configured && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={runSetup}
            disabled={pending}
            className="rounded border border-border/60 px-3 py-1.5 text-sm hover:bg-muted/50 disabled:opacity-50"
          >
            {pending
              ? "Running…"
              : status.enabled && status.catch_all_correct
                ? "Re-run setup"
                : "Enable forwarding"}
          </button>
          {lastActions.length > 0 && (
            <span className="text-xs text-muted-foreground">
              Last run: {lastActions.join(", ")}
            </span>
          )}
        </div>
      )}

      {!isOwner && (
        <p className="text-xs text-muted-foreground">
          Only the workspace owner can change routing settings.
        </p>
      )}

      {error && (
        <div className="mt-3 rounded border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-950/30 dark:border-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}
    </section>
  );
}
