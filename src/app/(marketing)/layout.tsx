import { MarketingHeader } from "@/components/marketing-header";
import { MarketingFooter } from "@/components/marketing-footer";
import { getLocale } from "@/lib/i18n/server";

/**
 * Marketing layout — applied to landing / product / docs / start pages.
 *
 * Visual character: roomy, narrative. Global header is the bare four
 * nav links (Cloud / Edge / Docs / Get Started); the footer carries
 * locale + secondary links so the header can stay uncluttered.
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
      <MarketingFooter locale={locale} />
    </div>
  );
}
