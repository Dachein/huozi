import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AssetsGrid, type Asset } from "@/components/workspace/assets-grid";
import {
  cloudGlob,
  cloudRead,
  HUOZI_CLOUD_KEY_COOKIE,
} from "@/lib/drive/mcp-client";

export const metadata: Metadata = {
  title: "Assets — huozi Cloud",
};

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "ico"]);

export default async function AssetsGallery() {
  const cookieStore = await cookies();
  const key = cookieStore.get(HUOZI_CLOUD_KEY_COOKIE)?.value;
  if (!key) {
    redirect(
      `/api/app/session/refresh?next=${encodeURIComponent("/workspace/assets")}`,
    );
  }

  // Glob the assets bucket. Worker stores ImageRenderTool output under
  // `__assets__/`; users might also have dropped files there manually.
  const globRes = await cloudGlob(key, "__assets__/**/*");
  const allPaths = globRes.ok ? globRes.data.filenames : [];

  const imagePaths = allPaths.filter((p) => {
    const ext = p.split(".").pop()?.toLowerCase() ?? "";
    return IMAGE_EXTS.has(ext);
  });

  // Parallel-fire reads to mint signed URLs. Each call is light (Worker
  // signs against blob_sha; no body bytes). Cap at a reasonable concurrency
  // by chunking — most workspaces have < 100 images so a single batch is fine.
  const assets: Asset[] = await Promise.all(
    imagePaths.map(async (path): Promise<Asset> => {
      const fileName = path.split("/").pop() ?? path;
      const r = await cloudRead(key, path);
      if (r.ok && r.data.type === "binary_ref") {
        return {
          path,
          fileName,
          url: r.data.file.url ?? null,
          mimeType: r.data.file.mimeType ?? null,
          size: r.data.file.size ?? null,
        };
      }
      return { path, fileName, url: null, mimeType: null, size: null };
    }),
  );

  // Newest hash-named files often correspond to most recent renders.
  // Without a real timestamp we sort by path desc as a stable proxy.
  assets.sort((a, b) => b.path.localeCompare(a.path));

  return (
    <div className="flex flex-col gap-6 flex-1 min-h-0">
      <div>
        <div className="text-xs text-muted-foreground font-mono flex items-center flex-wrap gap-x-1.5 gap-y-1">
          <Link
            href="/workspace"
            className="hover:text-foreground transition-colors"
          >
            workspace
          </Link>
          <span className="text-border">/</span>
          <span>__assets__</span>
        </div>
        <h1 className="font-mono text-base sm:text-lg">
          Asset library
          <span className="ml-2 text-xs text-muted-foreground">
            {assets.length} {assets.length === 1 ? "image" : "images"}
          </span>
        </h1>
      </div>

      {!globRes.ok && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/5 px-4 py-3 text-sm">
          <strong>Couldn&rsquo;t list assets:</strong>{" "}
          <span className="text-muted-foreground">{globRes.message}</span>
        </div>
      )}

      {globRes.ok && assets.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          <p className="font-medium text-foreground">No images yet.</p>
          <p className="mt-2">
            When an Agent calls{" "}
            <code className="font-mono text-xs rounded bg-muted px-1">
              huozi_image_render
            </code>{" "}
            (or uploads a PNG/JPG/etc.), the file lands here under{" "}
            <code className="font-mono text-xs">__assets__/</code> and shows up
            in this gallery.
          </p>
        </div>
      )}

      {assets.length > 0 && <AssetsGrid assets={assets} />}

      <div className="mt-auto rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
        <strong className="text-foreground">Asset library.</strong> Files in{" "}
        <code className="font-mono">__assets__/</code> are referenced from
        Markdown as{" "}
        <code className="font-mono">![alt](/__assets__/&lt;name&gt;)</code>.
        Click a tile to open a preview — use ←/→ to step through, or delete to
        remove from the workspace.
      </div>
    </div>
  );
}
