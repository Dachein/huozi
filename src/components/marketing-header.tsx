"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { LocaleGrid } from "@/components/locale-grid";
import { t, type Locale } from "@/lib/i18n";

export function MarketingHeader({ locale }: { locale: Locale }) {
  const _ = (key: string) => t(locale, key);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const links: Array<{ href: string; label: string }> = [
    { href: "/cloud", label: _("nav.cloud") },
    { href: "/edge", label: _("nav.edge") },
    { href: "/docs", label: _("nav.docs") },
    { href: "/blog", label: _("nav.blog") },
    { href: "/start", label: _("nav.getStarted") },
  ];

  return (
    <header className="relative border-b border-border/50">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
        <Link
          href="/"
          className="flex items-baseline gap-2 text-lg font-medium tracking-wide"
        >
          <span className="font-serif text-xl font-bold text-accent leading-none">
            字
          </span>
          {_("nav.home")}
        </Link>

        {/* Desktop nav (md+) */}
        <nav className="hidden md:flex items-center gap-6">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {l.label}
            </Link>
          ))}
          <span className="ml-2">
            <LocaleSwitcher placement="down" />
          </span>
        </nav>

        {/* Mobile hamburger (<md) */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Menu"
          aria-expanded={open}
          className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted/60 transition-colors"
        >
          {open ? (
            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
              <path
                d="M5 5 L15 15 M15 5 L5 15"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
              <path
                d="M3 6 L17 6 M3 10 L17 10 M3 14 L17 14"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile menu panel */}
      {open && (
        <div className="md:hidden border-t border-border/50 bg-background animate-in fade-in slide-in-from-top-1 duration-150">
          <nav className="mx-auto max-w-5xl px-6 py-4 flex flex-col">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {l.label}
              </Link>
            ))}
            <div className="mt-3 pt-3 border-t border-border/40">
              <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/80 mb-2">
                {_("nav.language")}
              </div>
              <LocaleGrid onPick={() => setOpen(false)} />
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
