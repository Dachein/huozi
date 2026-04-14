import { cookies } from "next/headers";
import { COOKIE_NAME, DEFAULT_LOCALE, type Locale, LOCALES } from "./index";

export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const value = cookieStore.get(COOKIE_NAME)?.value as Locale | undefined;
  if (value && LOCALES.includes(value)) return value;
  return DEFAULT_LOCALE;
}
