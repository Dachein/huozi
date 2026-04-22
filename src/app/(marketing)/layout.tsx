import { MarketingHeader } from "@/components/marketing-header";
import { getLocale } from "@/lib/i18n/server";

/**
 * Marketing layout — applied to landing / product / docs / start pages.
 *
 * Visual character: roomy, narrative. Shows the full nav (Cloud / Docs /
 * Get Started) and a prominent Sign in CTA. Distinct from the app shell
 * so users can feel when they've crossed from "reading about it" to
 * "using it".
 */
export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  return (
    <div className="flex flex-col min-h-screen">
      <MarketingHeader locale={locale} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
