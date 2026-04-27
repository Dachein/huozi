import { cookies } from "next/headers";
import {
  COOKIE_NAME,
  DEFAULT_LOCALE,
  type Locale,
  LOCALES,
  t,
} from "./index";

export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const value = cookieStore.get(COOKIE_NAME)?.value as Locale | undefined;
  if (value && LOCALES.includes(value)) return value;
  return DEFAULT_LOCALE;
}

/**
 * Server-side translation helper. Mirrors `useT` for RSC pages.
 *
 *   const _ = await getServerT()
 *   _("some.key")
 */
export async function getServerT(): Promise<(key: string) => string> {
  const locale = await getLocale();
  return (key: string) => t(locale, key);
}
