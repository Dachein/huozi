"use client";

/**
 * Client-side pins store for the workspace shell.
 *
 * Loads the caller's pins once (GET /api/app/pins → the worker's
 * Bearer-auth /me/pins, keyed by the user principal — the same store
 * the miniapp writes to), then exposes a synchronous `isPinned` for row /
 * toolbar pins and an optimistic `toggle` that fire-and-forgets the POST.
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

interface PinsCtx {
  pins: Set<string>;
  isPinned: (path: string) => boolean;
  toggle: (path: string) => void;
  ready: boolean;
}

const Ctx = createContext<PinsCtx | null>(null);

interface PinRow {
  file_path: string;
}

export function PinProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [pins, setPins] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/app/pins", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { pins?: PinRow[] } | null) => {
        if (!alive || !j || !Array.isArray(j.pins)) return;
        setPins(
          new Set(
            j.pins
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

  const isPinned = useCallback(
    (p: string) => pins.has(p),
    [pins],
  );

  const toggle = useCallback((path: string) => {
    setPins((prev) => {
      const next = new Set(prev);
      const willPin = !next.has(path);
      if (willPin) next.add(path);
      else next.delete(path);
      // Fire-and-forget: the optimistic Set is the source of truth for the
      // UI; a failed write just self-heals on the next page load.
      fetch("/api/app/pins", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ file_path: path, pinned: willPin }),
      }).catch(() => {});
      return next;
    });
  }, []);

  return (
    <Ctx.Provider value={{ pins, isPinned, toggle, ready }}>
      {children}
    </Ctx.Provider>
  );
}

const NOOP: PinsCtx = {
  pins: new Set(),
  isPinned: () => false,
  toggle: () => {},
  ready: false,
};

export function usePins(): PinsCtx {
  return useContext(Ctx) ?? NOOP;
}
