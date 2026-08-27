/**
 * Local Play-loop success metrics (timestamps).
 * Complements boolean onboarding steps with funnel timing.
 */

import { readBrowserValue, writeBrowserValue } from './browser-storage';

export const PLAY_METRICS_KEY = 'comfy-play-metrics-v1';

export const PLAY_METRICS_UPDATED_EVENT = 'play-metrics-updated';

export type PlayMetrics = {
  version: 1;
  /** First time the user left Play campaign into a step past Cast. */
  firstPlayCampaignAt?: number;
  /** First successful Cut film (Day or Roleplay). */
  firstFilmCutAt?: number;
};

function normalizePlayMetrics(value: unknown): PlayMetrics {
  if (!value || typeof value !== 'object') {
    return { version: 1 };
  }
  const raw = value as Partial<PlayMetrics>;
  return {
    version: 1,
    firstPlayCampaignAt:
      typeof raw.firstPlayCampaignAt === 'number' ? raw.firstPlayCampaignAt : undefined,
    firstFilmCutAt: typeof raw.firstFilmCutAt === 'number' ? raw.firstFilmCutAt : undefined,
  };
}

export function loadPlayMetrics(): PlayMetrics {
  if (typeof window === 'undefined') {
    return { version: 1 };
  }
  return normalizePlayMetrics(readBrowserValue(PLAY_METRICS_KEY));
}

export function savePlayMetrics(metrics: PlayMetrics): void {
  if (typeof window === 'undefined') {
    return;
  }
  writeBrowserValue(PLAY_METRICS_KEY, normalizePlayMetrics(metrics));
  window.dispatchEvent(new Event(PLAY_METRICS_UPDATED_EVENT));
}

/** Returns true the first time campaign start is recorded. */
export function recordFirstPlayCampaignStart(at = Date.now()): boolean {
  const current = loadPlayMetrics();
  if (current.firstPlayCampaignAt) {
    return false;
  }
  savePlayMetrics({ ...current, firstPlayCampaignAt: at });
  return true;
}

/** Returns true the first time a film cut is recorded. */
export function recordFirstFilmCut(at = Date.now()): boolean {
  const current = loadPlayMetrics();
  if (current.firstFilmCutAt) {
    return false;
  }
  savePlayMetrics({ ...current, firstFilmCutAt: at });
  return true;
}

/**
 * Days between first campaign start and first film cut.
 * Null when either timestamp is missing.
 */
export function daysFromCampaignStartToFirstFilmCut(
  metrics: PlayMetrics = loadPlayMetrics()
): number | null {
  if (!metrics.firstPlayCampaignAt || !metrics.firstFilmCutAt) {
    return null;
  }
  if (metrics.firstFilmCutAt < metrics.firstPlayCampaignAt) {
    return 0;
  }
  return (metrics.firstFilmCutAt - metrics.firstPlayCampaignAt) / (1000 * 60 * 60 * 24);
}

/** True when the user cut a film within `withinDays` of starting a campaign. */
export function firstFilmCutWithinDays(
  withinDays: number,
  metrics: PlayMetrics = loadPlayMetrics()
): boolean | null {
  const days = daysFromCampaignStartToFirstFilmCut(metrics);
  if (days === null) {
    return null;
  }
  return days <= withinDays;
}
