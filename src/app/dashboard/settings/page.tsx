import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ApiKeyManager } from "@/components/dashboard/api-key-manager";
import { getLocale } from "@/lib/i18n/server";
import { t } from "@/lib/i18n";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id, slug, name")
    .eq("owner_id", user.id)
    .single();

  if (!workspace) redirect("/dashboard");

  const { data: apiKeys } = await supabase
    .from("api_keys")
    .select("id, key_prefix, name, last_used_at, created_at, revoked_at")
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: false });

  const locale = await getLocale();
  const _ = (key: string) => t(locale, key);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold">{_("settings.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {_("settings.subtitle")}
        </p>
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-1">{_("settings.workspace")}</h2>
        <p className="text-sm text-muted-foreground mb-4">
          {_("settings.workspaceDesc")}
        </p>
        <div className="rounded-md border border-border bg-muted px-4 py-3 text-sm">
          huozi.app/<strong>{workspace.slug}</strong>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-1">{_("settings.apiKeys")}</h2>
        <p className="text-sm text-muted-foreground mb-4">
          {_("settings.apiKeysDesc")}
        </p>
        <ApiKeyManager
          workspaceId={workspace.id}
          apiKeys={apiKeys || []}
        />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-1">{_("settings.apiUsage")}</h2>
        <p className="text-sm text-muted-foreground mb-4">
          {_("settings.apiUsageDesc")}
        </p>
        <pre className="rounded-md border border-border bg-muted p-4 text-sm overflow-x-auto">
          <code>{`curl -X POST https://huozi.app/api/v1/pages \\
  -H "Authorization: Bearer hz_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "My Page",
    "slug": "my-page",
    "content": "# Hello World\\n\\nThis is my first page."
  }'`}</code>
        </pre>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-1">{_("settings.getStarted")}</h2>
        <p className="text-sm text-muted-foreground mb-4">
          {_("settings.getStartedDesc")}
        </p>
        <a
          href="/start"
          className="inline-flex rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          {_("settings.viewGuide")}
        </a>
      </section>
    </div>
  );
}
