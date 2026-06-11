"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  Clipboard,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";

const TEST_TTL_SECONDS = 15 * 60;

interface Props {
  mcpUrl: string;
  workspaceName: string;
}

interface MintResponse {
  ok?: boolean;
  key_id?: string;
  api_key?: string;
  label?: string;
  error?: string;
  message?: string;
}

interface TtlResponse {
  ok?: boolean;
  key_id?: string;
  ttl_seconds?: number | null;
  expires_at?: number | null;
  error?: string;
  message?: string;
}

interface IssuedKey {
  keyId: string;
  apiKey: string;
  label: string;
  mintedAt: number;
  expiresAt: number | null;
  ttlApplied: boolean;
  ttlWarning: string | null;
  revoked: boolean;
}

export function TestKeyClient({ mcpUrl, workspaceName }: Props) {
  const [issued, setIssued] = useState<IssuedKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const snippets = useMemo(() => {
    if (!issued) return null;
    const whoamiBody = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "huozi_whoami", arguments: {} },
    });
    const openBody = JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "huozi_open",
        arguments: {
          file_path: "path/to/preview.html",
          expires_in_seconds: TEST_TTL_SECONDS,
        },
      },
    });

    return {
      exportKey: `export HUOZI_API_KEY=${quoteShell(issued.apiKey)}`,
      whoami: [
        `curl -sS ${mcpUrl} \\`,
        '  -H "Authorization: Bearer $HUOZI_API_KEY" \\',
        '  -H "content-type: application/json" \\',
        `  --data ${quoteShell(whoamiBody)}`,
      ].join("\n"),
      open: [
        `curl -sS ${mcpUrl} \\`,
        '  -H "Authorization: Bearer $HUOZI_API_KEY" \\',
        '  -H "content-type: application/json" \\',
        `  --data ${quoteShell(openBody)}`,
      ].join("\n"),
    };
  }, [issued, mcpUrl]);

  async function mintKey() {
    setBusy(true);
    setError(null);
    setNotice(null);

    const label = `o-preview-test ${new Date().toISOString().slice(0, 19)}Z`;
    try {
      const res = await fetch("/api/app/connections/mint", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label, agent_kind: "raw-curl" }),
      });
      const body = await readJson<MintResponse>(res);
      if (!res.ok || !body.ok || !body.key_id || !body.api_key) {
        throw new Error(
          body.message || body.error || `Mint failed: ${res.status}`,
        );
      }

      let expiresAt: number | null = null;
      let ttlApplied = false;
      let ttlWarning: string | null = null;

      const ttlRes = await fetch("/api/app/connections/update-ttl", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          key_id: body.key_id,
          ttl_seconds: TEST_TTL_SECONDS,
        }),
      });
      const ttlBody = await readJson<TtlResponse>(ttlRes);
      if (ttlRes.ok && ttlBody.ok) {
        ttlApplied = true;
        expiresAt =
          typeof ttlBody.expires_at === "number"
            ? ttlBody.expires_at
            : Date.now() + TEST_TTL_SECONDS * 1000;
      } else {
        ttlWarning =
          ttlBody.message ||
          ttlBody.error ||
          `TTL update failed: ${ttlRes.status}`;
      }

      setIssued({
        keyId: body.key_id,
        apiKey: body.api_key,
        label: body.label || label,
        mintedAt: Date.now(),
        expiresAt,
        ttlApplied,
        ttlWarning,
        revoked: false,
      });
      setNotice(
        ttlApplied
          ? "Test key minted with a 15-minute inactivity TTL."
          : "Test key minted, but the 15-minute TTL update did not stick.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function revokeKey() {
    if (!issued || issued.revoked) return;
    setRevoking(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/app/connections/revoke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key_id: issued.keyId }),
      });
      const body = await readJson<{
        ok?: boolean;
        error?: string;
        message?: string;
      }>(res);
      if (!res.ok || !body.ok) {
        throw new Error(
          body.message || body.error || `Revoke failed: ${res.status}`,
        );
      }
      setIssued((prev) => (prev ? { ...prev, revoked: true } : prev));
      setNotice("Test key revoked.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRevoking(false);
    }
  }

  async function copy(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopied(id);
    window.setTimeout(() => {
      setCopied((current) => (current === id ? null : current));
    }, 1800);
  }

  const keyState = issued
    ? issued.revoked
      ? "Revoked"
      : issued.ttlApplied
        ? `Expires after 15 minutes of inactivity${
            issued.expiresAt ? `, around ${formatDateTime(issued.expiresAt)}` : ""
          }`
        : "Active, but TTL update needs attention"
    : "No test key minted yet";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <div className="text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
            Internal test utility
          </div>
          <h1 className="font-serif text-2xl font-bold tracking-[0.03em] text-foreground">
            15-minute API key
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Mint a short-lived key for the current workspace, then use it to
            exercise MCP calls such as{" "}
            <code className="font-mono">huozi_open</code> and the mini-program{" "}
            <code className="font-mono">/o</code> preview flow.
          </p>
        </div>
        <button
          type="button"
          onClick={mintKey}
          disabled={busy}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? (
            <RefreshCw size={16} className="animate-spin" />
          ) : (
            <KeyRound size={16} />
          )}
          {busy ? "Minting..." : "Mint test key"}
        </button>
      </div>

      <section className="rounded-md border border-border/70 bg-muted/25 p-4 sm:p-5">
        <div className="grid gap-4 md:grid-cols-[1fr_1.25fr]">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <ShieldCheck size={16} />
              Current scope
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Workspace</dt>
                <dd className="truncate font-mono text-xs text-foreground">
                  {workspaceName}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">TTL</dt>
                <dd className="font-mono text-xs text-foreground">900s</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">MCP endpoint</dt>
                <dd className="truncate font-mono text-xs text-foreground">
                  {mcpUrl}
                </dd>
              </div>
            </dl>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-foreground">Status</div>
              {issued && !issued.revoked && (
                <button
                  type="button"
                  onClick={revokeKey}
                  disabled={revoking}
                  className="inline-flex items-center gap-1.5 rounded-md border border-red-500/40 px-2.5 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Trash2 size={13} />
                  {revoking ? "Revoking..." : "Revoke"}
                </button>
              )}
            </div>
            <div className="rounded-md border border-border bg-background px-3 py-2 text-sm">
              <div className="font-medium text-foreground">{keyState}</div>
              {issued && (
                <div className="mt-1 font-mono text-xs text-muted-foreground">
                  {issued.keyId} - {formatDateTime(issued.mintedAt)}
                </div>
              )}
            </div>
            {notice && (
              <p className="text-sm text-emerald-600 dark:text-emerald-400">
                {notice}
              </p>
            )}
            {(error || issued?.ttlWarning) && (
              <p className="flex items-start gap-2 text-sm text-red-600">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                <span>{error || issued?.ttlWarning}</span>
              </p>
            )}
          </div>
        </div>
      </section>

      {issued && (
        <section className="space-y-4">
          <Snippet
            copied={copied === "key"}
            label="Plaintext key"
            text={issued.apiKey}
            onCopy={() => copy("key", issued.apiKey)}
            danger
          />

          {snippets && (
            <>
              <Snippet
                copied={copied === "export"}
                label="Shell export"
                text={snippets.exportKey}
                onCopy={() => copy("export", snippets.exportKey)}
              />
              <Snippet
                copied={copied === "whoami"}
                label="whoami check"
                text={snippets.whoami}
                onCopy={() => copy("whoami", snippets.whoami)}
              />
              <Snippet
                copied={copied === "open"}
                label="/o preview mint"
                text={snippets.open}
                onCopy={() => copy("open", snippets.open)}
              />
            </>
          )}
        </section>
      )}
    </div>
  );
}

function Snippet({
  label,
  text,
  copied,
  onCopy,
  danger = false,
}: {
  label: string;
  text: string;
  copied: boolean;
  onCopy: () => void;
  danger?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </div>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
        >
          {copied ? <Check size={13} /> : <Clipboard size={13} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre
        className={`overflow-x-auto whitespace-pre-wrap break-all rounded-md border px-3 py-3 text-xs leading-5 ${
          danger
            ? "border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100"
            : "border-border bg-background text-foreground"
        }`}
      >
        <code>{text}</code>
      </pre>
    </div>
  );
}

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return { message: text } as T;
  }
}

function quoteShell(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString();
}
