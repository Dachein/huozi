"use client";

import Link from "next/link";
import { useState } from "react";
import {
  buildMcpSnippet,
  encodeConnectionLink,
  type ConnectionLinkPayload,
} from "@/lib/connection-link";

/**
 * Top-of-/workspace banner shown when the user has zero connected
 * Agents. Two display modes:
 *
 *   1. `mode="prompt"` — no api_key yet. Shows a CTA button to mint
 *      one (links to /workspace/connect, which already handles
 *      key minting). Used in the steady-state empty case.
 *
 *   2. `mode="ready"` — api_key already minted (passed in via prop).
 *      Shows two formats: the compact `hz_link_<base64>` token and
 *      the full mcp.json snippet, both with copy buttons.
 *
 * The component is keep-it-simple — no server interaction, just
 * presentational + clipboard helpers.
 */

interface PromptProps {
  mode: "prompt";
  connectHref: string; // typically "/workspace/connect"
}

interface ReadyProps {
  mode: "ready";
  payload: ConnectionLinkPayload;
}

type Props = PromptProps | ReadyProps;

export function ConnectBanner(props: Props) {
  if (props.mode === "prompt") {
    return <PromptBanner connectHref={props.connectHref} />;
  }
  return <ReadyBanner payload={props.payload} />;
}

function PromptBanner({ connectHref }: { connectHref: string }) {
  return (
    <div className="rounded-xl border border-accent/40 bg-accent/5 px-5 py-4">
      <div className="flex items-start gap-4">
        <div className="text-2xl leading-none mt-0.5">👋</div>
        <div className="flex-1">
          <h2 className="text-base font-semibold mb-1">
            Connect your first Agent
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            huozi runs as an MCP server you can plug into Claude Code,
            Cursor, or any other AI agent. Mint a connection key to get
            the one-line config snippet.
          </p>
        </div>
        <Link
          href={connectHref}
          className="shrink-0 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 transition-opacity"
        >
          Connect →
        </Link>
      </div>
    </div>
  );
}

function ReadyBanner({ payload }: { payload: ConnectionLinkPayload }) {
  const link = encodeConnectionLink(payload);
  const snippet = buildMcpSnippet(payload);
  const [tab, setTab] = useState<"link" | "snippet">("link");

  return (
    <div className="rounded-xl border border-accent/40 bg-accent/5 px-5 py-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="text-2xl leading-none mt-0.5">🔗</div>
        <div className="flex-1">
          <h2 className="text-base font-semibold mb-1">
            Connect your Agent
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Paste this into your AI client&apos;s MCP config, then
            restart it. The 16 huozi tools become available.
          </p>
        </div>
      </div>

      <div className="flex gap-1 text-xs">
        <button
          type="button"
          onClick={() => setTab("link")}
          className={`px-3 py-1.5 rounded-md font-medium ${
            tab === "link"
              ? "bg-foreground text-background"
              : "bg-muted text-muted-foreground hover:text-foreground"
          }`}
        >
          hz_link_ token
        </button>
        <button
          type="button"
          onClick={() => setTab("snippet")}
          className={`px-3 py-1.5 rounded-md font-medium ${
            tab === "snippet"
              ? "bg-foreground text-background"
              : "bg-muted text-muted-foreground hover:text-foreground"
          }`}
        >
          mcp.json snippet
        </button>
      </div>

      {tab === "link" ? (
        <CodeBlock content={link} oneLiner />
      ) : (
        <CodeBlock content={snippet} />
      )}

      <p className="text-xs text-muted-foreground leading-relaxed">
        Workspace: <code className="font-mono">{payload.ws}</code>{" "}
        · Edition: <code className="font-mono">{payload.ed}</code>{" "}
        · Endpoint: <code className="font-mono">{payload.ep}</code>
      </p>
    </div>
  );
}

function CodeBlock({
  content,
  oneLiner,
}: {
  content: string;
  oneLiner?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Older browsers / restricted contexts — fall back to manual select.
    }
  };
  return (
    <div className="relative">
      <pre
        className={`rounded-lg bg-muted px-4 py-3 text-xs font-mono overflow-x-auto ${
          oneLiner ? "whitespace-pre" : "whitespace-pre-wrap"
        }`}
      >
        <code>{content}</code>
      </pre>
      <button
        type="button"
        onClick={onCopy}
        className="absolute top-2 right-2 rounded-md bg-background/80 backdrop-blur px-2 py-1 text-xs font-medium border border-border hover:bg-background transition-colors"
        aria-label="Copy"
      >
        {copied ? "✓ copied" : "📋 copy"}
      </button>
    </div>
  );
}
