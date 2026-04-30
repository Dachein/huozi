import { cookies } from "next/headers";
import { COOKIE_NAME, DEFAULT_THEME, isTheme, type Theme } from "./index";

export async function getTheme(): Promise<Theme> {
  const cookieStore = await cookies();
  const value = cookieStore.get(COOKIE_NAME)?.value;
  return isTheme(value) ? value : DEFAULT_THEME;
}
