export const RESERVED_SLUGS = [
  "api",
  "dashboard",
  "login",
  "signup",
  "auth",
  "admin",
  "settings",
  "new",
  "about",
  "pricing",
  "docs",
  "docs4agent",
  "blog",
  "help",
  "support",
  "terms",
  "privacy",
  "start",
  "docs",
  "_next",
  "static",
  "public",
  "favicon.ico",
];

export const WORKSPACE_SLUG_REGEX = /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/;

export const PAGE_SLUG_REGEX = /^[a-z0-9]([a-z0-9-]{0,98}[a-z0-9])?$/;

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://huozi.app";
