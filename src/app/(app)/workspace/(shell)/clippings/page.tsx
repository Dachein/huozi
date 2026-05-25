import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getIdentity } from "@/lib/identity";
import { clippingsFilePathFor } from "@/lib/highlights/types";

export const metadata: Metadata = {
  title: "Clippings — huozi Cloud",
};

/**
 * /workspace/clippings — friendly entry point for the authenticated
 * user's clippings file.
 *
 * The storage path is private and per-user
 * (`.huozi/clippings/<userId>/clippings.jsonl`) so we resolve the
 * principal here, then redirect to the standard file viewer with the
 * correct path. The view route renders the file as a Collection just
 * like any other `.jsonl`; no special UI is needed.
 *
 * Behaves like the Mail / Assets entries: routes-as-shortcuts to a
 * canonical underlying file rather than a separate subsystem.
 */
export default async function ClippingsRedirect() {
  const identity = await getIdentity();
  const principal = await identity.getPrincipal();
  if (!principal) {
    redirect(
      `/api/app/session/refresh?next=${encodeURIComponent("/workspace/clippings")}`,
    );
  }
  const path = clippingsFilePathFor(principal.userId);
  redirect(`/workspace/view?path=${encodeURIComponent(path)}`);
}
