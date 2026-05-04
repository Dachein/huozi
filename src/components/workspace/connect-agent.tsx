"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/lib/i18n/context";
import { AgentLogo } from "./agent-logo";

type AgentKind = "claude-code" | "cursor" | "openclaw";

interface Device {
  kind: AgentKind;
  /** Product name — never translated. */
  title: string;
  tagline: string;
  blurb: string;
  snippet: (apiKey: string) => { lang: string; text: string };
  defaultLabel: string;
}

const KEY_PLACEHOLDER = "hz_<paste-after-generating>";

const CLIENT_TITLES: Record<AgentKind, string> = {
  "claude-code": "Claude Code",
  cursor: "Cursor",
  openclaw: "OpenClaw",
};

function buildSnippet(
  kind: AgentKind,
  apiKey: string,
  mcpUrl: string,
): { lang: string; text: string } {
  switch (kind) {
    case "claude-code":
      return {
        lang: "bash",
        text: `claude mcp add --transport http huozi ${mcpUrl} \\
  -H "Authorization: Bearer ${apiKey}"`,
      };
    case "cursor":
      return {
        lang: "json",
        text: JSON.stringify(
          {
            mcpServers: {
              huozi: {
                url: mcpUrl,
                headers: { Authorization: `Bearer ${apiKey}` },
              },
            },
          },
          null,
          2,
        ),
      };
    case "openclaw":
      return {
        lang: "json",
        text: JSON.stringify(
          {
            mcp: {
              servers: {
                huozi: {
                  url: mcpUrl,
                  transport: "streamable-http",
                  headers: { Authorization: `Bearer ${apiKey}` },
                },
              },
            },
          },
          null,
          2,
        ),
      };
  }
}

interface Minted {
  api_key: string;
  key_id: string;
  label: string;
  kind: AgentKind;
}

export function ConnectAgent({ mcpUrl }: { mcpUrl: string }) {
  const t = useT();

  const DEVICES: Device[] = useMemo(
    () =>
      (Object.keys(CLIENT_TITLES) as AgentKind[]).map((kind) => ({
        kind,
        title: CLIENT_TITLES[kind],
        tagline: t(`connect.agent.${kind}.tagline`),
        blurb: t(`connect.agent.${kind}.blurb`),
        defaultLabel: CLIENT_TITLES[kind],
        snippet: (apiKey: string) => buildSnippet(kind, apiKey, mcpUrl),
      })),
    [t, mcpUrl],
  );

  const [active, setActive] = useState<AgentKind | null>(null);
  const [label, setLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minted, setMinted] = useState<Minted | null>(null);
  const [copied, setCopied] = useState(false);
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeDevice = DEVICES.find((d) => d.kind === active) ?? null;
  const previewKey = minted?.api_key ?? KEY_PLACEHOLDER;
  const snippet = activeDevice ? activeDevice.snippet(previewKey) : null;

  useEffect(() => {
    if (!minted || connectedAt !== null) return;
    let cancelled = false;
    const startedAt = Date.now();

    const poll = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(
          `/api/app/connections/status?key_id=${encodeURIComponent(minted.key_id)}`,
          { cache: "no-store" },
        );
        if (res.ok) {
          const body = (await res.json()) as { last_used_at?: number | null };
          if (!cancelled && body.last_used_at) {
            setConnectedAt(body.last_used_at);
            return;
          }
        }
      } catch {
        // swallow; try again
      }
      if (cancelled) return;
      if (Date.now() - startedAt > 15 * 60 * 1000) return;
      pollTimer.current = setTimeout(poll, 2500);
    };

    pollTimer.current = setTimeout(poll, 2500);
    return () => {
      cancelled = true;
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [minted, connectedAt]);

  function start(device: Device) {
    setActive(device.kind);
    setLabel(device.defaultLabel);
    setError(null);
    setMinted(null);
    setCopied(false);
    setConnectedAt(null);
  }

  async function handleMint(e: React.FormEvent) {
    e.preventDefault();
    if (!active || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/app/connections/mint", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: label.trim(), agent_kind: active }),
      });
      const body = (await res.json()) as {
        ok?: boolean;
        api_key?: string;
        key_id?: string;
        error?: string;
        message?: string;
      };
      if (!res.ok || !body.ok || !body.api_key || !body.key_id) {
        setError(body.message || body.error || `HTTP ${res.status}`);
        return;
      }
      setMinted({
        api_key: body.api_key,
        key_id: body.key_id,
        label: label.trim(),
        kind: active,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function copySnippet(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  function resetAll() {
    setActive(null);
    setMinted(null);
    setConnectedAt(null);
    setError(null);
    setCopied(false);
  }

  const title = activeDevice?.title ?? "";

  return (
    <div className="space-y-6">
      {/* Step 1 — pick client */}
      <div>
        <div className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          {t("connect.step1")}
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          {DEVICES.map((d) => {
            const isActive = active === d.kind;
            return (
              <button
                key={d.kind}
                type="button"
                onClick={() => start(d)}
                className={`text-left rounded-lg border p-4 transition-colors ${
                  isActive
                    ? "border-foreground/60 bg-muted/40"
                    : "border-border hover:border-foreground/30"
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <AgentLogo kind={d.kind} size={18} />
                  <div className="font-medium text-sm">{d.title}</div>
                </div>
                <div className="text-xs text-muted-foreground leading-relaxed">
                  {d.tagline}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Step 2 — snippet + generate */}
      {activeDevice && snippet && (
        <div>
          <div className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            {t("connect.step2").replace("{title}", title)}
          </div>

          <p className="mb-3 text-xs text-muted-foreground leading-relaxed">
            {activeDevice.blurb}
          </p>

          <div className="rounded-lg border border-border bg-background overflow-hidden">
            <div className="flex items-center justify-between border-b border-border/60 bg-muted/30 px-3 py-1.5">
              <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-serif">
                {activeDevice.title} · {snippet.lang}
              </div>
              <button
                type="button"
                disabled={!minted}
                onClick={() => minted && copySnippet(snippet.text)}
                className="text-xs rounded border border-border px-2 py-0.5 hover:border-foreground/40 disabled:opacity-40 disabled:cursor-not-allowed"
                title={minted ? "" : t("connect.generateFirst")}
              >
                {copied ? t("connect.copied") : t("connect.copy")}
              </button>
            </div>
            <pre className="p-3 text-xs font-mono overflow-x-auto whitespace-pre leading-relaxed">
              {snippet.text}
            </pre>
          </div>

          {!minted && (
            <form
              onSubmit={handleMint}
              className="mt-4 rounded-lg border border-border p-4 space-y-3"
            >
              <div>
                <label
                  htmlFor="label"
                  className="block text-xs font-medium mb-1.5 text-muted-foreground"
                >
                  {t("connect.label.title")}
                </label>
                <input
                  id="label"
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value.slice(0, 80))}
                  maxLength={80}
                  placeholder={activeDevice.defaultLabel}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:border-foreground/40"
                />
              </div>

              {error && (
                <div className="rounded-md border border-red-500/40 bg-red-500/5 px-3 py-2 text-xs">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={!label.trim() || submitting}
                className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              >
                {submitting
                  ? t("connect.generating")
                  : t("connect.generate").replace("{title}", title)}
              </button>
            </form>
          )}

          {minted && (
            <details className="mt-3 text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                {t("connect.rawKey.show")}
              </summary>
              <code className="mt-2 block rounded bg-background border border-border px-3 py-2 font-mono break-all">
                {minted.api_key}
              </code>
              <p className="mt-2 text-muted-foreground">
                {t("connect.rawKey.note")}
              </p>
            </details>
          )}
        </div>
      )}

      {/* Step 3 — waiting / confirmed */}
      {minted && activeDevice && (
        <div>
          <div className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            {t("connect.step3")}
          </div>

          {connectedAt === null ? (
            <div className="rounded-lg border border-border bg-muted/20 p-4">
              <div className="flex items-center gap-3">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-60" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-accent" />
                </span>
                <div>
                  <div className="text-sm font-medium">
                    {t("connect.waiting.title").replace("{title}", title)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {t("connect.waiting.desc")}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-green-500/40 bg-green-500/5 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-green-500/20 text-green-600 text-xs font-bold">
                  ✓
                </span>
                <div className="text-sm font-semibold">
                  {t("connect.done.title").replace("{title}", title)}
                </div>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t("connect.done.detected")}{" "}
                <code className="rounded bg-muted px-1">
                  {new Date(connectedAt * 1000).toLocaleTimeString()}
                </code>
                . {t("connect.done.note")}
              </p>
              <div className="flex gap-2">
                <a
                  href="/workspace"
                  className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
                >
                  {t("connect.done.goto")}
                </a>
                <button
                  type="button"
                  onClick={resetAll}
                  className="rounded-md border border-border px-3 py-1.5 text-xs hover:border-foreground/40"
                >
                  {t("connect.done.another")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
