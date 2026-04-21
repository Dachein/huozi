"use client";

/**
 * Subscribes to real-time commit events for the signed-in user's workspace
 * and reacts according to the page's `mode`:
 *
 *   mode="workspace"  → router.refresh() on any commit (cheap; re-renders
 *                        the file-tree + welcome pane server-side).
 *   mode="file"       → router.refresh() when watchPath is in the commit's
 *                        paths; shows a small "Updated by Agent · Refresh"
 *                        banner as a visual confirmation.
 *   mode="history"    → router.refresh() on any commit (history page re-renders).
 *
 * Flow:
 *   1. fetch /api/cloud/ws-ticket → { ws_url }
 *   2. new WebSocket(ws_url); wait for "hello"
 *   3. on "commit" events → filter + dispatch
 *   4. auto-reconnect with backoff if the socket drops
 *
 * There is no polling fallback: if the WS stays offline we render a discreet
 * "Live sync offline" pill and otherwise stay out of the way.
 */

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export interface CommitPath {
  path: string;
  operation: string;
  before_blob_sha: string | null;
  after_blob_sha: string | null;
  bytes?: number;
}

export interface CommitEvent {
  type: "commit";
  workspace_id: string;
  commit_sha: string;
  parent_sha: string | null;
  timestamp: number;
  author: { id: string; type: "agent" | "user" | "system" };
  message: string;
  operation: string;
  paths: CommitPath[];
}

/** DOM event name other components can subscribe to for live commit events. */
export const HUOZI_LIVE_COMMIT_EVENT = "huozi-live-commit";

interface HelloEvent {
  type: "hello";
  workspace_id: string;
  principal_id: string;
  scope_path: string | null;
  ts: number;
}

type ServerEvent = CommitEvent | HelloEvent | { type: string };

export type LiveMode = "workspace" | "file" | "history";

export interface CloudLiveEventsProps {
  mode: LiveMode;
  /** Only used when mode === "file" — trigger the "file updated" banner only
   *  when the commit touches this path. */
  watchPath?: string;
}

export function CloudLiveEvents({ mode, watchPath }: CloudLiveEventsProps) {
  const router = useRouter();
  const [status, setStatus] = useState<"connecting" | "online" | "offline">(
    "connecting",
  );

  // Keep a mutable ref to the latest router.refresh so the stable WS effect
  // can reach into it without forcing reconnects on every render.
  const refreshRef = useRef(router.refresh);
  refreshRef.current = router.refresh;

  const watchPathRef = useRef(watchPath);
  watchPathRef.current = watchPath;

  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    let cancelled = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    function scheduleReconnect() {
      if (cancelled) return;
      attempt += 1;
      // 1s, 2s, 4s, 8s, … cap 30s
      const delay = Math.min(30000, 1000 * Math.pow(2, attempt - 1));
      reconnectTimer = setTimeout(connect, delay);
    }

    async function connect() {
      if (cancelled) return;
      setStatus((s) => (s === "online" ? "online" : "connecting"));

      let ticketRes: Response;
      try {
        ticketRes = await fetch("/api/cloud/ws-ticket", {
          cache: "no-store",
        });
      } catch {
        setStatus("offline");
        scheduleReconnect();
        return;
      }
      if (!ticketRes.ok) {
        // 401 = not signed in to cloud; give up quietly.
        if (ticketRes.status === 401) {
          setStatus("offline");
          return;
        }
        setStatus("offline");
        scheduleReconnect();
        return;
      }
      const body = (await ticketRes.json().catch(() => null)) as
        | { ok?: boolean; ws_url?: string }
        | null;
      if (!body?.ok || !body.ws_url) {
        setStatus("offline");
        scheduleReconnect();
        return;
      }

      try {
        ws = new WebSocket(body.ws_url);
      } catch {
        setStatus("offline");
        scheduleReconnect();
        return;
      }

      ws.addEventListener("open", () => {
        attempt = 0;
      });
      ws.addEventListener("close", () => {
        ws = null;
        if (!cancelled) {
          setStatus("offline");
          scheduleReconnect();
        }
      });
      ws.addEventListener("error", () => {
        // "close" will follow; let it handle reconnect.
      });

      ws.addEventListener("message", (ev) => {
        let event: ServerEvent;
        try {
          event = JSON.parse(ev.data as string) as ServerEvent;
        } catch {
          return;
        }
        if (event.type === "hello") {
          setStatus("online");
          return;
        }
        if (event.type !== "commit") return;
        const commit = event as CommitEvent;

        // Fan-out to any component subscribed via the DOM event bus
        // (e.g. the RecentPanel in the sidebar).
        try {
          window.dispatchEvent(
            new CustomEvent<CommitEvent>(HUOZI_LIVE_COMMIT_EVENT, {
              detail: commit,
            }),
          );
        } catch {
          /* ignore */
        }

        const touched = watchPathRef.current
          ? commit.paths.some((p) => p.path === watchPathRef.current)
          : false;

        const currentMode = modeRef.current;

        if (currentMode === "file") {
          // <LiveUpdateBanner> inside the FileView handles the user-facing
          // banner via the DOM event above. We only trigger a server refetch
          // when the currently-viewed file was touched.
          if (touched) {
            refreshRef.current();
          }
          return;
        }

        // workspace + history modes: refresh on any commit.
        refreshRef.current();
      });
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      }
    };
    // Intentional: we never want to tear down the WS on prop changes. The
    // refs above expose the latest mode / watchPath.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <StatusPill status={status} />;
}

function StatusPill({ status }: { status: "connecting" | "online" | "offline" }) {
  const map = {
    connecting: {
      label: "Connecting live sync…",
      cls: "border-border text-muted-foreground",
      dot: "bg-muted-foreground/60 animate-pulse",
    },
    online: {
      label: "Live",
      cls: "border-emerald-500/30 text-emerald-500",
      dot: "bg-emerald-500",
    },
    offline: {
      label: "Live sync offline",
      cls: "border-border text-muted-foreground",
      dot: "bg-muted-foreground/60",
    },
  };
  const { label, cls, dot } = map[status];
  return (
    <span
      className={`fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] bg-background/80 backdrop-blur ${cls}`}
      title={label}
      role="status"
      aria-live="polite"
    >
      <span className={`inline-block w-2 h-2 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

