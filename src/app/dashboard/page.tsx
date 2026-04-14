import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { SITE_URL } from "@/lib/constants";
import { SetupWorkspace } from "@/components/dashboard/setup-workspace";
import { PageList } from "@/components/dashboard/page-list";
import { getLocale } from "@/lib/i18n/server";
import { t } from "@/lib/i18n";

export default async function DashboardPage() {
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

  if (!workspace) {
    return <SetupWorkspace />;
  }

  const { data: pages } = await supabase
    .from("pages")
    .select("id, slug, title, is_published, created_at, updated_at")
    .eq("workspace_id", workspace.id)
    .order("updated_at", { ascending: false });

  const locale = await getLocale();
  const _ = (key: string) => t(locale, key);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">{_("dashboard.pages")}</h1>
        <Link
          href="/dashboard/new"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          {_("dashboard.newPage")}
        </Link>
      </div>

      <PageList
        pages={pages || []}
        workspaceSlug={workspace.slug}
        siteUrl={SITE_URL}
      />
    </div>
  );
}
