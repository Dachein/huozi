import { redirect } from "next/navigation";

/**
 * Legacy standalone-detail route. The detail view now lives inside the
 * sidebar on `/workspace/mail`; redirect deep links there so bookmarks
 * and back-links still resolve. The mail page resolves which tab the
 * ticket belongs to server-side from the folded buckets.
 */
export default async function MailDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/workspace/mail?id=${encodeURIComponent(id)}`);
}
