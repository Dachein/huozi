"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/context";

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

const SCOPE_KEYS: Record<string, string> = {
  mcp: "auth.authorize.scope.mcp",
  read: "auth.authorize.scope.read",
  write: "auth.authorize.scope.write",
  share: "auth.authorize.scope.share",
};

// Hard ceiling for the label string; matches the cap the worker
// enforces in handleOauthApprove. 80 chars is "long enough for a folder
// path or project descriptor, short enough not to overflow the
// connections-list subtitle".
const LABEL_MAX_LEN = 80;

export function ConsentForm(props: Props) {
  const _ = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("");

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
            ...(action === "approve" && label.trim()
              ? { label: label.trim().slice(0, LABEL_MAX_LEN) }
              : {}),
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
          {_("auth.authorize.connectTitle").replace(
            "{client}",
            props.clientName,
          )}
        </h1>
        <p className="text-xs text-muted-foreground">
          {props.principalEmail}
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card/40 p-5 space-y-4 text-sm">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
            {_("auth.authorize.workspaceLabel")}
          </div>
          <div className="font-medium">{props.workspaceName}</div>
          <div className="text-xs text-muted-foreground font-mono">
            {props.workspaceSlug}
          </div>
        </div>

        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
            {_("auth.authorize.permissionsLabel")}
          </div>
          <ul className="text-xs space-y-1">
            {scopes.map((s) => (
              <li key={s}>• {SCOPE_KEYS[s] ? _(SCOPE_KEYS[s]) : s}</li>
            ))}
          </ul>
        </div>

        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
            {_("auth.authorize.tokenReturnsToLabel")}
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

        {/* Optional label — lets users distinguish multiple connections
            of the same agent kind in the workspace connections list.
            OAuth DCR doesn't carry project context (Claude Code uses a
            fixed `client_name` across all projects), so we ask here. */}
        <div>
          <label
            htmlFor="conn-label"
            className="block text-xs uppercase tracking-wider text-muted-foreground mb-1"
          >
            {_("auth.authorize.labelLabel")}
            <span className="ml-1 normal-case tracking-normal text-muted-foreground/70">
              {_("auth.authorize.labelOptional")}
            </span>
          </label>
          <input
            id="conn-label"
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={LABEL_MAX_LEN}
            disabled={busy}
            placeholder={_("auth.authorize.labelPlaceholder")}
            className="w-full text-sm bg-background border border-border rounded-md px-2.5 py-1.5
                       focus:outline-none focus:ring-1 focus:ring-foreground/40 disabled:opacity-50"
          />
          <p className="mt-1 text-[11px] text-muted-foreground/80">
            {_("auth.authorize.labelHint")}
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-end gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => submit("deny")}
          className="text-sm px-4 py-2 rounded-md text-muted-foreground hover:bg-muted/50 disabled:opacity-50 transition-colors"
        >
          {_("auth.authorize.deny")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => submit("approve")}
          className="text-sm px-4 py-2 rounded-md bg-foreground text-background hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {busy ? _("auth.authorize.processing") : _("auth.authorize.approve")}
        </button>
      </div>

      {error && (
        <p className="mt-3 text-xs text-destructive text-right">{error}</p>
      )}

      <p className="mt-6 text-[11px] text-muted-foreground/80 text-center leading-relaxed">
        {_("auth.authorize.tokenSecurity").replace(
          "{client}",
          props.clientName,
        )}
        <br />
        {_("auth.authorize.tokenContext")}
      </p>
    </div>
  );
}
