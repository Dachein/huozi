import type { Metadata } from "next";
import { getPublicMcpUrl } from "@/lib/cloud-fetch";
import { getIdentity } from "@/lib/identity";
import { TestKeyClient } from "./test-key-client";

export const metadata: Metadata = {
  title: "Test key - huozi",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function TestKeyPage() {
  const identity = await getIdentity();
  const workspace = await identity.getPrimaryWorkspace();

  return (
    <main className="flex-1 overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <TestKeyClient
          mcpUrl={getPublicMcpUrl()}
          workspaceName={workspace?.name ?? workspace?.slug ?? "workspace"}
        />
      </div>
    </main>
  );
}
