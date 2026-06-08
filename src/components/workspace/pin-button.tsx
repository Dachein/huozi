"use client";

/**
 * Star toggle backed by <PinProvider>. Two variants:
 *   - "toolbar": bordered 32px button for the file detail header.
 *   - "row": tiny inline pin for file-tree / pins-panel rows.
 *
 * Visibility:
 *   - file-tree rows: hidden until row hover unless already pinned.
 *   - pins-panel rows: pass `revealOnHover` so the pin stays hidden until
 *     hover even though the file is pinned (the panel's own header pin
 *     glyph already signals "pinned", so a per-row indicator is redundant).
 *
 * Color/stroke adapt per theme — paper (default) and office both use the
 * brand accent; paper renders it outline-only (a solid fill read too hot
 * on the cream bg) while office keeps its filled blue accent. brutal-mono,
 * where the accent is near-invisible on its yellow, uses a bold filled
 * black pin.
 *
 * Always stops propagation so toggling never triggers the row's navigation.
 */

import { usePins } from "./pin-context";
import { useT } from "@/lib/i18n/context";
import { useTheme } from "@/lib/theme/context";

// Active (pinned) foreground per theme.
function activePinClass(theme: string): string {
  if (theme === "brutal-mono") return "text-foreground";
  return "text-accent";
}
// Toolbar (bordered) active chrome per theme.
function activeToolbarClass(theme: string): string {
  if (theme === "brutal-mono")
    return "border-foreground bg-accent/15 text-foreground";
  return "border-accent/50 bg-accent/10 text-accent";
}

export function PinButton({
  path,
  variant = "toolbar",
  revealOnHover = false,
}: {
  path: string;
  variant?: "toolbar" | "row";
  /** row-only: keep hidden until hover even when pinned. */
  revealOnHover?: boolean;
}) {
  const t = useT();
  const theme = useTheme();
  const { isPinned, toggle } = usePins();
  const pinned = isPinned(path);
  const label = t(pinned ? "pin.remove" : "pin.add");

  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggle(path);
  };

  if (variant === "row") {
    // Hidden-until-hover when not pinned, OR when revealOnHover is forced.
    const hidden =
      !pinned || revealOnHover
        ? "opacity-0 group-hover:opacity-100 focus:opacity-100"
        : "opacity-100";
    const color = pinned
      ? activePinClass(theme)
      : "text-muted-foreground hover:text-foreground";
    return (
      <button
        type="button"
        aria-label={label}
        aria-pressed={pinned}
        title={label}
        onClick={onClick}
        className={`shrink-0 inline-flex items-center justify-center rounded p-0.5 transition-opacity transition-colors hover:bg-muted/60 ${hidden} ${color}`}
      >
        <PinIcon filled={pinned && theme !== "default"} size={14} />
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pinned}
      title={label}
      onClick={onClick}
      className={`huozi-button inline-flex items-center justify-center rounded-md border h-8 w-8 transition-colors ${
        pinned
          ? activeToolbarClass(theme)
          : "border-border text-muted-foreground hover:border-foreground/40 hover:bg-muted/60 hover:text-foreground"
      }`}
    >
      <PinIcon filled={pinned && theme !== "default"} size={16} />
    </button>
  );
}

/**
 * Pin glyph. Exported so section headers (PinsPanel) can reuse the same
 * shape as a category icon. Stroke thickens + corners square up under
 * brutal-mono to match the theme's heavier line work.
 */
export function PinIcon({ filled, size }: { filled: boolean; size: number }) {
  const theme = useTheme();
  const brutal = theme === "brutal-mono";
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={brutal ? 2.2 : 1.6}
      strokeLinejoin={brutal ? "miter" : "round"}
      strokeLinecap={brutal ? "butt" : "round"}
      aria-hidden="true"
    >
      <line x1="12" y1="17" x2="12" y2="22" />
      <path
        d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"
        fill={filled ? "currentColor" : "none"}
      />
    </svg>
  );
}
