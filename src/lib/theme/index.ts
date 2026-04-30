/**
 * Theme registry & cookie contract.
 *
 * Mirrors the i18n module's shape — themes live in CSS via
 * `[data-theme="<name>"]` blocks in `src/app/globals.css`, and this
 * module is the source of truth for which names are valid + the cookie
 * the user-facing switcher writes.
 *
 * See `docs/theme-contract.md` for the full token surface and the
 * theme-bundle authoring rules.
 */

export const THEMES = ["default", "brutal-mono"] as const;
export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = "default";
export const COOKIE_NAME = "huozi-theme";

export function isTheme(value: string | undefined | null): value is Theme {
  return !!value && (THEMES as readonly string[]).includes(value);
}
