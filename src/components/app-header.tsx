import { UserMenu } from "@/components/user-menu";
import type { Principal, Workspace } from "@/lib/identity";

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
}

export function AppHeader({ principal, workspace }: AppHeaderProps) {
  return (
    <header className="border-b border-border/50 bg-background/95 backdrop-blur sticky top-0 z-40">
      <div className="flex h-12 items-center px-3 sm:px-4">
        <UserMenu principal={principal} workspace={workspace} />
      </div>
    </header>
  );
}
