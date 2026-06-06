"use client";

/**
 * Client-side favorites store for the workspace shell.
 *
 * Loads the caller's favorites once (GET /api/app/favorites → the worker's
 * Bearer-auth /me/favorites, keyed by the user principal — the same store
 * the miniapp writes to), then exposes a synchronous `isFavorited` for row /
 * toolbar stars and an optimistic `toggle` that fire-and-forgets the POST.
 *
 * Mounted in <WorkspaceShell>, so it wraps both the file tree and the
 * detail page (passed in as `children`) — every star reads one shared Set.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

interface FavoritesCtx {
  favorites: Set<string>;
  isFavorited: (path: string) => boolean;
  toggle: (path: string) => void;
  ready: boolean;
}

const Ctx = createContext<FavoritesCtx | null>(null);

interface FavoriteRow {
  file_path: string;
}

export function FavoritesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/app/favorites", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { favorites?: FavoriteRow[] } | null) => {
        if (!alive || !j || !Array.isArray(j.favorites)) return;
        setFavorites(
          new Set(
            j.favorites
              .map((f) => f?.file_path)
              .filter((p): p is string => typeof p === "string"),
          ),
        );
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const isFavorited = useCallback(
    (p: string) => favorites.has(p),
    [favorites],
  );

  const toggle = useCallback((path: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      const willFav = !next.has(path);
      if (willFav) next.add(path);
      else next.delete(path);
      // Fire-and-forget: the optimistic Set is the source of truth for the
      // UI; a failed write just self-heals on the next page load.
      fetch("/api/app/favorites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ file_path: path, favorited: willFav }),
      }).catch(() => {});
      return next;
    });
  }, []);

  return (
    <Ctx.Provider value={{ favorites, isFavorited, toggle, ready }}>
      {children}
    </Ctx.Provider>
  );
}

const NOOP: FavoritesCtx = {
  favorites: new Set(),
  isFavorited: () => false,
  toggle: () => {},
  ready: false,
};

export function useFavorites(): FavoritesCtx {
  return useContext(Ctx) ?? NOOP;
}
