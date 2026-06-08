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
 *   1. fetch /api/app/ws-ticket → { ws_url }
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

/** DOM event name for "a new Agent just used its key for the first time". */
export const HUOZI_LIVE_CONNECTION_EVENT = "huozi-live-connection";

/** DOM event name for WebSocket connection status updates. */
export const HUOZI_LIVE_STATUS_EVENT = "huozi-live-status";

export type LiveStatus = "connecting" | "online" | "offline";

export interface LiveStatusEvent {
  status: LiveStatus;
  label: string;
  tip: string;
}

export interface ConnectionEvent {
  type: "connection";
  action: "first_used";
  workspace_id: string;
  key_id: string;
  principal_id: string;
  principal_type: "user" | "agent" | "system";
  name: string | null;
  timestamp: number;
}

interface HelloEvent {
  type: "hello";
  workspace_id: string;
  principal_id: string;
  scope_path: string | null;
  ts: number;
}

type ServerEvent = CommitEvent | ConnectionEvent | HelloEvent | { type: string };

export type LiveMode = "workspace" | "file" | "history";

export interface CloudLiveEventsProps {
  mode: LiveMode;
  /** Only used when mode === "file" — trigger the "file updated" banner only
   *  when the commit touches this path. */
  watchPath?: string;
}

export function CloudLiveEvents({ mode, watchPath }: CloudLiveEventsProps) {
  const router = useRouter();
  const [status, setStatus] = useState<LiveStatus>("connecting");

  // Keep a mutable ref to the latest router.refresh so the stable WS effect
  // can reach into it without forcing reconnects on every render.
  const refreshRef = useRef(router.refresh);
  const watchPathRef = useRef(watchPath);
  const modeRef = useRef(mode);

  useEffect(() => {
    try {
      window.dispatchEvent(
        new CustomEvent<LiveStatusEvent>(HUOZI_LIVE_STATUS_EVENT, {
          detail: {
            status,
            ...LIVE_STATUS_COPY[status],
          },
        }),
      );
    } catch {
      /* ignore */
    }
  }, [status]);

  useEffect(() => {
    refreshRef.current = router.refresh;
    watchPathRef.current = watchPath;
    modeRef.current = mode;
  }, [mode, router.refresh, watchPath]);

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
        ticketRes = await fetch("/api/app/ws-ticket", {
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
        if (event.type === "connection") {
          // A new Agent just authenticated for the first time — refresh
          // the server components so StatusSummary reflects it, and fan
          // out via the DOM bus so any interested subscriber (future
          // toast, notification badge) can hook in.
          const conn = event as ConnectionEvent;
          try {
            window.dispatchEvent(
              new CustomEvent<ConnectionEvent>(HUOZI_LIVE_CONNECTION_EVENT, {
                detail: conn,
              }),
            );
          } catch {
            /* ignore */
          }
          refreshRef.current();
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
  }, []);

  return null;
}

const LIVE_STATUS_COPY: Record<LiveStatus, { label: string; tip: string }> = {
  connecting: {
    label: "Connecting",
    tip: "连接中",
  },
  online: {
    label: "Live",
    tip: "连接正常",
  },
  offline: {
    label: "Offline",
    tip: "连接断开",
  },
};
