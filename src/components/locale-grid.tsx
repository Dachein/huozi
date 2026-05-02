"use client";

import { useLocale, useT } from "@/lib/i18n/context";
import { COOKIE_NAME, type Locale, LOCALES } from "@/lib/i18n";
import { ApplyingOverlay } from "@/components/applying-overlay";
import { useSwitchApply } from "@/components/use-switch-apply";

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
 * UserMenu so identity / language / theme read as a coherent set of
 * controls.
 *
 * Switch flow (shared with ThemeGrid via `useSwitchApply`):
 *   click → confirm dialog → write cookie → close menu → full-screen
 *   overlay → 250ms → hard reload → first paint is in the new locale
 *
 * Hard reload (rather than `router.refresh()`) keeps the flow
 * symmetrical with theme switching — same overlay component, same
 * delay, same first-paint guarantee.
 */
export function LocaleGrid({ onPick }: LocaleGridProps = {}) {
  const current = useLocale();
  const t = useT();
  const { applying, apply } = useSwitchApply<Locale>();

  function choose(loc: Locale) {
    void apply({
      cookieName: COOKIE_NAME,
      current,
      next: loc,
      confirm: {
        title: t("locale.confirm.title"),
        body: t("locale.confirm.body").replace("{name}", INFO[loc].native),
        // Locale-confirm shares the theme-confirm action/cancel keys —
        // they're plain "Confirm" / "Cancel" verbs and adding parallel
        // `locale.confirm.action` keys would just duplicate four files.
        actionLabel: t("theme.confirm.action"),
        cancelLabel: t("theme.confirm.cancel"),
      },
      onPicked: onPick,
    });
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
              className={`huozi-tile flex-1 flex flex-col items-center gap-0.5 rounded-md px-2 py-1.5 transition-colors
                         cursor-pointer disabled:cursor-default
                         ${
                           active || isApplyingThis
                             ? "bg-muted text-foreground"
                             : "text-muted-foreground hover:bg-muted hover:text-foreground"
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
