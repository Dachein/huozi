"use client";

import { useState } from "react";
import { useConfirm } from "@/components/confirm-provider";

interface Props {
  initialAddress: string;
  initialCreatedAt: number;
  initialLastUsedAt: number | null;
  initialAllowedSenders: string[] | null;
}

function relativeTime(ms: number | null): string {
  if (!ms) return "never";
  const diff = Date.now() - ms;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

// Lowercase domain. We trust the server to validate further (the PATCH
// route runs the same regex and is the authoritative gate).
const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

export function TasksEmailClient({
  initialAddress,
  initialCreatedAt,
  initialLastUsedAt,
  initialAllowedSenders,
}: Props) {
  const ask = useConfirm();

  const [address, setAddress] = useState(initialAddress);
  const [createdAt, setCreatedAt] = useState(initialCreatedAt);
  const [lastUsedAt, setLastUsedAt] = useState<number | null>(initialLastUsedAt);
  const [allowedSenders, setAllowedSenders] = useState<string[] | null>(
    initialAllowedSenders,
  );
  const [pending, setPending] = useState<"rotate" | "allowlist" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [newDomain, setNewDomain] = useState("");

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Some browsers block clipboard without a user gesture in iframes;
      // ignore. The address is selectable from the input anyway.
    }
  }

  async function rotate() {
    const confirmed = await ask({
      title: "Rotate your magic address?",
      body: "Mail sent to the current address will start bouncing once you rotate. Update your forwarding rules with the new address first.",
      actionLabel: "Rotate",
      cancelLabel: "Cancel",
      tone: "danger",
    });
    if (!confirmed) return;
    setPending("rotate");
    setError(null);
    try {
      const res = await fetch("/api/app/tasks/email-token", { method: "POST" });
      const body = (await res.json()) as
        | {
            ok: true;
            address: string;
            created_at: number;
            last_used_at: number | null;
            allowed_senders: string[] | null;
          }
        | { ok: false; error: string; message?: string };
      if (!res.ok || !("ok" in body) || !body.ok) {
        setError(
          ("message" in body && body.message) || ("error" in body && body.error) || "Failed.",
        );
        setPending(null);
        return;
      }
      setAddress(body.address);
      setCreatedAt(body.created_at);
      setLastUsedAt(body.last_used_at);
      setAllowedSenders(body.allowed_senders);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setPending(null);
    }
  }

  async function updateAllowedSenders(next: string[] | null) {
    setPending("allowlist");
    setError(null);
    try {
      const res = await fetch("/api/app/tasks/email-token", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ allowed_senders: next }),
      });
      const body = (await res.json()) as
        | { ok: true; allowed_senders: string[] | null }
        | { ok: false; error?: string; message?: string };
      if (!res.ok || !("ok" in body) || !body.ok) {
        setError(
          ("message" in body && body.message) || ("error" in body && body.error) || "Failed.",
        );
        setPending(null);
        return;
      }
      setAllowedSenders(body.allowed_senders);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setPending(null);
    }
  }

  function addDomain() {
    const d = newDomain.trim().toLowerCase();
    if (!DOMAIN_RE.test(d)) {
      setError(`"${d}" doesn't look like a domain.`);
      return;
    }
    const current = allowedSenders ?? [];
    if (current.includes(d)) {
      setNewDomain("");
      return;
    }
    updateAllowedSenders([...current, d]);
    setNewDomain("");
  }

  function removeDomain(d: string) {
    const current = allowedSenders ?? [];
    const next = current.filter((x) => x !== d);
    updateAllowedSenders(next.length > 0 ? next : null);
  }

  function disableAllowlist() {
    if (!allowedSenders || allowedSenders.length === 0) return;
    updateAllowedSenders(null);
  }

  return (
    <div className="space-y-8">
      {/* ── Address card ────────────────────────────────────────── */}
      <section className="rounded border border-border/60 bg-card px-4 py-4">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
          Your forwarding address
        </div>
        <div className="flex items-center gap-2 mb-3">
          <input
            type="text"
            readOnly
            value={address}
            onFocus={(e) => e.currentTarget.select()}
            className="flex-1 rounded border border-border/60 bg-muted/30 px-3 py-2 font-mono text-sm text-foreground"
          />
          <button
            type="button"
            onClick={copy}
            className="rounded border border-border/60 px-3 py-2 text-sm hover:bg-muted/50"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <div>
            Issued {relativeTime(createdAt)} · last used {relativeTime(lastUsedAt)}
          </div>
          <button
            type="button"
            onClick={rotate}
            disabled={pending !== null}
            className="rounded border border-rose-400 px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:text-rose-300 dark:hover:bg-rose-950/30"
          >
            {pending === "rotate" ? "Rotating…" : "Rotate"}
          </button>
        </div>
      </section>

      {/* ── Allowlist ───────────────────────────────────────────── */}
      <section className="rounded border border-border/60 bg-card px-4 py-4">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
          Sender allowlist
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          {allowedSenders && allowedSenders.length > 0
            ? "Only mail from these domains is accepted. Mail from any other sender is dropped."
            : "Mail from any sender is accepted. Add a domain below to restrict."}
        </p>

        {allowedSenders && allowedSenders.length > 0 && (
          <ul className="flex flex-wrap gap-1.5 mb-3">
            {allowedSenders.map((d) => (
              <li
                key={d}
                className="flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2.5 py-0.5 text-xs font-mono"
              >
                <span>{d}</span>
                <button
                  type="button"
                  onClick={() => removeDomain(d)}
                  disabled={pending !== null}
                  aria-label={`Remove ${d}`}
                  className="text-muted-foreground hover:text-rose-700 disabled:opacity-50"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            placeholder="example.com"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addDomain();
              }
            }}
            className="flex-1 rounded border border-border/60 bg-background px-3 py-1.5 font-mono text-sm"
            disabled={pending !== null}
          />
          <button
            type="button"
            onClick={addDomain}
            disabled={pending !== null || newDomain.trim().length === 0}
            className="rounded border border-border/60 px-3 py-1.5 text-sm hover:bg-muted/50 disabled:opacity-50"
          >
            Add
          </button>
        </div>

        {allowedSenders && allowedSenders.length > 0 && (
          <div className="mt-3 text-right">
            <button
              type="button"
              onClick={disableAllowlist}
              disabled={pending !== null}
              className="text-xs text-muted-foreground underline hover:text-foreground disabled:opacity-50"
            >
              Accept any sender (remove allowlist)
            </button>
          </div>
        )}
      </section>

      {error && (
        <div className="rounded border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/30 dark:border-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      {/* ── Forwarding setup hints ──────────────────────────────── */}
      <ForwardingSetupSteps />
    </div>
  );
}

// ── Forwarding setup walkthrough ─────────────────────────────────────

type Provider = "gmail" | "outlook" | "icloud";

interface ProviderGuide {
  id: Provider;
  label: string;
  steps: string[];
}

const PROVIDER_GUIDES: ProviderGuide[] = [
  {
    id: "gmail",
    label: "Gmail",
    steps: [
      "Open Gmail → Settings (gear icon) → See all settings → Forwarding and POP/IMAP.",
      "Click Add a forwarding address → paste your magic address above → Next.",
      "Gmail sends a verification mail to the magic address. It will land as a Task in this workspace — open it and click the confirmation link.",
      'Back in Gmail, choose "Forward a copy" for all mail, or create a filter (Settings → Filters and Blocked Addresses → Create a new filter → Forward it to) to forward only the mail you want huozi to handle.',
    ],
  },
  {
    id: "outlook",
    label: "Outlook 365",
    steps: [
      "Open Outlook on the web → Settings (gear) → Mail → Rules.",
      'Click Add new rule. Name it (e.g. "Forward to huozi").',
      'Add a condition (or "Apply to all messages") → Add an action → "Forward to" → paste the magic address → Save.',
      "Outlook may send a verification mail to the address. It will land as a Task here — open it and confirm if required.",
    ],
  },
  {
    id: "icloud",
    label: "Apple Mail / iCloud",
    steps: [
      "Sign in at iCloud.com → Mail → Settings (gear) → Preferences → General.",
      "Enable Forwarding → paste the magic address → Done.",
      "iCloud sends a verification mail to the address. It will land as a Task in this workspace — open it and confirm.",
      'Optionally enable "Delete messages after forwarding" if you want iCloud to skip storing them locally.',
    ],
  },
];

function ForwardingSetupSteps() {
  const [active, setActive] = useState<Provider>("gmail");
  const guide = PROVIDER_GUIDES.find((p) => p.id === active)!;

  return (
    <section className="rounded border border-border/40 bg-muted/20 px-4 py-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3">
        Set up forwarding
      </div>

      {/* Provider tabs */}
      <div
        role="tablist"
        aria-label="Mail provider"
        className="flex gap-1 mb-4 border-b border-border/40"
      >
        {PROVIDER_GUIDES.map((p) => {
          const isActive = p.id === active;
          return (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(p.id)}
              className={
                "px-3 py-1.5 text-sm -mb-px border-b-2 transition-colors " +
                (isActive
                  ? "border-foreground text-foreground font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground")
              }
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Steps */}
      <ol className="space-y-3">
        {guide.steps.map((text, i) => (
          <li key={i} className="flex gap-3">
            <span
              aria-hidden="true"
              className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full bg-foreground/10 text-foreground text-xs font-semibold font-mono"
            >
              {i + 1}
            </span>
            <p className="text-sm text-foreground/90 leading-relaxed pt-0.5">
              {text}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
