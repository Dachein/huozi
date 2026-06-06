"use client";

/**
 * Star toggle backed by <FavoritesProvider>. Two variants:
 *   - "toolbar": bordered 32px button for the file detail header.
 *   - "row": tiny inline star for file-tree / favorites-panel rows;
 *     hidden until row hover unless the file is already favorited.
 *
 * Always stops propagation so toggling never triggers the row's navigation.
 */

import { useFavorites } from "./favorites-context";

export function FavoriteButton({
  path,
  variant = "toolbar",
}: {
  path: string;
  variant?: "toolbar" | "row";
}) {
  const { isFavorited, toggle } = useFavorites();
  const fav = isFavorited(path);

  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggle(path);
  };

  if (variant === "row") {
    return (
      <button
        type="button"
        aria-label={fav ? "取消收藏" : "收藏"}
        aria-pressed={fav}
        title={fav ? "取消收藏" : "收藏"}
        onClick={onClick}
        className={`shrink-0 inline-flex items-center justify-center rounded p-0.5 transition-opacity transition-colors hover:bg-muted/60 ${
          fav
            ? "opacity-100 text-amber-500"
            : "opacity-0 group-hover:opacity-100 focus:opacity-100 text-muted-foreground hover:text-foreground"
        }`}
      >
        <StarIcon filled={fav} size={14} />
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-label={fav ? "取消收藏" : "收藏"}
      aria-pressed={fav}
      title={fav ? "取消收藏" : "收藏"}
      onClick={onClick}
      className={`huozi-button inline-flex items-center justify-center rounded-md border h-8 w-8 transition-colors ${
        fav
          ? "border-amber-400/60 bg-amber-50/40 text-amber-500"
          : "border-border text-muted-foreground hover:border-foreground/40 hover:bg-muted/60 hover:text-foreground"
      }`}
    >
      <StarIcon filled={fav} size={16} />
    </button>
  );
}

function StarIcon({ filled, size }: { filled: boolean; size: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 3.5l2.6 5.27 5.82.85-4.21 4.1.99 5.79L12 16.9l-5.2 2.6.99-5.79-4.21-4.1 5.82-.85L12 3.5z" />
    </svg>
  );
}
