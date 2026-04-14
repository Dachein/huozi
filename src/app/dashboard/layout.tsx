import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { LogoutButton } from "@/components/dashboard/logout-button";
import { getLocale } from "@/lib/i18n/server";
import { t } from "@/lib/i18n";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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

  const locale = await getLocale();
  const _ = (key: string) => t(locale, key);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="text-lg font-bold">
              {_("nav.home")}
            </Link>
            {workspace && (
              <nav className="flex items-center gap-4 text-sm">
                <Link
                  href="/dashboard"
                  className="text-muted-foreground hover:text-foreground"
                >
                  {_("nav.pages")}
                </Link>
                <Link
                  href="/dashboard/settings"
                  className="text-muted-foreground hover:text-foreground"
                >
                  {_("nav.settings")}
                </Link>
              </nav>
            )}
          </div>
          <div className="flex items-center gap-4">
            {workspace && (
              <span className="text-sm text-muted-foreground">
                {workspace.slug}
              </span>
            )}
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="flex-1">
        <div className="mx-auto max-w-5xl px-4 py-8">{children}</div>
      </main>
    </div>
  );
}
