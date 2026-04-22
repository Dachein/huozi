"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n/context";
import { COOKIE_NAME, type Locale, LOCALES } from "@/lib/i18n";

/**
 * Custom locale dropdown — replaces the previous unstyled `<select>`.
 *
 * Visual: trigger is a tiny pill showing the native glyph (文/A/あ/F) in
 * accent color + the native locale name. On open, a small menu appears
 * below-right with all four locales, each with its native glyph, native
 * name, and a checkmark on the active one.
 *
 * UX niceties:
 *   - click-outside + ESC to close
 *   - ↑ / ↓ keyboard nav, Enter to pick, Home/End jumps to edges
 *   - fade + slide-in animation
 *   - a11y: role="menu" / "menuitem", aria-expanded, aria-checked
 *
 * We persist the choice in a one-year cookie and call `router.refresh()`
 * so the server re-renders with the new locale. No flicker thanks to RSC.
 */

interface LocaleInfo {
  /** Short native glyph / letter used as a small badge. */
  glyph: string;
  /** Full native name shown in the menu row and (when selected) trigger. */
  native: string;
}

const INFO: Record<Locale, LocaleInfo> = {
  zh: { glyph: "中", native: "中文" },
  en: { glyph: "A", native: "English" },
  ja: { glyph: "あ", native: "日本語" },
  fr: { glyph: "F", native: "Français" },
};

interface LocaleSwitcherProps {
  /**
   * Which side of the trigger the menu pops out from.
   *   "down" — menu below trigger (use when switcher lives in a top header)
   *   "up"   — menu above trigger (use when switcher lives in a footer)
   * Default: "down".
   */
  placement?: "up" | "down";
}

export function LocaleSwitcher({ placement = "down" }: LocaleSwitcherProps = {}) {
  const current = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [focusIdx, setFocusIdx] = useState<number>(() =>
    Math.max(0, LOCALES.indexOf(current)),
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<Array<HTMLButtonElement | null>>([]);

  function choose(loc: Locale) {
    document.cookie = `${COOKIE_NAME}=${loc};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
    setOpen(false);
    router.refresh();
  }

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

  // When opened, focus the currently-selected row so keyboard nav
  // begins sensibly.
  useEffect(() => {
    if (open) {
      const idx = Math.max(0, LOCALES.indexOf(current));
      setFocusIdx(idx);
      // defer focus until after the menu renders
      queueMicrotask(() => itemsRef.current[idx]?.focus());
    }
  }, [open, current]);

  function onTriggerKey(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
    }
  }

  function onItemKey(e: React.KeyboardEvent<HTMLButtonElement>, idx: number) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = (idx + 1) % LOCALES.length;
      setFocusIdx(next);
      itemsRef.current[next]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = (idx - 1 + LOCALES.length) % LOCALES.length;
      setFocusIdx(next);
      itemsRef.current[next]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      setFocusIdx(0);
      itemsRef.current[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      const last = LOCALES.length - 1;
      setFocusIdx(last);
      itemsRef.current[last]?.focus();
    } else if (e.key === "Tab") {
      // let Tab close the menu naturally
      setOpen(false);
    }
  }

  const info = INFO[current];

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onTriggerKey}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Change language"
        className={`group inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1
                   text-xs transition-colors
                   ${open
                     ? "border-foreground/40 bg-muted"
                     : "border-border hover:border-foreground/40 hover:bg-muted/60"}`}
      >
        <span className="font-serif text-sm text-accent leading-none w-4 text-center">
          {info.glyph}
        </span>
        <span className="text-muted-foreground group-hover:text-foreground">
          {info.native}
        </span>
        <svg
          viewBox="0 0 12 12"
          width="9"
          height="9"
          className={`opacity-60 transition-transform ${open ? "rotate-180" : ""}`}
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
          aria-label="Select language"
          className={`absolute right-0 min-w-[160px] z-40
                     rounded-md border border-border bg-background shadow-lg
                     py-1 animate-in fade-in duration-150
                     ${placement === "up"
                       ? "bottom-full mb-1.5 slide-in-from-bottom-1"
                       : "top-full mt-1.5 slide-in-from-top-1"}`}
        >
          {LOCALES.map((loc, idx) => {
            const isActive = loc === current;
            const rowInfo = INFO[loc];
            return (
              <button
                key={loc}
                ref={(el) => {
                  itemsRef.current[idx] = el;
                }}
                role="menuitem"
                aria-checked={isActive}
                tabIndex={focusIdx === idx ? 0 : -1}
                onClick={() => choose(loc)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    choose(loc);
                  } else {
                    onItemKey(e, idx);
                  }
                }}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors text-left
                           ${isActive
                             ? "bg-muted/60 text-foreground"
                             : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"}`}
              >
                <span
                  className={`font-serif text-base leading-none w-5 text-center
                             ${isActive ? "text-accent" : "text-muted-foreground/70"}`}
                >
                  {rowInfo.glyph}
                </span>
                <span className="flex-1">{rowInfo.native}</span>
                {isActive && (
                  <span className="text-accent text-xs" aria-hidden="true">
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
