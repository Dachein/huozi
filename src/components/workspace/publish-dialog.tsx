"use client";

/**
 * Two-step "Publish a snapshot" modal, triggered from the file view menu:
 *
 *   Step 1 — choose passcode:   ( ) Public   (•) 6-digit passcode [______]
 *   Step 2 — success:           https://huozi.app/p/abc123xyz    [Copy]
 *                               passcode: 424242                   (if set)
 *
 * v1 keeps it deliberately small — no expiry picker, no rename, no list
 * (that's on the Shares page).
 */

import { useEffect, useRef, useState } from "react";

export interface PublishDialogProps {
  path: string;
  open: boolean;
  onClose: () => void;
}

type Step = "choose" | "done";

interface MintedShare {
  slug: string;
  has_passcode: boolean;
  passcode?: string;
}

function randomPasscode(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0]! % 1_000_000).padStart(6, "0");
}

export function PublishDialog({ path, open, onClose }: PublishDialogProps) {
  const [step, setStep] = useState<Step>("choose");
  const [protect, setProtect] = useState(false);
  const [passcode, setPasscode] = useState(() => randomPasscode());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minted, setMinted] = useState<MintedShare | null>(null);
  const [copied, setCopied] = useState<"url" | "code" | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Reset whenever reopened so back-to-back publishes start clean.
  useEffect(() => {
    if (open) {
      setStep("choose");
      setProtect(false);
      setPasscode(randomPasscode());
      setSubmitting(false);
      setError(null);
      setMinted(null);
      setCopied(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function handlePublish() {
    setSubmitting(true);
    setError(null);
    try {
      const body: { file_path: string; passcode?: string } = {
        file_path: path,
      };
      if (protect) body.passcode = passcode;
      const res = await fetch("/api/app/shares", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        slug?: string;
        has_passcode?: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.slug) {
        setError(data.message || data.error || `HTTP ${res.status}`);
        setSubmitting(false);
        return;
      }
      setMinted({
        slug: data.slug,
        has_passcode: !!data.has_passcode,
        passcode: data.has_passcode ? passcode : undefined,
      });
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function copy(val: string, tag: "url" | "code") {
    try {
      await navigator.clipboard.writeText(val);
      setCopied(tag);
      setTimeout(() => setCopied((c) => (c === tag ? null : c)), 1500);
    } catch {
      /* ignore */
    }
  }

  const shareUrl = minted
    ? `${typeof window !== "undefined" ? window.location.origin : "https://huozi.app"}/p/${minted.slug}`
    : "";

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-foreground/30 backdrop-blur-sm animate-in fade-in duration-150"
        onClick={onClose}
      />
      {/* Panel */}
      <div
        ref={dialogRef}
        className="relative w-full max-w-md rounded-lg border border-border bg-background shadow-xl p-6
                   animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="flex items-start justify-between mb-4 gap-4">
          <div>
            <h2 className="text-base font-semibold">
              {step === "choose" ? "Publish snapshot" : "Published"}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground font-mono truncate">
              {path}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="close"
          >
            ✕
          </button>
        </div>

        {step === "choose" && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Freezes the current bytes at{" "}
              <span className="font-mono">huozi.app/p/&lt;slug&gt;</span>. Later
              edits to this file don&rsquo;t change the published link.
            </p>

            <div className="space-y-2">
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="gate"
                  checked={!protect}
                  onChange={() => setProtect(false)}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium">Public</span>
                  <span className="block text-xs text-muted-foreground">
                    Anyone with the link can read.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="gate"
                  checked={protect}
                  onChange={() => setProtect(true)}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium">6-digit passcode</span>
                  <span className="block text-xs text-muted-foreground">
                    Viewers must enter the code. Share it separately.
                  </span>
                </span>
              </label>
            </div>

            {protect && (
              <div>
                <label htmlFor="pc" className="block text-xs font-medium mb-1">
                  Passcode
                </label>
                <div className="flex gap-2">
                  <input
                    id="pc"
                    type="text"
                    inputMode="numeric"
                    pattern="\d{6}"
                    maxLength={6}
                    value={passcode}
                    onChange={(e) =>
                      setPasscode(
                        e.target.value.replace(/\D/g, "").slice(0, 6),
                      )
                    }
                    className="flex-1 rounded-md border border-border bg-muted px-3 py-2 text-center text-base font-mono tracking-[0.3em] focus:outline-none focus:border-foreground/40"
                  />
                  <button
                    type="button"
                    onClick={() => setPasscode(randomPasscode())}
                    className="rounded-md border border-border px-3 py-2 text-xs hover:border-foreground/40"
                  >
                    ↻
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-md border border-red-500/40 bg-red-500/5 px-3 py-2 text-xs">
                {error}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-md border border-border px-4 py-2 text-sm hover:border-foreground/40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePublish}
                disabled={submitting || (protect && passcode.length !== 6)}
                className="flex-1 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? "Publishing…" : "Publish"}
              </button>
            </div>
          </div>
        )}

        {step === "done" && minted && (
          <div className="space-y-4">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">
                Share URL
              </div>
              <div className="flex gap-2">
                <code className="flex-1 rounded-md border border-border bg-muted px-3 py-2 text-xs font-mono break-all">
                  {shareUrl}
                </code>
                <button
                  type="button"
                  onClick={() => copy(shareUrl, "url")}
                  className="rounded-md border border-border px-3 py-2 text-xs hover:border-foreground/40 shrink-0"
                >
                  {copied === "url" ? "Copied" : "Copy"}
                </button>
              </div>
            </div>

            {minted.has_passcode && minted.passcode && (
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">
                  Passcode
                </div>
                <div className="flex gap-2">
                  <code className="flex-1 rounded-md border border-border bg-muted px-3 py-2 text-lg font-mono text-center tracking-[0.4em]">
                    {minted.passcode}
                  </code>
                  <button
                    type="button"
                    onClick={() => copy(minted.passcode!, "code")}
                    className="rounded-md border border-border px-3 py-2 text-xs hover:border-foreground/40 shrink-0"
                  >
                    {copied === "code" ? "Copied" : "Copy"}
                  </button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Send the URL and passcode separately for stronger protection.
                </p>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <a
                href={shareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 rounded-md border border-border px-4 py-2 text-sm text-center hover:border-foreground/40"
              >
                Open →
              </a>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
