"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n/context";

interface ApiKey {
  id: string;
  key_prefix: string;
  name: string;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

export function ApiKeyManager({
  workspaceId,
  apiKeys,
}: {
  workspaceId: string;
  apiKeys: ApiKey[];
}) {
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const _ = useT();

  async function createKey(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/v1/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: workspaceId,
          name: newKeyName || "Default",
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create key");
        return;
      }

      const data = await res.json();
      setCreatedKey(data.key);
      setNewKeyName("");
      router.refresh();
    } catch {
      setError("Failed to create key");
    } finally {
      setLoading(false);
    }
  }

  async function revokeKey(id: string) {
    if (!confirm(_("apiKey.confirmRevoke"))) return;

    await fetch("/api/v1/keys", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });

    router.refresh();
  }

  async function copyKey() {
    if (createdKey) {
      await navigator.clipboard.writeText(createdKey);
    }
  }

  const activeKeys = apiKeys.filter((k) => !k.revoked_at);

  return (
    <div className="space-y-4">
      {createdKey && (
        <div className="rounded-md border border-border bg-muted p-4">
          <p className="text-sm font-medium mb-2">{_("apiKey.created")}</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded bg-background px-3 py-2 text-sm font-mono border border-border break-all">
              {createdKey}
            </code>
            <button
              onClick={copyKey}
              className="rounded-md p-2 hover:bg-background"
              title={_("apiKey.copy")}
            >
              <Copy size={16} />
            </button>
          </div>
          <button
            onClick={() => setCreatedKey(null)}
            className="mt-2 text-sm text-muted-foreground hover:text-foreground"
          >
            {_("apiKey.dismiss")}
          </button>
        </div>
      )}

      <form onSubmit={createKey} className="flex items-end gap-2">
        <div className="flex-1">
          <label htmlFor="keyName" className="block text-sm font-medium mb-1">
            {_("apiKey.nameLabel")}
          </label>
          <input
            id="keyName"
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder={_("apiKey.namePlaceholder")}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {loading ? _("apiKey.creating") : _("apiKey.create")}
        </button>
      </form>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {activeKeys.length > 0 ? (
        <div className="divide-y divide-border rounded-md border border-border">
          {activeKeys.map((key) => (
            <div
              key={key.id}
              className="flex items-center justify-between px-4 py-3"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{key.name}</span>
                  <code className="text-xs text-muted-foreground font-mono">
                    {key.key_prefix}...
                  </code>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {key.last_used_at
                    ? `${_("apiKey.lastUsed")} ${new Date(key.last_used_at).toLocaleDateString()}`
                    : _("apiKey.neverUsed")}
                </p>
              </div>
              <button
                onClick={() => revokeKey(key.id)}
                className="rounded-md p-2 text-muted-foreground hover:text-destructive hover:bg-muted"
                title={_("apiKey.revoke")}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground py-4">
          {_("apiKey.empty")}
        </p>
      )}
    </div>
  );
}
