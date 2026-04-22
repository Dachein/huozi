"use client";

/**
 * Client-side active-state indicator for the app header's subnav.
 * Kept as a thin client component so the surrounding AppHeader can stay
 * an RSC (loads identity + renders from server).
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AppHeaderSubnav() {
  const pathname = usePathname() ?? "";

  const filesActive =
    pathname === "/workspace" ||
    pathname.startsWith("/workspace/view") ||
    pathname.startsWith("/workspace/history");
  const sharesActive = pathname.startsWith("/workspace/shares");
  const keysActive =
    pathname.startsWith("/workspace/keys") ||
    pathname.startsWith("/workspace/connect");

  return (
    <>
      <Item href="/workspace" active={filesActive}>
        Files
      </Item>
      <Item href="/workspace/shares" active={sharesActive}>
        Shares
      </Item>
      <Item href="/workspace/keys" active={keysActive}>
        Keys
      </Item>
    </>
  );
}

function Item({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`text-sm transition-colors ${
        active
          ? "text-foreground font-medium"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}
