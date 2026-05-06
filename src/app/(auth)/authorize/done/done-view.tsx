"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/context";

interface Props {
  /** Localhost callback URL (with code + state) the OAuth client is
   *  listening on. We deliver the code to it via a hidden iframe so
   *  the user never leaves our branded done page. */
  to: string;
  clientName: string;
  workspaceName: string;
}

const COUNTDOWN_SECONDS = 3;
/** Failsafe: if iframe onload never fires (network issue, X-Frame-Options
 *  blocked, ad-blocker, …), still flip to "done" after this. The GET
 *  request to localhost has almost certainly reached Claude Code by then —
 *  localhost RTT is microseconds. */
const IFRAME_DONE_TIMEOUT_MS = 2500;

type Phase = "counting" | "triggering" | "done";

/** Belt-and-suspenders against URL injection — the worker already
 *  validated this URL, but the client is the last gate before we shove
 *  it into an iframe / window.location. We accept:
 *    - http: / https:                    (loopback or remote web callback)
 *    - private-use URI schemes           (RFC 8252, e.g. cursor://, com.x.app://)
 *  and explicitly deny schemes that could execute in-page if mishandled. */
function isSafeUrl(u: string): boolean {
  try {
    const parsed = new URL(u);
    const proto = parsed.protocol;
    if (proto === "http:" || proto === "https:") return true;
    const dangerous = new Set([
      "javascript:",
      "data:",
      "vbscript:",
      "file:",
      "about:",
      "blob:",
    ]);
    return !dangerous.has(proto);
  } catch {
    return false;
  }
}

/** Is the callback URL a local loopback (RFC 8252) — i.e. Claude Code
 *  / Cursor / Codex listening on localhost, not a remote host like
 *  claude.ai? Loopback callbacks need the hidden-iframe trick (we
 *  stay on huozi's branded page); remote callbacks need a real
 *  top-level navigation (the user's destination IS the remote host). */
function isLoopbackUrl(u: string): boolean {
  try {
    const parsed = new URL(u);
    return (
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "[::1]"
    );
  } catch {
    return false;
  }
}

export function AuthorizeDoneView({ to, clientName, workspaceName }: Props) {
  const _ = useT();
  const safe = isSafeUrl(to);
  // Two delivery modes:
  //   loopback (Claude Code / Cursor / Codex) — iframe GET to localhost,
  //     stay on this branded page. The user's "primary surface" is the
  //     terminal they came from; the browser is auxiliary.
  //   remote   (Cowork / Claude.ai web / Desktop > Connectors) — top-level
  //     navigation to the remote callback. The user's "primary surface"
  //     IS the browser; we have to send it home or they're stuck staring
  //     at huozi forever wondering where Claude went.
  const isRemote = safe && !isLoopbackUrl(to);

  const [phase, setPhase] = useState<Phase>(
    safe ? "counting" : "done", // bad URL → just show static done state
  );
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);

  // Phase 1: countdown.
  useEffect(() => {
    if (phase !== "counting") return;
    const tick = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    const fire = setTimeout(() => {
      setPhase("triggering");
    }, COUNTDOWN_SECONDS * 1000);
    return () => {
      clearInterval(tick);
      clearTimeout(fire);
    };
  }, [phase]);

  // Phase 2: deliver the code.
  //   remote   → top-level navigation; this page unloads. No failsafe
  //              needed — the browser carries the user away.
  //   loopback → iframe is in flight; failsafe flips to "done" if the
  //              iframe's onload never fires.
  useEffect(() => {
    if (phase !== "triggering") return;
    if (isRemote) {
      window.location.assign(to);
      return;
    }
    const t = setTimeout(() => setPhase("done"), IFRAME_DONE_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [phase, isRemote, to]);

  function handleIframeLoad() {
    // onload fires whether the iframe rendered the localhost response or
    // X-Frame-Options blocked it — either way, the GET reached Claude
    // Code's local server and the token exchange is in progress.
    if (phase === "triggering") setPhase("done");
  }

  function returnNow() {
    if (phase === "counting") setPhase("triggering");
  }

  return (
    <div className="relative w-full max-w-md mx-auto">
      {/* Same soft mist backdrop as /login so the auth surfaces feel
          like one continuous visual world. */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-10 h-48 pointer-events-none -z-10"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% 50%, var(--border), transparent)",
        }}
      />

      <div className="text-center">
        {/* Brand glyph — matches the 启 / 验 / 源 family used on the
            other auth surfaces. 成 = "成功 / 完成". */}
        <div className="mb-6 flex items-center justify-center gap-3" aria-hidden>
          <span className="block w-16 h-px bg-border" />
          <span className="font-serif text-base text-accent">成</span>
          <span className="block w-16 h-px bg-border" />
        </div>

        <CheckMark />

        <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-[0.08em] mt-6">
          {_("auth.authorize.done.heading").replace("{client}", clientName)}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {_("auth.authorize.done.workspaceLabel")} ·{" "}
          <span className="font-mono text-foreground">{workspaceName}</span>
        </p>

        <PhaseLine
          phase={phase}
          secondsLeft={secondsLeft}
          clientName={clientName}
          isRemote={isRemote}
          onReturnNow={returnNow}
        />

        <div className="mt-12 pt-6 border-t border-border/60">
          <p className="text-xs text-muted-foreground mb-2">
            {_("auth.authorize.done.openWorkspace")}
          </p>
          <Link
            href="/workspace"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium hover:text-accent transition-colors"
          >
            <span>{_("auth.authorize.done.viewWorkspace")}</span>
            <span aria-hidden>↗</span>
          </Link>
        </div>

        <p className="mt-10 text-[11px] text-muted-foreground/80 leading-relaxed">
          {_("auth.authorize.done.tokenSecurity").replace(
            "{client}",
            clientName,
          )}
          <br />
          {_("auth.authorize.done.tokenContext")}
        </p>
      </div>

      {/* Hidden iframe that delivers the auth code to Claude Code's
          localhost callback. We never need to render its response —
          the GET request reaching the server is what completes OAuth.
          Mounted only during/after the trigger phase so the request
          fires exactly once. Skipped for remote callbacks — those use
          a top-level navigation instead (the iframe trick fails for
          claude.ai because the parent window can't observe completion). */}
      {safe && !isRemote && phase !== "counting" && (
        <iframe
          src={to}
          onLoad={handleIframeLoad}
          // Position it so it's invisible but actually loads (some
          // browsers skip 0×0 iframes; we keep it 1×1 with opacity 0).
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            opacity: 0,
            border: 0,
            pointerEvents: "none",
          }}
          // sandbox is intentionally OMITTED — the iframe needs same-
          // origin cookie behaviour to be irrelevant (we're navigating
          // to a different origin) but we also don't want to disable
          // scripts on Claude Code's white page in case its detection
          // depends on JS. Default permissions are fine for a one-shot
          // GET that nobody sees.
          title="OAuth callback delivery"
          aria-hidden="true"
        />
      )}
    </div>
  );
}

/* ── Bottom status line — morphs across the three phases. ──────────── */

function PhaseLine({
  phase,
  secondsLeft,
  clientName,
  isRemote,
  onReturnNow,
}: {
  phase: Phase;
  secondsLeft: number;
  clientName: string;
  isRemote: boolean;
  onReturnNow: () => void;
}) {
  const _ = useT();

  // Wording diverges between the two delivery modes:
  //   loopback → "send token to <client>" (terminal lives elsewhere)
  //   remote   → "return to <client>" (browser is the destination)
  const buttonLabel = _(
    isRemote
      ? "auth.authorize.done.buttonRemote"
      : "auth.authorize.done.buttonLoopback",
  );

  if (phase === "counting") {
    const countingLine = _(
      isRemote
        ? "auth.authorize.done.countingRemote"
        : "auth.authorize.done.countingLoopback",
    )
      .replace("{seconds}", String(secondsLeft))
      .replace("{client}", clientName);
    return (
      <>
        <div className="mt-10 inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          <span>{countingLine}</span>
        </div>
        <div className="mt-3">
          <button
            type="button"
            onClick={onReturnNow}
            className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors"
          >
            {buttonLabel}
          </button>
        </div>
      </>
    );
  }
  if (phase === "triggering") {
    const triggeringLine = _(
      isRemote
        ? "auth.authorize.done.triggeringRemote"
        : "auth.authorize.done.triggeringLoopback",
    ).replace("{client}", clientName);
    return (
      <div className="mt-10 inline-flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner />
        <span>{triggeringLine}</span>
      </div>
    );
  }
  // done
  const doneLine = _(
    isRemote
      ? "auth.authorize.done.doneRemote"
      : "auth.authorize.done.doneLoopback",
  ).replace("{client}", clientName);
  return (
    <div className="mt-10 inline-flex items-center gap-2 text-sm font-medium text-accent">
      <span aria-hidden>✓</span>
      <span>{doneLine}</span>
    </div>
  );
}

function CheckMark() {
  return (
    <div
      className="mx-auto w-14 h-14 rounded-full flex items-center justify-center"
      style={{
        background:
          "radial-gradient(circle at 50% 50%, color-mix(in oklab, var(--accent) 20%, transparent) 0%, transparent 70%)",
      }}
    >
      <svg
        viewBox="0 0 32 32"
        width="36"
        height="36"
        className="text-accent"
        aria-hidden="true"
      >
        <circle
          cx="16"
          cy="16"
          r="14"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
          opacity="0.4"
        />
        <path
          d="M10 16.5 L14.5 21 L23 12"
          stroke="currentColor"
          strokeWidth="2.4"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function Spinner() {
  return (
    <span
      className="inline-block w-3 h-3 rounded-full border border-current border-t-transparent animate-spin"
      aria-hidden="true"
    />
  );
}
