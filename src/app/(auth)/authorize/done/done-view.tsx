"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

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

/** Allow only http(s) navigation. Belt-and-suspenders against URL
 *  injection — the worker already validated this URL, but the client
 *  is the last gate before we shove it into an iframe. */
function isSafeUrl(u: string): boolean {
  try {
    const parsed = new URL(u);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function AuthorizeDoneView({ to, clientName, workspaceName }: Props) {
  const [phase, setPhase] = useState<Phase>(
    isSafeUrl(to) ? "counting" : "done", // bad URL → just show static done state
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

  // Phase 2: iframe is in flight. Failsafe timer in case onload never fires.
  useEffect(() => {
    if (phase !== "triggering") return;
    const t = setTimeout(() => setPhase("done"), IFRAME_DONE_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [phase]);

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
          已连接 {clientName}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          工作区 ·{" "}
          <span className="font-mono text-foreground">{workspaceName}</span>
        </p>

        <PhaseLine
          phase={phase}
          secondsLeft={secondsLeft}
          clientName={clientName}
          onReturnNow={returnNow}
        />

        <div className="mt-12 pt-6 border-t border-border/60">
          <p className="text-xs text-muted-foreground mb-2">或者打开工作区</p>
          <Link
            href="/workspace"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium hover:text-accent transition-colors"
          >
            <span>查看工作区</span>
            <span aria-hidden>↗</span>
          </Link>
        </div>

        <p className="mt-10 text-[11px] text-muted-foreground/80 leading-relaxed">
          授权令牌由 {clientName} 持有，不会进入对话上下文。
          <br />
          可在工作区"已连接 Agent"中随时吊销。
        </p>
      </div>

      {/* Hidden iframe that delivers the auth code to Claude Code's
          localhost callback. We never need to render its response —
          the GET request reaching the server is what completes OAuth.
          Mounted only during/after the trigger phase so the request
          fires exactly once. */}
      {isSafeUrl(to) && phase !== "counting" && (
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
  onReturnNow,
}: {
  phase: Phase;
  secondsLeft: number;
  clientName: string;
  onReturnNow: () => void;
}) {
  if (phase === "counting") {
    return (
      <>
        <div className="mt-10 inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          <span>{secondsLeft} 秒后向 {clientName} 发送令牌…</span>
        </div>
        <div className="mt-3">
          <button
            type="button"
            onClick={onReturnNow}
            className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors"
          >
            立即发送
          </button>
        </div>
      </>
    );
  }
  if (phase === "triggering") {
    return (
      <div className="mt-10 inline-flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner />
        <span>正在向 {clientName} 写入令牌…</span>
      </div>
    );
  }
  // done
  return (
    <div className="mt-10 inline-flex items-center gap-2 text-sm font-medium text-accent">
      <span aria-hidden>✓</span>
      <span>令牌已发送，可返回 {clientName} 终端继续</span>
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
