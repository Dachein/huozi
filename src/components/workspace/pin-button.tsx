"use client";

/**
 * Star toggle backed by <PinProvider>. Two variants:
 *   - "toolbar": bordered 32px button for the file detail header.
 *   - "row": tiny inline star for file-tree / pins-panel rows;
 *     hidden until row hover unless the file is already pinned.
 *
 * Always stops propagation so toggling never triggers the row's navigation.
 */

import { usePins } from "./pin-context";
import { useT } from "@/lib/i18n/context";

export function PinButton({
  path,
  variant = "toolbar",
}: {
  path: string;
  variant?: "toolbar" | "row";
}) {
  const t = useT();
  const { isPinned, toggle } = usePins();
  const pinned = isPinned(path);
  const label = t(pinned ? "pin.remove" : "pin.add");

  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggle(path);
  };

  if (variant === "row") {
    return (
      <button
        type="button"
        aria-label={label}
        aria-pressed={pinned}
        title={label}
        onClick={onClick}
        className={`shrink-0 inline-flex items-center justify-center rounded p-0.5 transition-opacity transition-colors hover:bg-muted/60 ${
          pinned
            ? "opacity-100 text-amber-500"
            : "opacity-0 group-hover:opacity-100 focus:opacity-100 text-muted-foreground hover:text-foreground"
        }`}
      >
        <PinIcon filled={pinned} size={14} />
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
          ? "border-amber-400/60 bg-amber-50/40 text-amber-500"
          : "border-border text-muted-foreground hover:border-foreground/40 hover:bg-muted/60 hover:text-foreground"
      }`}
    >
      <PinIcon filled={pinned} size={16} />
    </button>
  );
}

function PinIcon({ filled, size }: { filled: boolean; size: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
      strokeLinecap="round"
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
