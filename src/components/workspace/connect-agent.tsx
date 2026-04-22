"use client";

import { useState } from "react";

type AgentKind = "claude-code" | "cursor" | "desktop" | "other";

interface Device {
  kind: AgentKind;
  title: string;
  blurb: string;
  /** Build the "paste this" snippet once we know the API key. */
  snippet: (apiKey: string) => { lang: string; text: string };
  defaultLabel: string;
}

const CLOUD_MCP_URL = "https://cloud.huozi.app/mcp";

const DEVICES: Device[] = [
  {
    kind: "claude-code",
    title: "Claude Code",
    blurb:
      "Run this in a terminal. Claude Code will attach the workspace as a tool source.",
    defaultLabel: "Claude Code",
    snippet: (apiKey) => ({
      lang: "bash",
      text: `claude mcp add --transport http huozi ${CLOUD_MCP_URL} \\
  -H "Authorization: Bearer ${apiKey}"`,
    }),
  },
  {
    kind: "cursor",
    title: "Cursor",
    blurb:
      "Drop this into ~/.cursor/mcp.json (or your workspace-level .cursor/mcp.json).",
    defaultLabel: "Cursor",
    snippet: (apiKey) => ({
      lang: "json",
      text: JSON.stringify(
        {
          mcpServers: {
            huozi: {
              url: CLOUD_MCP_URL,
              headers: { Authorization: `Bearer ${apiKey}` },
            },
          },
        },
        null,
        2,
      ),
    }),
  },
  {
    kind: "desktop",
    title: "Claude Desktop",
    blurb:
      "Add to claude_desktop_config.json, then restart the app (uses mcp-remote).",
    defaultLabel: "Claude Desktop",
    snippet: (apiKey) => ({
      lang: "json",
      text: JSON.stringify(
        {
          mcpServers: {
            huozi: {
              command: "npx",
              args: [
                "-y",
                "mcp-remote",
                CLOUD_MCP_URL,
                "--header",
                `Authorization: Bearer ${apiKey}`,
              ],
            },
          },
        },
        null,
        2,
      ),
    }),
  },
  {
    kind: "other",
    title: "Raw HTTP (curl / scripts)",
    blurb: "Send JSON-RPC over HTTP with a Bearer token header.",
    defaultLabel: "Script",
    snippet: (apiKey) => ({
      lang: "bash",
      text: `curl -X POST ${CLOUD_MCP_URL} \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "content-type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`,
    }),
  },
];

interface Minted {
  api_key: string;
  key_id: string;
  label: string;
  kind: AgentKind;
}

export function ConnectAgent() {
  const [active, setActive] = useState<AgentKind | null>(null);
  const [label, setLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minted, setMinted] = useState<Minted | null>(null);
  const [copied, setCopied] = useState(false);

  function start(device: Device) {
    setActive(device.kind);
    setLabel(device.defaultLabel);
    setError(null);
    setMinted(null);
    setCopied(false);
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

  const activeDevice = DEVICES.find((d) => d.kind === active) ?? null;
  const snippet = activeDevice && minted
    ? activeDevice.snippet(minted.api_key)
    : null;

  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-2 gap-3">
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
              <div className="font-medium text-sm mb-1">{d.title}</div>
              <div className="text-xs text-muted-foreground leading-relaxed">
                {d.blurb}
              </div>
            </button>
          );
        })}
      </div>

      {activeDevice && !minted && (
        <form
          onSubmit={handleMint}
          className="rounded-lg border border-border p-4 space-y-3"
        >
          <div>
            <label
              htmlFor="label"
              className="block text-sm font-medium mb-2"
            >
              Label this key
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
            <p className="mt-1.5 text-xs text-muted-foreground">
              Shown on the Keys page so you can recognise it later (e.g.
              &ldquo;Laptop&rdquo;, &ldquo;CI runner&rdquo;).
            </p>
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
            {submitting ? "Generating..." : `Generate key for ${activeDevice.title}`}
          </button>
        </form>
      )}

      {minted && snippet && activeDevice && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4 space-y-4">
          <div>
            <div className="text-sm font-semibold mb-1">
              Key generated — copy this once.
            </div>
            <p className="text-xs text-muted-foreground">
              We never store the plaintext token. If you lose it, revoke the key
              on the{" "}
              <a href="/workspace/keys" className="underline">
                Keys
              </a>{" "}
              page and generate a new one.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {activeDevice.title} · {snippet.lang}
              </div>
              <button
                type="button"
                onClick={() => copySnippet(snippet.text)}
                className="text-xs rounded border border-border px-2 py-1 hover:border-foreground/40"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <pre className="rounded-md border border-border bg-background p-3 text-xs font-mono overflow-x-auto whitespace-pre">
              {snippet.text}
            </pre>
          </div>

          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Show raw API key
            </summary>
            <code className="mt-2 block rounded bg-background border border-border px-3 py-2 font-mono break-all">
              {minted.api_key}
            </code>
          </details>

          <div className="flex gap-2 pt-1">
            <a
              href="/workspace/keys"
              className="rounded-md border border-border px-3 py-1.5 text-xs hover:border-foreground/40"
            >
              Manage keys
            </a>
            <button
              type="button"
              onClick={() => {
                setMinted(null);
                setActive(null);
              }}
              className="rounded-md border border-border px-3 py-1.5 text-xs hover:border-foreground/40"
            >
              Generate another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
