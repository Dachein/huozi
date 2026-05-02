"use client";

import { useState } from "react";
import { useConfirm } from "@/components/confirm-provider";
import { APPLY_DELAY_MS } from "@/components/applying-overlay";

export interface SwitchApplyRequest<T extends string> {
  /** Cookie name to persist the new value under. */
  cookieName: string;
  /** Currently active value — used to short-circuit no-ops. */
  current: T;
  /** Target value the user clicked. */
  next: T;
  /** Pre-localized strings for the confirm dialog. Both grids supply
   *  these from their own i18n tables so the hook stays content-blind. */
  confirm: {
    title: string;
    body: string;
    warning?: string;
    actionLabel: string;
    cancelLabel: string;
  };
  /** Notified once the user confirms — used by the user-menu to close
   *  itself before the overlay paints, so the dropdown isn't seen
   *  flickering through it. */
  onPicked?: (value: T) => void;
}

/**
 * Shared confirm → cookie → overlay → reload flow used by both
 * `ThemeGrid` and `LocaleGrid`.
 *
 * Why a hook (rather than a function): the `applying` state needs to
 * survive across renders so the calling grid can render its own
 * `ApplyingOverlay` while the 250ms grace period elapses. Each grid
 * still owns its picker UI; this hook owns the pipeline.
 *
 * Returns `{ applying, apply }`:
 *   - `applying` — the target value if a switch is in flight, else null.
 *     Drives both the per-tile `aria-busy` and the overlay.
 *   - `apply()`  — async; resolves once the user dismisses or confirms.
 *     Returns true iff a reload was scheduled. Callers don't usually
 *     need the return value, but it makes the contract explicit.
 *
 * The 250ms delay (`APPLY_DELAY_MS`) is what gives the overlay time to
 * paint between cookie-write and `window.location.reload()`. See
 * `ApplyingOverlay` for the rationale.
 */
export function useSwitchApply<T extends string>() {
  const ask = useConfirm();
  const [applying, setApplying] = useState<T | null>(null);

  async function apply(req: SwitchApplyRequest<T>): Promise<boolean> {
    if (req.next === req.current || applying !== null) return false;
    const ok = await ask({
      title: req.confirm.title,
      body: req.confirm.body,
      warning: req.confirm.warning,
      actionLabel: req.confirm.actionLabel,
      cancelLabel: req.confirm.cancelLabel,
    });
    if (!ok) return false;
    document.cookie = `${req.cookieName}=${req.next};path=/;max-age=${
      60 * 60 * 24 * 365
    };samesite=lax`;
    setApplying(req.next);
    req.onPicked?.(req.next);
    setTimeout(() => window.location.reload(), APPLY_DELAY_MS);
    return true;
  }

  return { applying, apply };
}
