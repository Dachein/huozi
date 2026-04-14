"use client";

import { useLocale } from "@/lib/i18n/context";
import { COOKIE_NAME, type Locale, LOCALES } from "@/lib/i18n";
import { useRouter } from "next/navigation";

const labels: Record<Locale, string> = {
  zh: "中文",
  en: "EN",
  ja: "日本語",
  fr: "FR",
};

export function LocaleSwitcher() {
  const current = useLocale();
  const router = useRouter();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const locale = e.target.value as Locale;
    document.cookie = `${COOKIE_NAME}=${locale};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
    router.refresh();
  }

  return (
    <select
      value={current}
      onChange={handleChange}
      className="rounded-md border border-border bg-background px-2 py-1 text-sm text-muted-foreground hover:text-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-border"
    >
      {LOCALES.map((loc) => (
        <option key={loc} value={loc}>
          {labels[loc]}
        </option>
      ))}
    </select>
  );
}
