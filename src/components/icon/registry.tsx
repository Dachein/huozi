/**
 * Default icon registry.
 *
 * Each icon is referenced by **semantic name** at call sites
 * (`<Icon name="files" />`) and resolved here. Themes will eventually
 * be able to override any subset of names — see Phase 2 in
 * `docs/theme-contract.md`.
 *
 * Design notes:
 *
 * - Names are intentionally semantic, not visual. "files" not "cloud",
 *   "members" not "person". Themes pick the visual.
 * - The default renderers are a deliberate mix:
 *     · CJK glyphs (字/云/人/入) for huozi-brand decoration — these are
 *       the icons most worth theming, since a non-CJK theme will want
 *       to replace them entirely.
 *     · Inline SVG for tiny UI chrome (chevron) so we don't pull a
 *       full icon package for one path.
 *     · Lucide / Heroicons for utility actions where the existing
 *       libraries already deliver crisp 1.5px-stroke glyphs.
 * - All renderers must respect `currentColor` so token-driven color
 *   (text-accent / text-muted-foreground) flows through.
 */

import type { ReactElement } from "react";
import { Check, Copy } from "lucide-react";
import {
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  ShareIcon,
} from "@heroicons/react/24/outline";

export const ICON_NAMES = [
  // Brand decoration (high theming leverage — CJK glyphs in default,
  // logos / sprites in alternate themes).
  "brand",
  "files",
  "members",
  "joined",

  // Wayfinding indicators
  "external",
  "arrow-right",
  "chevron-down",

  // Utility actions
  "copy",
  "check",
  "share",
  "fullscreen-enter",
  "fullscreen-exit",
] as const;

export type IconName = (typeof ICON_NAMES)[number];

export interface IconRendererProps {
  className?: string;
}

export type IconRenderer = (props: IconRendererProps) => ReactElement;

const cx = (...parts: (string | undefined | false)[]) =>
  parts.filter(Boolean).join(" ");

export const DEFAULT_ICONS: Record<IconName, IconRenderer> = {
  brand: ({ className }) => (
    <span className={cx("font-serif leading-none", className)}>字</span>
  ),
  files: ({ className }) => (
    <span className={cx("font-serif leading-none", className)}>云</span>
  ),
  members: ({ className }) => (
    <span className={cx("font-serif leading-none", className)}>人</span>
  ),
  joined: ({ className }) => (
    <span className={cx("font-serif leading-none", className)}>入</span>
  ),

  external: ({ className }) => (
    <span className={cx("leading-none", className)} aria-hidden>
      ↗
    </span>
  ),
  "arrow-right": ({ className }) => (
    <span className={cx("leading-none", className)} aria-hidden>
      →
    </span>
  ),
  "chevron-down": ({ className }) => (
    <svg
      viewBox="0 0 12 12"
      width="9"
      height="9"
      className={className}
      aria-hidden
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
  ),

  copy: ({ className }) => <Copy className={className} />,
  check: ({ className }) => <Check className={className} />,
  share: ({ className }) => <ShareIcon className={className} />,
  "fullscreen-enter": ({ className }) => (
    <ArrowsPointingOutIcon className={className} />
  ),
  "fullscreen-exit": ({ className }) => (
    <ArrowsPointingInIcon className={className} />
  ),
};
