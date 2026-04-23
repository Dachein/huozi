"use client";

/**
 * Header user menu — left-anchored identity trigger.
 *
 * Trigger: `字 / <workspace-slug>` (or `字 huozi` pre-workspace). Clicking it
 * opens a dropdown with:
 *   - the signed-in principal label (email / admin)
 *   - a small 4-glyph locale picker
 *   - Exit (POSTs to /api/app/disconnect)
 *
 * This consolidates what used to live in three separate header elements
 * (workspace breadcrumb + LocaleSwitcher pill + "Exit" link) into one
 * Notion/Linear-style workspace-identity menu. Keeps the right side of the
 * header free for primary navigation.
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n/context";
import { COOKIE_NAME, type Locale, LOCALES } from "@/lib/i18n";
import { isEdge } from "@/lib/edition";
import type { Principal, Workspace } from "@/lib/identity";

interface LocaleInfo {
  glyph: string;
  native: string;
}

const INFO: Record<Locale, LocaleInfo> = {
  zh: { glyph: "中", native: "中文" },
  en: { glyph: "A", native: "English" },
  ja: { glyph: "あ", native: "日本語" },
  fr: { glyph: "F", native: "Français" },
};

export interface UserMenuProps {
  principal: Principal;
  workspace: Workspace | null;
}

export function UserMenu({ principal, workspace }: UserMenuProps) {
  const currentLocale = useLocale();
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const filesActive =
    pathname === "/workspace" ||
    pathname.startsWith("/workspace/view") ||
    pathname.startsWith("/workspace/history");
  const sharesActive = pathname.startsWith("/workspace/shares");

  // Close on outside click + ESC.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function chooseLocale(loc: Locale) {
    document.cookie = `${COOKIE_NAME}=${loc};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
    setOpen(false);
    router.refresh();
  }

  const exitLabel = isEdge() ? "Disconnect" : "Exit";
  const exitTitle = isEdge()
    ? "Clear session cookie"
    : `Signed in as ${principal.displayLabel} — click to disconnect`;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`group flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm
                   transition-colors min-w-0
                   ${open ? "bg-muted" : "hover:bg-muted/60"}`}
      >
        <span className="font-serif text-base font-bold text-accent leading-none shrink-0">
          字
        </span>
        {workspace ? (
          <>
            <span className="hidden sm:inline text-border">/</span>
            <span
              className="text-sm font-mono truncate text-muted-foreground group-hover:text-foreground max-w-[140px] sm:max-w-none"
              title={workspace.slug}
            >
              {workspace.slug}
            </span>
          </>
        ) : (
          <span className="text-sm text-muted-foreground group-hover:text-foreground">
            huozi
          </span>
        )}
        <svg
          viewBox="0 0 12 12"
          width="9"
          height="9"
          className={`opacity-50 transition-transform shrink-0 ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        >
          <path
            d="M2 4 L6 8 L10 4"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account menu"
          className="absolute left-0 top-full mt-1.5 w-[260px] z-40
                     rounded-md border border-border bg-background shadow-lg
                     animate-in fade-in slide-in-from-top-1 duration-150
                     overflow-hidden"
        >
          {/* Identity row */}
          <div className="px-3 py-2.5 border-b border-border/60">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
              Signed in
            </div>
            <div
              className="text-sm truncate font-mono"
              title={principal.displayLabel}
            >
              {principal.displayLabel}
            </div>
            {workspace && (
              <div className="text-xs text-muted-foreground mt-0.5">
                Workspace ·{" "}
                <span className="font-mono">{workspace.slug}</span>
              </div>
            )}
          </div>

          {/* Language row */}
          <div className="px-3 py-2 border-b border-border/60">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
              Language
            </div>
            <div className="flex gap-1">
              {LOCALES.map((loc) => {
                const active = loc === currentLocale;
                const rowInfo = INFO[loc];
                return (
                  <button
                    key={loc}
                    type="button"
                    onClick={() => chooseLocale(loc)}
                    title={rowInfo.native}
                    aria-label={rowInfo.native}
                    aria-pressed={active}
                    className={`flex-1 flex flex-col items-center gap-0.5 rounded-md px-2 py-1.5 transition-colors
                               ${
                                 active
                                   ? "bg-muted text-foreground"
                                   : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                               }`}
                  >
                    <span
                      className={`font-serif text-base leading-none ${
                        active ? "text-accent" : ""
                      }`}
                    >
                      {rowInfo.glyph}
                    </span>
                    <span className="text-[10px] truncate max-w-full">
                      {rowInfo.native}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Workspace section — Files is the primary view; Shares is
              the per-link management page. Key management lives inside
              the workspace StatusSummary (inline), so there is no
              dedicated Keys link anymore. Active-route highlighted. */}
          <nav className="py-1 border-b border-border/60">
            <NavRow
              href="/workspace"
              active={filesActive}
              onClick={() => setOpen(false)}
              icon={<span className="font-serif text-accent">云</span>}
              label="Files"
            />
            <NavRow
              href="/workspace/shares"
              active={sharesActive}
              onClick={() => setOpen(false)}
              icon={<span className="text-[13px]">↗</span>}
              label="Shares"
            />
          </nav>

          {/* huozi.app home */}
          <Link
            href="/"
            onClick={() => setOpen(false)}
            className="flex items-center justify-between px-3 py-2 text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors border-b border-border/60"
          >
            <span>huozi.app home</span>
            <span className="text-muted-foreground">↗</span>
          </Link>

          {/* Exit */}
          <form method="POST" action="/api/app/disconnect">
            <button
              type="submit"
              title={exitTitle}
              className="w-full flex items-center justify-between px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors text-left"
            >
              <span>{exitLabel}</span>
              <span className="text-xs opacity-60">→</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

interface NavRowProps {
  href: string;
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

function NavRow({ href, active, onClick, icon, label }: NavRowProps) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center gap-2.5 px-3 py-1.5 text-sm transition-colors
                 ${
                   active
                     ? "bg-muted/70 text-foreground font-medium"
                     : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                 }`}
    >
      <span className="w-4 text-center text-muted-foreground/70" aria-hidden>
        {icon}
      </span>
      <span>{label}</span>
    </Link>
  );
}
