import Link from "next/link";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { AppHeaderSubnav } from "@/components/app-header-subnav";
import { isEdge } from "@/lib/edition";
import type { Principal, Workspace } from "@/lib/identity";

/**
 * Compact app header — appears on every `/workspace/*` page.
 *
 * Layout: `字 huozi.app` (small) · workspace slug · subnav · locale · disconnect
 *
 * Intentionally visually distinct from the marketing header (smaller row
 * height, no product nav) so the user knows they've entered the app.
 */
interface AppHeaderProps {
  principal: Principal;
  workspace: Workspace | null;
}

export function AppHeader({ principal, workspace }: AppHeaderProps) {
  return (
    <header className="border-b border-border/50 bg-background/95 backdrop-blur sticky top-0 z-20">
      <div className="mx-auto flex h-12 max-w-7xl items-center justify-between px-4 sm:px-6 gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/"
            className="flex items-baseline gap-1.5 text-sm font-medium shrink-0"
            title="Back to huozi.app"
          >
            <span className="font-serif text-base font-bold text-accent leading-none">
              字
            </span>
            <span className="hidden sm:inline">huozi</span>
          </Link>

          {workspace && (
            <>
              <span className="text-border">/</span>
              <span
                className="text-sm font-mono truncate text-muted-foreground"
                title={workspace.slug}
              >
                {workspace.slug}
              </span>
            </>
          )}
        </div>

        <nav className="flex items-center gap-3 sm:gap-4">
          <AppHeaderSubnav />
          <LocaleSwitcher />
          <form method="POST" action="/api/app/disconnect" className="shrink-0">
            <button
              type="submit"
              title={
                isEdge()
                  ? "Clear session cookie"
                  : `Signed in as ${principal.displayLabel} — click to disconnect`
              }
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              {isEdge() ? "Disconnect" : "Exit"}
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}

