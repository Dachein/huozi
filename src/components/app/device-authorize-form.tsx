"use client";

/**
 * Client-side Authorize / Deny for the device flow page.
 *
 * Keeps everything visible on one card:
 *   - Who's asking (client_name + agent_kind badge)
 *   - Which workspace they'll get access to (fixed in v1 — the user's
 *     primary workspace)
 *   - Who you are (email, as a reminder)
 *   - Two buttons: Deny · Authorize
 *
 * On success, shows a small "✓ Authorized" state with instructions to
 * close the tab / return to the Agent.
 */

import { useState } from "react";
import Link from "next/link";

interface Props {
  userCode: string;
  clientName: string | null;
  agentKind: string | null;
  workspace: { id: string; slug: string; name: string };
  userDisplay: string;
}

type Phase = "idle" | "submitting" | "authorized" | "denied" | "error";

function agentKindLabel(k: string | null): string {
  switch (k) {
    case "claude-code":
      return "Claude Code";
    case "cursor":
      return "Cursor";
    case "desktop":
      return "Claude Desktop";
    case "raw-curl":
      return "Terminal";
    case "other":
    case null:
    case undefined:
      return "Agent";
    default:
      return k;
  }
}

export function DeviceAuthorizeForm({
  userCode,
  clientName,
  agentKind,
  workspace,
  userDisplay,
}: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  async function act(action: "authorize" | "deny") {
    setPhase("submitting");
    setError(null);
    try {
      const res = await fetch(
        action === "authorize"
          ? "/api/app/device/authorize"
          : "/api/app/device/deny",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            user_code: userCode,
            workspace_id: workspace.id,
          }),
        },
      );
      const body = (await res.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
      };
      if (!res.ok || !body.ok) {
        setError(body.message || body.error || `HTTP ${res.status}`);
        setPhase("error");
        return;
      }
      setPhase(action === "authorize" ? "authorized" : "denied");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }

  const clientDisplay = clientName || "An Agent";
  const kindLabel = agentKindLabel(agentKind);

  if (phase === "authorized") {
    return (
      <TerminalCard
        title="Authorized"
        dotCls="bg-emerald-500"
        toneCls="border-emerald-500/30 bg-emerald-500/5"
      >
        <p>
          Your Agent should now have its key. Return to the terminal where
          you started the request — it will print a success line within a
          few seconds.
        </p>
        <p className="text-xs text-muted-foreground">
          You can close this tab.
        </p>
      </TerminalCard>
    );
  }

  if (phase === "denied") {
    return (
      <TerminalCard
        title="Denied"
        dotCls="bg-yellow-500"
        toneCls="border-yellow-500/30 bg-yellow-500/5"
      >
        <p>
          The Agent did not receive a key. If this was unexpected, re-run
          the command and try again.
        </p>
      </TerminalCard>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto px-6 py-12">
      <h1 className="font-serif text-3xl font-bold tracking-[0.08em] text-center mb-8">
        Authorize this device?
      </h1>

      <div className="rounded-xl border border-border bg-background p-6 space-y-5">
        <Row label="Client">
          <div className="flex items-center gap-2">
            <span className="font-medium">{clientDisplay}</span>
            <span className="text-[10px] uppercase tracking-wider rounded-full border border-border/70 px-2 py-0.5 text-muted-foreground">
              {kindLabel}
            </span>
          </div>
        </Row>

        <Row label="Workspace">
          <div>
            <div className="font-medium">{workspace.name}</div>
            <code className="text-xs text-muted-foreground font-mono">
              ws_{workspace.slug}
            </code>
          </div>
        </Row>

        <Row label="Authorizing as">
          <span className="text-sm text-muted-foreground">{userDisplay}</span>
        </Row>

        <Row label="Code">
          <code className="text-xs font-mono tracking-[0.2em] text-muted-foreground">
            {userCode}
          </code>
        </Row>

        <div className="pt-2 space-y-2 text-[11px] text-muted-foreground leading-relaxed border-t border-border/60 pt-4">
          <p>
            By authorizing, a workspace-scoped API key is minted for this
            Agent and delivered back to its local session. You can revoke
            the key any time from the Connected Agents panel on{" "}
            <Link
              href="/workspace"
              className="underline hover:text-foreground"
            >
              /workspace
            </Link>
            .
          </p>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mt-4 rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-500"
        >
          {error}
        </div>
      )}

      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={() => act("deny")}
          disabled={phase === "submitting"}
          className="flex-1 rounded-full border border-border px-4 py-2.5 text-sm hover:border-foreground/40 disabled:opacity-50"
        >
          Deny
        </button>
        <button
          type="button"
          onClick={() => act("authorize")}
          disabled={phase === "submitting"}
          className="flex-[2] rounded-full bg-foreground px-4 py-2.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
        >
          {phase === "submitting" ? "Authorizing…" : "Authorize"}
        </button>
      </div>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground mb-1">
        {label}
      </div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function TerminalCard({
  title,
  dotCls,
  toneCls,
  children,
}: {
  title: string;
  dotCls: string;
  toneCls: string;
  children: React.ReactNode;
}) {
  return (
    <div className="w-full max-w-md mx-auto px-6 py-16">
      <h1 className="font-serif text-3xl font-bold tracking-[0.08em] text-center mb-6">
        {title}
      </h1>
      <div
        className={`rounded-xl border ${toneCls} px-5 py-4 text-sm space-y-3`}
      >
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider">
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotCls}`} />
          <span>status</span>
        </div>
        <div className="space-y-2">{children}</div>
      </div>
      <div className="mt-6 text-center">
        <Link
          href="/workspace"
          className="text-xs text-muted-foreground hover:text-foreground underline"
        >
          Back to workspace
        </Link>
      </div>
    </div>
  );
}
