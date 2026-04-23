"use client";

/**
 * Custom dropdown for the inactivity TTL (sliding-window lifetime).
 *
 * Styled to match `LocaleSwitcher` — rounded pill trigger, popover menu
 * with ✓ on the active row — so the workspace UI reads as one family.
 * Native `<select>` was replaced because its OS-controlled styling
 * broke the visual rhythm of the surrounding Agent card and made
 * "Never" + "never expires" feel like a redundant double-label.
 *
 * Side effects:
 *   - POST /api/app/connections/update-ttl
 *   - router.refresh() after success so row-level state (expires_at,
 *     countdown) reconciles without a full reload
 */

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { useT } from "@/lib/i18n/context";

interface Props {
  keyId: string;
  /** Current ttl_seconds on the key. `null` means "never expires". */
  currentTtlSeconds: number | null;
}

interface Preset {
  /** Null means "never expires". */
  ttlSeconds: number | null;
  /** i18n key resolved in-render so locale switches propagate. */
  labelKey: string;
}

const PRESETS: Preset[] = [
  { ttlSeconds: 1 * 86400, labelKey: "ws.ttl.1d" },
  { ttlSeconds: 7 * 86400, labelKey: "ws.ttl.7d" },
  { ttlSeconds: 30 * 86400, labelKey: "ws.ttl.30d" },
  { ttlSeconds: 180 * 86400, labelKey: "ws.ttl.180d" },
  { ttlSeconds: null, labelKey: "ws.ttl.never" },
];

const NEVER_PRESET = PRESETS[PRESETS.length - 1]!;

export function KeyTtlSelect({ keyId, currentTtlSeconds }: Props) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number | null>(currentTtlSeconds);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);

  // Keep local state in sync with server-confirmed value after refresh.
  useEffect(() => {
    setSelected(currentTtlSeconds);
  }, [currentTtlSeconds]);

  // Close on outside click + ESC.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function choose(preset: Preset) {
    setOpen(false);
    if (preset.ttlSeconds === selected) return;
    const prev = selected;
    setSelected(preset.ttlSeconds);
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/app/connections/update-ttl", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          key_id: keyId,
          ttl_seconds: preset.ttlSeconds,
        }),
      });
      const body = (await res.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
      };
      if (!res.ok || !body.ok) {
        setErr(body.message || body.error || `HTTP ${res.status}`);
        setSelected(prev);
        setBusy(false);
        return;
      }
      startTransition(() => {
        router.refresh();
        setBusy(false);
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setSelected(prev);
      setBusy(false);
    }
  }

  const currentPreset =
    PRESETS.find((p) => p.ttlSeconds === selected) ?? NEVER_PRESET;
  const busyAny = busy || pending;

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busyAny}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors
                   ${
                     open
                       ? "border-foreground/40 bg-muted"
                       : "border-border hover:border-foreground/40 hover:bg-muted/60"
                   }
                   ${busyAny ? "opacity-60 cursor-not-allowed" : ""}`}
      >
        <span className="text-foreground font-medium">
          {t(currentPreset.labelKey)}
        </span>
        <svg
          viewBox="0 0 12 12"
          width="9"
          height="9"
          className={`opacity-60 transition-transform ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        >
          <path
            d="M2 4 L6 8 L10 4"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full mt-1.5 min-w-[120px] z-40
                     rounded-md border border-border bg-background shadow-lg
                     py-1 animate-in fade-in slide-in-from-top-1 duration-150"
        >
          {PRESETS.map((p) => {
            const active = p.ttlSeconds === selected;
            return (
              <button
                key={p.labelKey}
                type="button"
                role="menuitem"
                aria-checked={active}
                onClick={() => choose(p)}
                className={`w-full flex items-center justify-between gap-3 px-3 py-1.5 text-xs transition-colors text-left
                           ${
                             active
                               ? "bg-muted/60 text-foreground"
                               : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                           }`}
              >
                <span>{t(p.labelKey)}</span>
                {active && (
                  <span className="text-accent text-[10px]" aria-hidden>
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {err && (
        <span className="ml-2 text-[10px] text-red-500 align-middle">
          {err}
        </span>
      )}
    </div>
  );
}
