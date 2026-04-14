"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/context";

export function LogoutButton() {
  const router = useRouter();
  const _ = useT();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      className="text-sm text-muted-foreground hover:text-foreground"
    >
      {_("nav.signOut")}
    </button>
  );
}
