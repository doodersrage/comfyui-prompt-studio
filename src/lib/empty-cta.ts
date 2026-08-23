import { flattenAppNavLinks } from './app-nav-catalog';
import { loadNavFavorites } from './nav-favorites';
import { loadWorkspaceMode } from './workspace-mode';

export type EmptyCta = {
  label: string;
  href: string;
};

/** First-run Generate deep link — Random surprise, no keywords required. */
export const FIRST_RUN_GENERATE_HREF = '/?source=random';

const PROMPT_TOOL_PATHS = new Set([
  '/',
  '/format',
  '/prompt',
  '/character',
  '/background',
  '/pet',
  '/fantasy',
  '/roleplay',
  '/m/play',
  '/variations',
  '/image-prompt',
]);

/**
 * Prefer a pinned prompt/scene tool for empty-state CTAs; fall back to Generate or Dashboard.
 */
export function resolveGenerateEmptyCta(
  fallback: EmptyCta = { label: 'Open Generate', href: '/' }
): EmptyCta {
  if (typeof window === 'undefined') {
    return fallback;
  }
  const favorites = loadNavFavorites();
  const links = flattenAppNavLinks();
  for (const favorite of favorites) {
    const path = (favorite.split('?')[0] || favorite).trim() || '/';
    if (!PROMPT_TOOL_PATHS.has(path)) {
      continue;
    }
    const link =
      links.find(entry => entry.href === favorite) ??
      links.find(entry => (entry.href.split('?')[0] || entry.href) === path);
    if (link) {
      return { label: `Open ${link.label}`, href: link.href };
    }
  }
  return fallback;
}

/**
 * Post-welcome primary CTA — always “make a first image” except Play → Roleplay.
 * Aligns Welcome with Settings first-run (`FIRST_RUN_GENERATE_HREF`).
 */
export function resolveWelcomeLandingCta(): EmptyCta {
  if (typeof window === 'undefined') {
    return { label: 'Open Generate', href: FIRST_RUN_GENERATE_HREF };
  }
  if (loadWorkspaceMode() === 'play') {
    return { label: 'Open Roleplay', href: '/roleplay' };
  }
  return { label: 'Open Generate', href: FIRST_RUN_GENERATE_HREF };
}
