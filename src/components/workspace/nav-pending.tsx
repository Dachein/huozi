"use client";

/**
 * Drives the "click a file → main column flips to a skeleton instantly"
 * UX. We can't rely on Next's `loading.tsx` here because the file view
 * lives at `/workspace/view?path=…` — same route segment, only the
 * search param changes. On a soft transition like that React keeps the
 * OLD UI visible while the new RSC streams in (it's a Concurrent
 * feature, not a bug), so the Suspense fallback never paints.
 *
 * Workaround: every tree / recent link funnels through `navigate()`
 * which wraps `router.push` in `useTransition`. While the transition is
 * pending we render a skeleton in place of `{children}`. The pending
 * flag clears the moment the new server payload commits.
 */

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useTransition,
  type ReactNode,
} from "react";

interface WorkspaceNav {
  isPending: boolean;
  navigate: (href: string) => void;
}

const Ctx = createContext<WorkspaceNav>({
  isPending: false,
  navigate: () => {},
});

export function WorkspaceNavProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const navigate = useCallback(
    (href: string) => {
      startTransition(() => {
        router.push(href);
      });
    },
    [router],
  );
  return <Ctx.Provider value={{ isPending, navigate }}>{children}</Ctx.Provider>;
}

export function useWorkspaceNav(): WorkspaceNav {
  return useContext(Ctx);
}

/**
 * Top-of-column indeterminate progress bar — visible only while a
 * navigation is in flight. We deliberately do NOT swap `{children}`
 * for a skeleton: pages here are full reading surfaces, not card
 * lists, so a structural skeleton looks like a blank screen. The old
 * page stays visible (the user already clicked, they know it's
 * about to change) and the bar communicates "working on it".
 */
export function NavLoadingBar() {
  const { isPending } = useWorkspaceNav();
  if (!isPending) return null;
  return (
    <div
      role="progressbar"
      aria-busy="true"
      aria-label="Loading"
      className="pointer-events-none absolute inset-x-0 top-0 h-0.5 overflow-hidden z-20"
    >
      <div className="h-full w-1/3 bg-accent animate-loading-bar" />
    </div>
  );
}
