"use client";

/**
 * Client-side theme context.
 *
 * The active theme is already resolved server-side via `getTheme()`
 * (cookie read) and applied to `<html data-theme="…">` so colors flow
 * through CSS tokens without any JS. This context exists for the rare
 * cases where a *component's behavior* (not just its color) needs to
 * branch on the theme — primarily per-theme glyph variants in
 * `FileIcon`, where the actual SVG path differs across themes (paper
 * brushy, block chunky, office line-art) rather than just a recolor.
 *
 * The provider is fed by the same `getTheme()` result the layout
 * passes to `<html data-theme>`, so SSR markup and the context value
 * always agree — no hydration mismatch, no first-paint flash.
 *
 * Components that aren't wrapped in a provider (e.g. published `/p`
 * pages, marketing) silently get the default theme. That's the right
 * fallback: those surfaces don't carry the cookie, and the default
 * variant is the safest visual.
 */
import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_THEME, type Theme } from "./index";

const ThemeContext = createContext<Theme>(DEFAULT_THEME);

export function ThemeProvider({
  theme,
  children,
}: {
  theme: Theme;
  children: ReactNode;
}) {
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
