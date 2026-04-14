import { zh } from "./zh";
import { en } from "./en";
import { ja } from "./ja";
import { fr } from "./fr";

export const LOCALES = ["zh", "en", "ja", "fr"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "zh";
export const COOKIE_NAME = "locale";

const dictionaries: Record<Locale, Record<string, string>> = { zh, en, ja, fr };

export function t(locale: Locale, key: string): string {
  const dict = dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
  return dict[key] ?? dictionaries[DEFAULT_LOCALE][key] ?? key;
}

export function detectLocale(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const preferred = acceptLanguage
    .split(",")
    .map((part) => {
      const [lang, q] = part.trim().split(";q=");
      return { lang: lang.trim().toLowerCase(), q: q ? parseFloat(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);

  for (const { lang } of preferred) {
    if (lang.startsWith("zh")) return "zh";
    if (lang.startsWith("ja")) return "ja";
    if (lang.startsWith("fr")) return "fr";
    if (lang.startsWith("en")) return "en";
  }
  return DEFAULT_LOCALE;
}
