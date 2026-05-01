"use client";

import { useState } from "react";
import { useLocale } from "@/lib/i18n/context";
import { COOKIE_NAME, type Locale, LOCALES } from "@/lib/i18n";
import { ApplyingOverlay, APPLY_DELAY_MS } from "@/components/applying-overlay";

interface LocaleInfo {
  glyph: string;
  /** Native script display name. Stored as a literal (rather than
   *  a translation key) because each locale's name should always read
   *  in its own script regardless of the active UI language. */
  native: string;
}

const INFO: Record<Locale, LocaleInfo> = {
  zh: { glyph: "中", native: "中文" },
  en: { glyph: "A", native: "English" },
  ja: { glyph: "あ", native: "日本語" },
  fr: { glyph: "F", native: "Français" },
};

export interface LocaleGridProps {
  /** Called after the cookie is written but before the reload. The
   *  user-menu uses this to close itself so the dropdown isn't seen
   *  flickering through the overlay. */
  onPick?: (loc: Locale) => void;
}

/**
 * 4-card locale picker. Inline grid (no popover) — used in the workspace
 * UserMenu and in the marketing mobile menu so both surfaces share the
 * same visual idiom.
 *
 * Switch flow (shared with ThemeGrid):
 *   click → write cookie → close menu → render full-screen overlay →
 *   250ms later → hard reload → first paint is in the new locale
 *
 * Hard reload (rather than `router.refresh()`) keeps the flow
 * symmetrical with theme switching — same overlay component, same
 * delay, same first-paint guarantee.
 */
export function LocaleGrid({ onPick }: LocaleGridProps = {}) {
  const current = useLocale();
  const [applying, setApplying] = useState<Locale | null>(null);

  function choose(loc: Locale) {
    if (loc === current || applying) return;
    document.cookie = `${COOKIE_NAME}=${loc};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
    setApplying(loc);
    onPick?.(loc);
    setTimeout(() => window.location.reload(), APPLY_DELAY_MS);
  }

  return (
    <>
      <div className="flex gap-1">
        {LOCALES.map((loc) => {
          const active = loc === current;
          const isApplyingThis = applying === loc;
          const info = INFO[loc];
          return (
            <button
              key={loc}
              type="button"
              onClick={() => choose(loc)}
              disabled={applying !== null}
              title={info.native}
              aria-label={info.native}
              aria-pressed={active}
              aria-busy={isApplyingThis || undefined}
              className={`flex-1 flex flex-col items-center gap-0.5 rounded-md px-2 py-1.5 transition-colors
                         disabled:cursor-default
                         ${
                           active || isApplyingThis
                             ? "bg-muted text-foreground"
                             : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                         }`}
            >
              <span
                className={`font-serif text-base leading-none ${
                  active || isApplyingThis ? "text-accent" : ""
                }`}
              >
                {info.glyph}
              </span>
              <span className="text-[10px] truncate max-w-full">
                {info.native}
              </span>
            </button>
          );
        })}
      </div>
      {applying && <ApplyingOverlay target={INFO[applying].native} />}
    </>
  );
}
