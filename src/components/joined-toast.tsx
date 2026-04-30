"use client";

/**
 * Toast that fires when the user lands on /workspace after accepting an
 * invite. Read from `?joined=<slug>` and self-clears after a few seconds.
 *
 * The accept route handler (`/api/app/invites/[token]/accept`) appends
 * the param so the user gets explicit feedback that they joined — without
 * it, the redirect is indistinguishable from a normal page load.
 */

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useT } from "@/lib/i18n/context";
import { Icon } from "@/components/icon";

const TIMEOUT_MS = 4500;

export function JoinedToast() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const slug = params?.get("joined");
  const [visible, setVisible] = useState(false);
  const _ = useT();

  useEffect(() => {
    if (!slug) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), TIMEOUT_MS);
    // Strip the param once the user has seen it so a refresh doesn't re-fire.
    const stripTimer = setTimeout(() => {
      router.replace(pathname ?? "/workspace");
    }, 100);
    return () => {
      clearTimeout(t);
      clearTimeout(stripTimer);
    };
  }, [slug, pathname, router]);

  if (!slug || !visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-16 left-1/2 -translate-x-1/2 z-50
                 rounded-full border border-border bg-background/95 backdrop-blur
                 shadow-lg px-4 py-2 text-sm
                 animate-in fade-in slide-in-from-top-3 duration-300"
    >
      <Icon name="joined" className="text-accent mr-2" />
      {_("joined.toast")
        .split("{slug}")
        .map((chunk, i) => (
          <span key={i}>
            {chunk}
            {i === 0 && (
              <span className="font-mono text-foreground">{slug}</span>
            )}
          </span>
        ))}
    </div>
  );
}
