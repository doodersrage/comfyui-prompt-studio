/**
 * Guided Play loop: Moodboard → Fitting → Day → Roleplay.
 * State travels via session look pack + query params.
 */

import { readBrowserValue, writeBrowserValue } from './browser-storage';
import type { LookPack } from './look-pack';
import {
  lookPackDayHref,
  lookPackFittingHref,
  lookPackRoleplayHref,
  saveLookPack,
} from './look-pack';

export type PlayCampaignStepId = 'character' | 'moodboard' | 'fitting' | 'day' | 'roleplay';

export type PlayCampaignStep = {
  id: PlayCampaignStepId;
  label: string;
  description: string;
  href: (input: { characterId: string; pack?: LookPack | null }) => string;
};

export const PLAY_CAMPAIGN_STEPS: PlayCampaignStep[] = [
  {
    id: 'character',
    label: 'Cast',
    description: 'Pick the character this campaign belongs to.',
    href: ({ characterId }) => `/characters/${encodeURIComponent(characterId)}`,
  },
  {
    id: 'moodboard',
    label: 'Moodboard',
    description: 'Stack refs and extract a look pack (or pick a saved one on Cast).',
    href: ({ characterId }) => `/moodboard?character=${encodeURIComponent(characterId)}`,
  },
  {
    id: 'fitting',
    label: 'Fitting',
    description: 'Swipe wardrobe kits on the locked plate.',
    href: ({ characterId, pack }) =>
      pack ? lookPackFittingHref(pack) : `/fitting?character=${encodeURIComponent(characterId)}`,
  },
  {
    id: 'day',
    label: 'Day',
    description: 'Plan morning → night, queue stills, animate slots, Cut film.',
    href: ({ characterId, pack }) =>
      pack ? lookPackDayHref(pack) : `/day?character=${encodeURIComponent(characterId)}`,
  },
  {
    id: 'roleplay',
    label: 'Roleplay',
    description: 'Continue the story with beats, clips, and Save to Cast.',
    href: ({ characterId, pack }) =>
      pack ? lookPackRoleplayHref(pack) : `/roleplay?character=${encodeURIComponent(characterId)}`,
  },
];

export const PLAY_CAMPAIGN_KEY = 'play-campaign-v1';

export type PlayCampaignState = {
  version: 1;
  characterId: string;
  lookPackId?: string;
  stepIndex: number;
  updatedAt: number;
};

function normalizePlayCampaignState(value: unknown): PlayCampaignState | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const parsed = value as Partial<PlayCampaignState>;
  if (parsed.version !== 1 || !parsed.characterId?.trim()) {
    return null;
  }
  return {
    version: 1,
    characterId: parsed.characterId.trim(),
    lookPackId: parsed.lookPackId?.trim() || undefined,
    stepIndex:
      typeof parsed.stepIndex === 'number'
        ? Math.max(0, Math.min(PLAY_CAMPAIGN_STEPS.length - 1, parsed.stepIndex))
        : 0,
    updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
  };
}

export function savePlayCampaignState(state: PlayCampaignState): void {
  if (typeof window === 'undefined') {
    return;
  }
  const normalized = normalizePlayCampaignState(state);
  if (!normalized) {
    return;
  }
  writeBrowserValue(PLAY_CAMPAIGN_KEY, normalized);
  // Mirror to sessionStorage so same-tab e2e seeds and in-flight handoffs keep working.
  try {
    window.sessionStorage.setItem(PLAY_CAMPAIGN_KEY, JSON.stringify(normalized));
  } catch {
    /* private mode */
  }
}

export function loadPlayCampaignState(): PlayCampaignState | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const durable = normalizePlayCampaignState(readBrowserValue(PLAY_CAMPAIGN_KEY));
  if (durable) {
    return durable;
  }
  try {
    const raw = window.sessionStorage.getItem(PLAY_CAMPAIGN_KEY);
    if (!raw) {
      return null;
    }
    const migrated = normalizePlayCampaignState(JSON.parse(raw) as unknown);
    if (!migrated) {
      window.sessionStorage.removeItem(PLAY_CAMPAIGN_KEY);
      return null;
    }
    writeBrowserValue(PLAY_CAMPAIGN_KEY, migrated);
    return migrated;
  } catch {
    window.sessionStorage.removeItem(PLAY_CAMPAIGN_KEY);
    return null;
  }
}

/** Stage look pack for the next Play tool hop. */
export function stagePlayCampaignHandoff(pack: LookPack): void {
  saveLookPack(pack);
}

export function playCampaignHref(characterId: string, lookPackId?: string): string {
  const params = new URLSearchParams();
  params.set('character', characterId);
  if (lookPackId?.trim()) {
    params.set('lookPack', lookPackId.trim());
  }
  return `/play?${params.toString()}`;
}
