import Link from "next/link";
import { SITE_URL } from "@/lib/constants";

export default function PageNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="text-center max-w-md">
        <h1 className="font-serif text-6xl font-bold text-muted-foreground/30">
          404
        </h1>
        <h2 className="mt-4 text-xl font-semibold">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This page doesn&apos;t exist, may have been removed, or hasn&apos;t
          been published yet.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link
            href={SITE_URL}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Go to Huozi
          </Link>
        </div>
      </div>
    </div>
  );
}
