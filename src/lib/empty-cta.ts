import { flattenAppNavLinks } from "./app-nav-catalog";
import { loadNavFavorites } from "./nav-favorites";

export type EmptyCta = {
  label: string;
  href: string;
};

const PROMPT_TOOL_PATHS = new Set([
  "/",
  "/format",
  "/prompt",
  "/character",
  "/background",
  "/pet",
  "/fantasy",
  "/variations",
  "/image-prompt",
]);

/**
 * Prefer a pinned prompt/scene tool for empty-state CTAs; fall back to Generate.
 */
export function resolveGenerateEmptyCta(
  fallback: EmptyCta = { label: "Open Generate", href: "/" },
): EmptyCta {
  if (typeof window === "undefined") {
    return fallback;
  }
  const favorites = loadNavFavorites();
  const links = flattenAppNavLinks();
  for (const favorite of favorites) {
    const path = (favorite.split("?")[0] || favorite).trim() || "/";
    if (!PROMPT_TOOL_PATHS.has(path)) {
      continue;
    }
    const link =
      links.find((entry) => entry.href === favorite) ??
      links.find((entry) => (entry.href.split("?")[0] || entry.href) === path);
    if (link) {
      return { label: `Open ${link.label}`, href: link.href };
    }
  }
  return fallback;
}
