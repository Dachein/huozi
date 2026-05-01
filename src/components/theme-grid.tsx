"use client";

import { useState } from "react";
import { COOKIE_NAME, type Theme, THEMES } from "@/lib/theme";
import { useT } from "@/lib/i18n/context";
import { ApplyingOverlay, APPLY_DELAY_MS } from "@/components/applying-overlay";

interface ThemeInfo {
  /** Single-character glyph shown in the tile, mirrors the LocaleGrid
   *  pattern. Picked to evoke the theme's mood (纸 = paper grain,
   *  块 = block / brutal). */
  glyph: string;
  /** Display name in the current locale. */
  labelKey: string;
}

const INFO: Record<Theme, ThemeInfo> = {
  default: { glyph: "纸", labelKey: "theme.default.name" },
  "brutal-mono": { glyph: "块", labelKey: "theme.brutalMono.name" },
};

export interface ThemeGridProps {
  current: Theme;
  /** Called after the cookie is written but before the reload. The
   *  user-menu uses this to close itself so the dropdown isn't seen
   *  flickering through the overlay. */
  onPick?: (theme: Theme) => void;
}

/**
 * 2-card theme picker. Inline grid, mirrors `LocaleGrid` so the user
 * menu reads as a coherent set of identity controls.
 *
 * Switch flow (shared with LocaleGrid):
 *   click → write cookie → close menu → render full-screen overlay
 *   in current theme → 250ms later → hard reload → first paint is
 *   in new theme
 *
 * The current theme is always passed in from a server component (root
 * layout reads it from the cookie) — the client doesn't re-read the
 * cookie because the SSR-rendered `<html data-theme>` is already the
 * truth and reading it client-side just creates a hydration mismatch
 * window.
 */
export function ThemeGrid({ current, onPick }: ThemeGridProps) {
  const t = useT();
  const [applying, setApplying] = useState<Theme | null>(null);

  function choose(theme: Theme) {
    if (theme === current || applying) return;
    document.cookie = `${COOKIE_NAME}=${theme};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
    setApplying(theme);
    onPick?.(theme);
    setTimeout(() => window.location.reload(), APPLY_DELAY_MS);
  }

  return (
    <>
      <div className="flex gap-1">
        {THEMES.map((theme) => {
          const active = theme === current;
          const isApplyingThis = applying === theme;
          const info = INFO[theme];
          return (
            <button
              key={theme}
              type="button"
              onClick={() => choose(theme)}
              disabled={applying !== null}
              title={t(info.labelKey)}
              aria-label={t(info.labelKey)}
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
                {t(info.labelKey)}
              </span>
            </button>
          );
        })}
      </div>
      {applying && <ApplyingOverlay target={t(INFO[applying].labelKey)} />}
    </>
  );
}
