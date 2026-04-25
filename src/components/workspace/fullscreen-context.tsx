"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface FullscreenCtx {
  fullscreen: boolean;
  setFullscreen: (v: boolean) => void;
  toggle: () => void;
}

const Ctx = createContext<FullscreenCtx>({
  fullscreen: false,
  setFullscreen: () => {},
  toggle: () => {},
});

export function FullscreenProvider({ children }: { children: ReactNode }) {
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [fullscreen]);

  const toggle = useCallback(() => setFullscreen((v) => !v), []);

  const value = useMemo(
    () => ({ fullscreen, setFullscreen, toggle }),
    [fullscreen, toggle],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFullscreen(): FullscreenCtx {
  return useContext(Ctx);
}
