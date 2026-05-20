"use client";

import { useEffect, useState } from "react";
import { useConfirm } from "@/components/confirm-provider";
import type { EmailAlias } from "@/lib/drive/admin";

interface Props {
  zoneDomain: string; // e.g. "mail.huozi.app"
  initialAliases: EmailAlias[];
  initialError: string | null;
  defaultPrefix: string; // workspace slug, used as the initial input value
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

interface ProviderStep {
  text: string;
  /** Deep-link that jumps straight to the relevant settings screen. */
  link?: { href: string; label: string };
}

const PROVIDER_GUIDES: Array<{
  id: "gmail" | "outlook" | "icloud";
  label: string;
  steps: ProviderStep[];
}> = [
  {
    id: "gmail",
    label: "Gmail",
    steps: [
      {
        text: "Open Gmail's Forwarding and POP/IMAP settings.",
        link: {
          href: "https://mail.google.com/mail/u/0/#settings/fwdandpop",
          label: "Open Gmail forwarding settings",
        },
      },
      {
        text: 'Click "Add a forwarding address" → paste your huozi address → Next.',
      },
      {
        text: "Gmail sends a verification mail to the address. It will land as a Task in this workspace — open it and click the confirmation link.",
      },
      {
        text: 'Back in Gmail, choose "Forward a copy" for all mail, or create a filter to forward only the mail you want huozi to handle.',
        link: {
          href: "https://mail.google.com/mail/u/0/#settings/filters",
          label: "Open Gmail filters",
        },
      },
    ],
  },
  {
    id: "outlook",
    label: "Outlook 365",
    steps: [
      {
        text: "Open Outlook on the web → Mail → Rules.",
        link: {
          href: "https://outlook.office.com/mail/options/mail/rules",
          label: "Open Outlook rules",
        },
      },
      {
        text: 'Click "Add new rule". Name it (e.g. "Forward to huozi").',
      },
      {
        text: 'Add a condition (or "Apply to all messages") → Add an action → "Forward to" → paste the huozi address → Save.',
      },
      {
        text: "Outlook may send a verification mail. It will land as a Task here — open it and confirm if required.",
      },
    ],
  },
  {
    id: "icloud",
    label: "Apple Mail / iCloud",
    steps: [
      {
        text: "Sign in to iCloud Mail → Settings (gear) → Preferences → General.",
        link: {
          href: "https://www.icloud.com/mail/",
          label: "Open iCloud Mail",
        },
      },
      {
        text: "Enable Forwarding → paste the huozi address → Done.",
      },
      {
        text: "iCloud sends a verification mail to the address. It will land as a Task in this workspace — open it and confirm.",
      },
      {
        text: 'Optionally enable "Delete messages after forwarding" if you want iCloud to skip storing them locally.',
      },
    ],
  },
];

const PREFIX_HINT_RE = /^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])?$/;

type Availability =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "available" }
  | { state: "taken"; reason: "taken" | "reserved" }
  | { state: "invalid" }
  | { state: "error"; message: string };

export function MailAliasesClient({
  zoneDomain,
  initialAliases,
  initialError,
  defaultPrefix,
}: Props) {
  const ask = useConfirm();

  const [aliases, setAliases] = useState<EmailAlias[]>(initialAliases);
  const [error, setError] = useState<string | null>(initialError);
  const [pending, setPending] = useState<string | null>(null); // local_part of in-flight op
  // Prefill with workspace slug; sanitize against the input regex so a
  // weird-slug workspace still produces a typable prefix.
  const sanitizedDefault = defaultPrefix.toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/^-+|-+$/g, "");
  const [newPrefix, setNewPrefix] = useState(sanitizedDefault);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Availability>({ state: "idle" });
  const [copied, setCopied] = useState<string | null>(null);
  const [activeProvider, setActiveProvider] =
    useState<(typeof PROVIDER_GUIDES)[number]["id"]>("gmail");

  // Re-fetch when window regains focus (in case the user did something
  // in another tab — common during email setup).
  useEffect(() => {
    function onFocus() {
      void refresh();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced availability check as the user types. Skip if input is
  // empty or fails client-side validation — the server check is the
  // authoritative second pass, but we save it the round-trip when we
  // already know the answer.
  useEffect(() => {
    const local = newPrefix.trim().toLowerCase();
    if (!local) {
      setAvailability({ state: "idle" });
      return;
    }
    if (local.startsWith("t-")) {
      setAvailability({ state: "taken", reason: "reserved" });
      return;
    }
    if (!PREFIX_HINT_RE.test(local)) {
      setAvailability({ state: "invalid" });
      return;
    }
    setAvailability({ state: "checking" });
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/app/mail/aliases/check?prefix=${encodeURIComponent(local)}`,
          { signal: controller.signal },
        );
        const body = (await res.json().catch(() => null)) as
          | { ok: true; taken: boolean; reason?: "invalid" | "reserved" | "taken" }
          | { error?: string }
          | null;
        if (!body) {
          setAvailability({ state: "error", message: `http_${res.status}` });
          return;
        }
        if ("ok" in body && body.ok) {
          if (body.reason === "invalid") setAvailability({ state: "invalid" });
          else if (body.taken)
            setAvailability({
              state: "taken",
              reason: body.reason === "reserved" ? "reserved" : "taken",
            });
          else setAvailability({ state: "available" });
        } else {
          setAvailability({
            state: "error",
            message: "error" in body ? body.error ?? "unknown" : "unknown",
          });
        }
      } catch (e) {
        if ((e as { name?: string }).name === "AbortError") return;
        setAvailability({
          state: "error",
          message: e instanceof Error ? e.message : "network",
        });
      }
    }, 350);
    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [newPrefix]);

  async function refresh() {
    try {
      const res = await fetch("/api/app/mail/aliases", { method: "GET" });
      const body = (await res.json().catch(() => null)) as
        | { ok: true; aliases: EmailAlias[] }
        | { error?: string; message?: string }
        | null;
      if (body && "ok" in body && body.ok) {
        setAliases(body.aliases);
        setError(null);
      } else if (body && "error" in body) {
        setError(body.message ?? body.error ?? "load_failed");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    }
  }

  async function claim() {
    const local = newPrefix.trim().toLowerCase();
    setClaimError(null);
    if (!PREFIX_HINT_RE.test(local)) {
      setClaimError(
        "Use 2-30 lowercase letters / digits. Hyphens allowed in the middle, not at edges.",
      );
      return;
    }
    if (local.startsWith("t-")) {
      setClaimError("`t-…` is reserved for system magic addresses.");
      return;
    }
    setPending("__claim__");
    try {
      const res = await fetch("/api/app/mail/aliases", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ local_part: local }),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok: true; alias: EmailAlias }
        | { error?: string; message?: string }
        | null;
      if (res.ok && body && "ok" in body && body.ok) {
        setAliases((prev) => [body.alias, ...prev]);
        setNewPrefix("");
      } else {
        const errMsg =
          body && "error" in body
            ? body.message ?? body.error ?? "claim_failed"
            : "claim_failed";
        // Surface "taken" specifically — that's the most likely friction.
        if (errMsg === "taken") {
          setClaimError(`"${local}@${zoneDomain}" is already taken.`);
        } else {
          setClaimError(errMsg);
        }
      }
    } catch (e) {
      setClaimError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setPending(null);
    }
  }

  async function toggle(alias: EmailAlias) {
    setPending(alias.local_part);
    setError(null);
    try {
      const res = await fetch("/api/app/mail/aliases", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          local_part: alias.local_part,
          active: !alias.active,
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok: true; active: boolean }
        | { error?: string }
        | null;
      if (res.ok && body && "ok" in body && body.ok) {
        setAliases((prev) =>
          prev.map((a) =>
            a.local_part === alias.local_part ? { ...a, active: body.active } : a,
          ),
        );
      } else {
        setError(
          (body && "error" in body && body.error) || "toggle_failed",
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setPending(null);
    }
  }

  async function release(alias: EmailAlias) {
    const confirmed = await ask({
      title: `Release ${alias.local_part}@${zoneDomain}?`,
      body: "The prefix becomes free for anyone to claim. Mail sent to it after release will be dropped silently until someone claims it again.",
      actionLabel: "Release",
      cancelLabel: "Cancel",
      tone: "danger",
    });
    if (!confirmed) return;
    setPending(alias.local_part);
    setError(null);
    try {
      const res = await fetch("/api/app/mail/aliases", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ local_part: alias.local_part }),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok: true }
        | { error?: string }
        | null;
      if (res.ok && body && "ok" in body && body.ok) {
        setAliases((prev) => prev.filter((a) => a.local_part !== alias.local_part));
      } else {
        setError(
          (body && "error" in body && body.error) || "release_failed",
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setPending(null);
    }
  }

  async function copy(addr: string) {
    try {
      await navigator.clipboard.writeText(addr);
      setCopied(addr);
      setTimeout(() => setCopied((c) => (c === addr ? null : c)), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-8">
      {/* ── Claim new prefix ─────────────────────────────────────── */}
      <section className="rounded border border-border/60 bg-card px-4 py-4">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
          Claim an address
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          Pick a prefix — anything you want, as long as it&rsquo;s not taken.
          Mail sent to that address lands here as a task.
        </p>
        <div className="flex items-center gap-0">
          <input
            type="text"
            value={newPrefix}
            onChange={(e) => {
              setNewPrefix(e.target.value);
              setClaimError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (availability.state === "available") void claim();
              }
            }}
            placeholder="your-name"
            disabled={pending !== null}
            aria-invalid={
              availability.state === "taken" || availability.state === "invalid"
            }
            className={
              "flex-1 rounded-l border border-r-0 px-3 py-2 font-mono text-sm bg-background focus:outline-none focus:ring-1 " +
              (availability.state === "taken" || availability.state === "invalid"
                ? "border-rose-400 focus:ring-rose-400"
                : availability.state === "available"
                  ? "border-emerald-400 focus:ring-emerald-400"
                  : "border-border/60 focus:ring-foreground/40")
            }
          />
          <div className="px-3 py-2 border border-border/60 bg-muted/40 font-mono text-sm text-muted-foreground select-none">
            @{zoneDomain}
          </div>
          <button
            type="button"
            onClick={() => void claim()}
            disabled={
              pending !== null ||
              newPrefix.trim().length === 0 ||
              availability.state === "taken" ||
              availability.state === "invalid" ||
              availability.state === "checking"
            }
            className="rounded-r border border-l-0 border-border/60 bg-foreground text-background px-4 py-2 text-sm font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            {pending === "__claim__" ? "Claiming…" : "Claim"}
          </button>
        </div>
        {/* Inline availability indicator */}
        <div className="mt-2 text-xs h-4">
          {availability.state === "checking" && (
            <span className="text-muted-foreground">Checking…</span>
          )}
          {availability.state === "available" && (
            <span className="text-emerald-700">
              ✓ Available — claim {newPrefix.trim().toLowerCase()}@{zoneDomain}
            </span>
          )}
          {availability.state === "taken" && (
            <span className="text-rose-700">
              {availability.reason === "reserved"
                ? "Reserved prefix — pick something else."
                : `Already taken — try a variation.`}
            </span>
          )}
          {availability.state === "invalid" && (
            <span className="text-rose-700">
              Use 2-30 lowercase letters/digits. Hyphens allowed in the
              middle, not at the edges.
            </span>
          )}
          {availability.state === "error" && (
            <span className="text-amber-700">
              Check failed ({availability.message}). You can still try
              claiming — the server has the final say.
            </span>
          )}
        </div>
        {claimError && (
          <div className="mt-2 text-xs text-rose-700">{claimError}</div>
        )}
      </section>

      {/* ── My addresses list ────────────────────────────────────── */}
      <section className="rounded border border-border/60 bg-card px-4 py-4">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3">
          Your addresses {aliases.length > 0 && `(${aliases.length})`}
        </div>
        {aliases.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No addresses yet. Claim one above to start receiving mail.
          </p>
        ) : (
          <ul className="space-y-2">
            {aliases.map((a) => {
              const addr = `${a.local_part}@${zoneDomain}`;
              const busy = pending === a.local_part;
              return (
                <li
                  key={a.local_part}
                  className="flex items-center gap-3 rounded border border-border/40 px-3 py-2"
                >
                  <button
                    type="button"
                    onClick={() => void toggle(a)}
                    disabled={busy}
                    aria-label={a.active ? "Deactivate" : "Activate"}
                    title={a.active ? "Active — click to pause" : "Paused — click to activate"}
                    className={
                      "shrink-0 w-8 h-5 rounded-full transition-colors relative " +
                      (a.active
                        ? "bg-emerald-500"
                        : "bg-muted-foreground/30")
                    }
                  >
                    <span
                      className={
                        "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform " +
                        (a.active ? "translate-x-3.5" : "translate-x-0.5")
                      }
                    />
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-sm truncate">
                      {addr}
                      {!a.active && (
                        <span className="ml-2 text-[10px] uppercase tracking-wider text-amber-700">
                          paused
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      claimed {relativeTime(a.created_at)} · last used{" "}
                      {relativeTime(a.last_used_at)}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => void copy(addr)}
                    disabled={busy}
                    className="rounded border border-border/60 px-2.5 py-1 text-xs hover:bg-muted/50 disabled:opacity-50"
                  >
                    {copied === addr ? "Copied" : "Copy"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void release(a)}
                    disabled={busy}
                    aria-label="Release"
                    className="rounded border border-rose-300 px-2.5 py-1 text-xs text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                  >
                    Release
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {error && (
          <div className="mt-3 rounded border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {error}
          </div>
        )}
      </section>

      {/* ── Forwarding setup walkthrough ─────────────────────────── */}
      <section className="rounded border border-border/40 bg-muted/20 px-4 py-4">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3">
          Forward from your existing inbox
        </div>
        <div
          role="tablist"
          aria-label="Mail provider"
          className="flex gap-1 mb-4 border-b border-border/40"
        >
          {PROVIDER_GUIDES.map((p) => {
            const isActive = p.id === activeProvider;
            return (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveProvider(p.id)}
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
        <ol className="space-y-3">
          {(PROVIDER_GUIDES.find((p) => p.id === activeProvider)?.steps ?? []).map(
            (step, i) => (
              <li key={i} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full bg-foreground/10 text-foreground text-xs font-semibold font-mono"
                >
                  {i + 1}
                </span>
                <div className="text-sm text-foreground/90 leading-relaxed pt-0.5">
                  <p>{step.text}</p>
                  {step.link && (
                    <a
                      href={step.link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1.5 inline-flex items-center gap-1 rounded border border-border/60 px-2 py-0.5 text-xs hover:bg-muted/50 transition-colors"
                    >
                      {step.link.label}
                      <span aria-hidden="true">↗</span>
                    </a>
                  )}
                </div>
              </li>
            ),
          )}
        </ol>
      </section>
    </div>
  );
}
