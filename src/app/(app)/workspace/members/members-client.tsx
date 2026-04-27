"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/context";

interface Member {
  user_id: string;
  email: string;
  display_name: string | null;
  role: string;
  joined_at: number;
}
interface Invite {
  id: string;
  email: string;
  role: string;
  created_at: number;
  expires_at: number;
}
interface KeyRow {
  key_id: string;
  name: string | null;
  created_at: number;
  last_used_at: number | null;
  expires_at: number | null;
  ttl_seconds: number | null;
  principal_type: string;
}

const KIND_PREFIX = /^\[([a-z-]+)\]\s*/;
function parseKeyName(raw: string | null): {
  label: string;
  kind: string;
} {
  if (!raw) return { label: "(unnamed)", kind: "other" };
  const m = raw.match(KIND_PREFIX);
  if (m) return { label: raw.slice(m[0].length) || "(unnamed)", kind: m[1]! };
  return { label: raw, kind: "other" };
}

function relativeTime(ms: number | null): string {
  if (!ms) return "—";
  const diff = Date.now() - ms;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function MembersClient({
  currentUserId,
  isOwner,
  initialMembers,
  initialInvites,
  keysByUser,
}: {
  currentUserId: string;
  isOwner: boolean;
  initialMembers: Member[];
  initialInvites: Invite[];
  keysByUser: Record<string, KeyRow[]>;
}) {
  const _ = useT();
  const [members, setMembers] = useState(initialMembers);
  const [invites, setInvites] = useState(initialInvites);
  const [keys, setKeys] = useState(keysByUser);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function toggleExpanded(userId: string) {
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function translateError(code: string): string {
    const key = `members.error.${code}`;
    const translated = _(key);
    return translated === key ? code : translated;
  }

  async function refresh() {
    const [mRes, iRes, kRes] = await Promise.all([
      fetch("/api/app/members"),
      fetch("/api/app/invites"),
      fetch("/api/app/members/keys"),
    ]);
    if (mRes.ok) {
      const j = (await mRes.json()) as { members: Member[] };
      setMembers(j.members);
    }
    if (iRes.ok) {
      const j = (await iRes.json()) as { invites: Invite[] };
      setInvites(j.invites);
    }
    if (kRes.ok) {
      const j = (await kRes.json()) as {
        keysByUser: Record<string, KeyRow[]>;
      };
      setKeys(j.keysByUser);
    }
  }

  async function handleRevokeKey(keyId: string) {
    if (!confirm(_("members.keys.revokeConfirm"))) return;
    startTransition(async () => {
      const res = await fetch("/api/app/connections/revoke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key_id: keyId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(translateError(body.error ?? "remove_failed"));
        return;
      }
      await refresh();
      router.refresh();
    });
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!email.trim()) return;
    startTransition(async () => {
      const res = await fetch("/api/app/invites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(translateError(body.error ?? "invite_failed"));
        return;
      }
      setEmail("");
      await refresh();
      router.refresh();
    });
  }

  async function handleRemove(userId: string) {
    if (!confirm(_("members.list.removeConfirm"))) return;
    startTransition(async () => {
      const res = await fetch(
        `/api/app/members?user_id=${encodeURIComponent(userId)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(translateError(body.error ?? "remove_failed"));
        return;
      }
      await refresh();
      router.refresh();
    });
  }

  async function handleRevoke(token: string) {
    if (!confirm(_("members.invites.revokeConfirm"))) return;
    startTransition(async () => {
      const res = await fetch(
        `/api/app/invites?token=${encodeURIComponent(token)}`,
        { method: "DELETE" },
      );
      if (!res.ok) return;
      await refresh();
      router.refresh();
    });
  }

  return (
    <div className="space-y-10">
      {error && (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
        >
          {error}
        </div>
      )}

      {isOwner && (
        <section>
          <h2 className="text-xs uppercase tracking-[0.15em] text-muted-foreground mb-3">
            {_("members.invite.heading")}
          </h2>
          <form onSubmit={handleInvite} className="flex gap-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={_("members.invite.placeholder")}
              className="flex-1 border-0 border-b border-border bg-transparent px-0 py-2 focus:outline-none focus:border-foreground/60"
            />
            <button
              type="submit"
              disabled={pending}
              className="rounded-full bg-foreground text-background px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-40"
            >
              {pending
                ? _("members.invite.submitting")
                : _("members.invite.submit")}
            </button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">
            {_("members.invite.note")}
          </p>
        </section>
      )}

      <section>
        <h2 className="text-xs uppercase tracking-[0.15em] text-muted-foreground mb-3">
          {_("members.list.heading").replace("{count}", String(members.length))}
        </h2>
        <ul className="divide-y divide-border/40">
          {members.map((m) => {
            const userKeys = keys[m.user_id] ?? [];
            const canExpand =
              userKeys.length > 0 &&
              (isOwner || m.user_id === currentUserId);
            const isExpanded = expanded.has(m.user_id);
            return (
              <li key={m.user_id}>
                <div className="py-3 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => canExpand && toggleExpanded(m.user_id)}
                    disabled={!canExpand}
                    className="flex-1 min-w-0 flex items-center gap-2 text-left disabled:cursor-default"
                  >
                    {canExpand && (
                      <span
                        aria-hidden
                        className={`text-xs text-muted-foreground transition-transform ${
                          isExpanded ? "rotate-90" : ""
                        }`}
                      >
                        ▸
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">
                        {m.display_name || m.email}
                        {m.user_id === currentUserId && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {_("members.list.you")}
                          </span>
                        )}
                      </span>
                      {m.display_name && (
                        <span className="block text-xs text-muted-foreground truncate">
                          {m.email}
                        </span>
                      )}
                      {canExpand && (
                        <span className="block text-xs text-muted-foreground/70">
                          {_("members.keys.summary").replace(
                            "{count}",
                            String(userKeys.length),
                          )}
                        </span>
                      )}
                    </span>
                  </button>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground">
                      {m.role === "owner"
                        ? _("members.role.owner")
                        : _("members.role.member")}
                    </span>
                    {isOwner &&
                      m.user_id !== currentUserId &&
                      m.role !== "owner" && (
                        <button
                          type="button"
                          onClick={() => handleRemove(m.user_id)}
                          disabled={pending}
                          className="text-xs text-destructive hover:underline disabled:opacity-40"
                        >
                          {_("members.list.remove")}
                        </button>
                      )}
                  </div>
                </div>
                {isExpanded && userKeys.length > 0 && (
                  <ul className="ml-6 mb-3 border-l border-border/40 pl-4 space-y-2">
                    {userKeys.map((k) => {
                      const { label, kind } = parseKeyName(k.name);
                      const canRevoke =
                        m.user_id === currentUserId || isOwner;
                      return (
                        <li
                          key={k.key_id}
                          className="py-1.5 flex items-center justify-between gap-3 text-sm"
                        >
                          <div className="min-w-0">
                            <p className="truncate">
                              <span className="text-xs text-muted-foreground font-mono mr-2">
                                [{kind}]
                              </span>
                              {label}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {_("members.keys.lastUsed").replace(
                                "{rel}",
                                k.last_used_at
                                  ? relativeTime(k.last_used_at)
                                  : _("members.keys.neverUsed"),
                              )}
                            </p>
                          </div>
                          {canRevoke && (
                            <button
                              type="button"
                              onClick={() => handleRevokeKey(k.key_id)}
                              disabled={pending}
                              className="text-xs text-destructive hover:underline disabled:opacity-40 shrink-0"
                            >
                              {_("members.keys.revoke")}
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {isOwner && invites.length > 0 && (
        <section>
          <h2 className="text-xs uppercase tracking-[0.15em] text-muted-foreground mb-3">
            {_("members.invites.heading").replace(
              "{count}",
              String(invites.length),
            )}
          </h2>
          <ul className="divide-y divide-border/40">
            {invites.map((inv) => (
              <li
                key={inv.id}
                className="py-3 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="truncate">{inv.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {_("members.invites.expires").replace(
                      "{date}",
                      new Date(inv.expires_at).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      }),
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRevoke(inv.id)}
                  disabled={pending}
                  className="text-xs text-destructive hover:underline disabled:opacity-40 shrink-0"
                >
                  {_("members.invites.revoke")}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
