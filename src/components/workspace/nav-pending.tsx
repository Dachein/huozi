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
 * Renders `{children}` when no navigation is pending, otherwise renders
 * a skeleton — same shape as the file-view header + body so the layout
 * doesn't jump when content arrives.
 */
export function NavPendingGate({ children }: { children: ReactNode }) {
  const { isPending } = useWorkspaceNav();
  if (isPending) return <ViewSkeleton />;
  return <>{children}</>;
}

function ViewSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true" aria-live="polite">
      <div>
        <div className="h-3 w-40 rounded bg-muted/60 mb-3" />
        <div className="flex items-center gap-2">
          <div className="h-6 w-2/3 rounded bg-muted/70" />
          <div className="ml-auto h-6 w-20 rounded bg-muted/50" />
          <div className="h-6 w-20 rounded bg-muted/50" />
        </div>
      </div>
      <div className="space-y-3 pt-2">
        <div className="h-4 w-11/12 rounded bg-muted/50" />
        <div className="h-4 w-10/12 rounded bg-muted/50" />
        <div className="h-4 w-9/12 rounded bg-muted/40" />
        <div className="h-4 w-11/12 rounded bg-muted/50" />
        <div className="h-4 w-8/12 rounded bg-muted/40" />
        <div className="h-4 w-10/12 rounded bg-muted/50" />
        <div className="h-4 w-7/12 rounded bg-muted/40" />
      </div>
    </div>
  );
}
