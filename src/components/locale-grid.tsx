"use client";

import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n/context";
import { COOKIE_NAME, type Locale, LOCALES } from "@/lib/i18n";

interface LocaleInfo {
  glyph: string;
  native: string;
}

const INFO: Record<Locale, LocaleInfo> = {
  zh: { glyph: "中", native: "中文" },
  en: { glyph: "A", native: "English" },
  ja: { glyph: "あ", native: "日本語" },
  fr: { glyph: "F", native: "Français" },
};

export interface LocaleGridProps {
  /** Called after the cookie is written, before router.refresh(). */
  onPick?: (loc: Locale) => void;
}

/**
 * 4-card locale picker. Inline grid (no popover) — used in the workspace
 * UserMenu and in the marketing mobile menu so both surfaces share the
 * same visual idiom.
 */
export function LocaleGrid({ onPick }: LocaleGridProps = {}) {
  const current = useLocale();
  const router = useRouter();

  function choose(loc: Locale) {
    document.cookie = `${COOKIE_NAME}=${loc};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
    onPick?.(loc);
    router.refresh();
  }

  return (
    <div className="flex gap-1">
      {LOCALES.map((loc) => {
        const active = loc === current;
        const info = INFO[loc];
        return (
          <button
            key={loc}
            type="button"
            onClick={() => choose(loc)}
            title={info.native}
            aria-label={info.native}
            aria-pressed={active}
            className={`flex-1 flex flex-col items-center gap-0.5 rounded-md px-2 py-1.5 transition-colors
                       ${
                         active
                           ? "bg-muted text-foreground"
                           : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                       }`}
          >
            <span
              className={`font-serif text-base leading-none ${
                active ? "text-accent" : ""
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
  );
}
