"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/context";
import { useConfirm } from "@/components/confirm-provider";

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
  const ask = useConfirm();
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
    const ok = await ask({
      title: _("confirm.revokeKey.title"),
      body: _("members.keys.revokeConfirm"),
      warning: _("confirm.revokeKey.warning"),
      actionLabel: _("confirm.revokeKey.action"),
      cancelLabel: _("confirm.cancel"),
      tone: "danger",
    });
    if (!ok) return;
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
    const ok = await ask({
      title: _("confirm.removeMember.title"),
      body: _("confirm.removeMember.body"),
      actionLabel: _("confirm.removeMember.action"),
      cancelLabel: _("confirm.cancel"),
      tone: "danger",
    });
    if (!ok) return;
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
    const ok = await ask({
      title: _("confirm.cancelInvite.title"),
      body: _("confirm.cancelInvite.body"),
      actionLabel: _("confirm.cancelInvite.action"),
      cancelLabel: _("confirm.cancel"),
      tone: "danger",
    });
    if (!ok) return;
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
              className="huozi-button-primary rounded-md bg-foreground text-background px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-40"
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
        <div className="huozi-card rounded-lg border border-border/60">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted-foreground border-b border-border/60">
              <tr>
                <th className="text-left px-4 py-2 font-medium">
                  {_("members.col.email")}
                </th>
                <th className="text-left px-4 py-2 font-medium">
                  {_("members.col.keys")}
                </th>
                <th className="text-left px-4 py-2 font-medium">
                  {_("members.col.role")}
                </th>
                <th className="text-right px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const userKeys = keys[m.user_id] ?? [];
                const canExpand =
                  userKeys.length > 0 &&
                  (isOwner || m.user_id === currentUserId);
                const isExpanded = expanded.has(m.user_id);
                const canRemove =
                  isOwner &&
                  m.user_id !== currentUserId &&
                  m.role !== "owner";
                return (
                  <Fragment key={m.user_id}>
                    <tr className="border-t border-border/60 align-top">
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() =>
                            canExpand && toggleExpanded(m.user_id)
                          }
                          disabled={!canExpand}
                          className="flex items-start gap-2 text-left min-w-0 disabled:cursor-default"
                        >
                          {canExpand && (
                            <span
                              aria-hidden
                              className={`mt-1 text-xs text-muted-foreground transition-transform ${
                                isExpanded ? "rotate-90" : ""
                              }`}
                            >
                              ▸
                            </span>
                          )}
                          <span className="min-w-0">
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
                          </span>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-xs tabular-nums text-muted-foreground">
                        {userKeys.length}
                      </td>
                      <td className="px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground">
                        {m.role === "owner"
                          ? _("members.role.owner")
                          : _("members.role.member")}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {canRemove && (
                          <button
                            type="button"
                            onClick={() => handleRemove(m.user_id)}
                            disabled={pending}
                            className="huozi-button-danger text-xs rounded border border-destructive/40 text-destructive px-2 py-1 hover:bg-destructive/10 disabled:opacity-40 transition-colors"
                          >
                            {_("members.list.remove")}
                          </button>
                        )}
                      </td>
                    </tr>
                    {isExpanded && userKeys.length > 0 && (
                      <tr className="border-t border-border/40 bg-muted/10">
                        <td colSpan={4} className="px-4 py-3">
                          <ul className="space-y-2">
                            {userKeys.map((k) => {
                              const { label, kind } = parseKeyName(k.name);
                              const canRevoke =
                                m.user_id === currentUserId || isOwner;
                              return (
                                <li
                                  key={k.key_id}
                                  className="flex items-center justify-between gap-3 text-sm"
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
                                      onClick={() =>
                                        handleRevokeKey(k.key_id)
                                      }
                                      disabled={pending}
                                      className="huozi-button-danger text-xs rounded border border-destructive/40 text-destructive px-2 py-1 hover:bg-destructive/10 disabled:opacity-40 shrink-0 transition-colors"
                                    >
                                      {_("members.keys.revoke")}
                                    </button>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {isOwner && invites.length > 0 && (
        <section>
          <h2 className="text-xs uppercase tracking-[0.15em] text-muted-foreground mb-3">
            {_("members.invites.heading").replace(
              "{count}",
              String(invites.length),
            )}
          </h2>
          <div className="huozi-card rounded-lg border border-border/60">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground border-b border-border/60">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">
                    {_("members.col.email")}
                  </th>
                  <th className="text-left px-4 py-2 font-medium">
                    {_("members.col.expires")}
                  </th>
                  <th className="text-right px-4 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {invites.map((inv) => (
                  <tr
                    key={inv.id}
                    className="border-t border-border/60 align-top"
                  >
                    <td className="px-4 py-3 truncate">{inv.email}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(inv.expires_at).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleRevoke(inv.id)}
                        disabled={pending}
                        className="huozi-button-danger text-xs rounded border border-destructive/40 text-destructive px-2 py-1 hover:bg-destructive/10 disabled:opacity-40 transition-colors"
                      >
                        {_("members.invites.revoke")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
