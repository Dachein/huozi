"use client";

import { useState } from "react";

interface Props {
  sessionId: string;
  clientName: string;
  clientUri: string | null;
  scope: string | null;
  redirectUriHost: string;
  workspaceName: string;
  workspaceSlug: string;
  /** ws_<slug> form — what the worker expects when minting the access key. */
  workspaceId: string;
  principalEmail: string;
}

const SCOPE_LABELS: Record<string, string> = {
  mcp: "Read · Write · Share files in this workspace",
  read: "Read files in this workspace",
  write: "Write files in this workspace",
  share: "Create public share links",
};

export function ConsentForm(props: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scopes = (props.scope ?? "mcp").split(/\s+/).filter(Boolean);

  async function submit(action: "approve" | "deny") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        action === "approve"
          ? "/api/app/oauth/approve"
          : "/api/app/oauth/deny",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            session_id: props.sessionId,
            workspace_id: props.workspaceId,
          }),
        },
      );
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        redirect_url?: string;
        error?: string;
      };
      if (!res.ok || !body.ok || !body.redirect_url) {
        setError(body.error ?? `HTTP ${res.status}`);
        setBusy(false);
        return;
      }
      // Approve path: stop at our branded /authorize/done page so the
      // user sees a confirmation in our visual world (workspace name +
      // client + a 3 s countdown) before localhost takes over with its
      // generic "you can close this window" page. The done page then
      // navigates to redirect_url to give the OAuth client its code.
      //
      // Deny path: skip the celebration; just bounce straight back to
      // the client with the error params already encoded.
      if (action === "approve") {
        const params = new URLSearchParams({
          to: body.redirect_url,
          client: props.clientName,
          workspace: props.workspaceName,
        });
        window.location.href = `/authorize/done?${params.toString()}`;
      } else {
        window.location.href = body.redirect_url;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="text-center mb-6">
        <h1 className="font-serif text-2xl font-bold tracking-[0.08em] mb-1">
          连接 {props.clientName}
        </h1>
        <p className="text-xs text-muted-foreground">
          {props.principalEmail}
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card/40 p-5 space-y-4 text-sm">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
            将访问的工作区
          </div>
          <div className="font-medium">{props.workspaceName}</div>
          <div className="text-xs text-muted-foreground font-mono">
            {props.workspaceSlug}
          </div>
        </div>

        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
            权限
          </div>
          <ul className="text-xs space-y-1">
            {scopes.map((s) => (
              <li key={s}>• {SCOPE_LABELS[s] ?? s}</li>
            ))}
          </ul>
        </div>

        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
            令牌将返回到
          </div>
          <div className="text-xs font-mono text-muted-foreground">
            {props.redirectUriHost}
          </div>
        </div>

        {props.clientUri && (
          <div className="text-xs text-muted-foreground">
            <a
              href={props.clientUri}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              {props.clientUri}
            </a>
          </div>
        )}
      </div>

      <div className="mt-5 flex items-center justify-end gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => submit("deny")}
          className="text-sm px-4 py-2 rounded-md text-muted-foreground hover:bg-muted/50 disabled:opacity-50 transition-colors"
        >
          拒绝
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => submit("approve")}
          className="text-sm px-4 py-2 rounded-md bg-foreground text-background hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {busy ? "处理中…" : "授权"}
        </button>
      </div>

      {error && (
        <p className="mt-3 text-xs text-destructive text-right">{error}</p>
      )}

      <p className="mt-6 text-[11px] text-muted-foreground/80 text-center leading-relaxed">
        授权后，{props.clientName} 将获得短期 access token（1 小时）+ 可吊销的 refresh token。
        <br />
        token 由 MCP 客户端持有，不进入对话上下文。
      </p>
    </div>
  );
}
