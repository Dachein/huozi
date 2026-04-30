import { DEFAULT_ICONS, type IconName } from "./registry";

export interface IconProps {
  name: IconName;
  className?: string;
}

/**
 * Render an icon by semantic name.
 *
 * Server component — the registry is a static map of name → renderer
 * and there is no client-side state. Future theme overrides plug in
 * by composing a per-theme registry layered on top of `DEFAULT_ICONS`
 * (see `docs/theme-contract.md` §3).
 *
 * Color is inherited via `currentColor` / `text-*` Tailwind classes;
 * pass color through `className` rather than baking it into the icon.
 */
export function Icon({ name, className }: IconProps) {
  const renderer = DEFAULT_ICONS[name];
  return renderer({ className });
}
