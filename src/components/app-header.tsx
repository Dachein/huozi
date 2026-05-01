import { UserMenu, type WorkspaceOption } from "@/components/user-menu";
import type { Principal, Workspace } from "@/lib/identity";
import type { Theme } from "@/lib/theme";

/**
 * Compact app header — appears on every `/workspace/*` page.
 *
 * Deliberately minimal: the only interactive chrome is the left-anchored
 * UserMenu (Notion/Linear pattern). Files is implicit — landing on
 * /workspace IS the files view — so there's no top-level tab bar.
 * Shares and Keys are management pages; they live inside the UserMenu
 * because they're workspace-admin territory, not content modes.
 *
 * z-40 keeps the header above the workspace shell's mobile sub-strip.
 */
interface AppHeaderProps {
  principal: Principal;
  workspace: Workspace | null;
  /** All workspaces the user belongs to. UserMenu uses this to render
   *  a switcher (hidden when length ≤ 1). */
  memberships?: WorkspaceOption[];
  /** Active theme name; threaded down so the user menu's ThemeGrid
   *  knows which tile is currently selected without re-reading the
   *  cookie on the client. */
  theme: Theme;
}

export function AppHeader({
  principal,
  workspace,
  memberships,
  theme,
}: AppHeaderProps) {
  return (
    <header className="huozi-app-header border-b border-border/50 bg-background/95 backdrop-blur sticky top-0 z-40">
      <div className="flex h-[var(--shell-header-height)] items-center px-3 sm:px-4">
        <UserMenu
          principal={principal}
          workspace={workspace}
          memberships={memberships ?? []}
          theme={theme}
        />
      </div>
    </header>
  );
}
