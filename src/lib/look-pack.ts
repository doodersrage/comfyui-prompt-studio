/**
 * Moodboard → Fitting / Day look pack handoff.
 * Session-scoped; optional wardrobe lock + vibe notes travel via query + sessionStorage.
 */

import type { DaySlot } from './day-planner';
import type { MoodboardTemplateId, MoodboardTile, MoodboardTileRole } from './moodboard-scene';

export const LOOK_PACK_KEY = 'moodboard-look-pack-v1';

export type LookPack = {
  version: 1;
  source: 'moodboard';
  characterId?: string;
  templateId?: MoodboardTemplateId;
  paletteNotes?: string;
  lightingNotes?: string;
  locationNotes?: string;
  styleNotes?: string;
  moodNotes?: string;
  wardrobeId?: string;
  instruction?: string;
  vibePrompt?: string;
  tileSummaries?: Array<{
    role: MoodboardTileRole;
    notes?: string;
    imageFilename?: string;
  }>;
  savedAt: number;
};

function readText(value: unknown, max = 480): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function notesForRole(tiles: MoodboardTile[], role: MoodboardTileRole): string | undefined {
  const parts = tiles
    .filter(tile => tile.role === role)
    .map(tile => {
      const label = tile.label?.trim();
      const notes = tile.notes?.trim();
      if (label && notes) {
        return `${label}: ${notes}`;
      }
      return notes || label || '';
    })
    .filter(Boolean);
  return parts.length > 0 ? parts.join('; ').slice(0, 480) : undefined;
}

/** Build a look pack from moodboard tiles + optional vision / synthesized vibe text. */
export function buildLookPackFromMoodboard(input: {
  tiles: MoodboardTile[];
  templateId?: MoodboardTemplateId;
  characterId?: string;
  instruction?: string;
  vibePrompt?: string;
  wardrobeId?: string;
  savedAt?: number;
}): LookPack {
  const tiles = input.tiles ?? [];
  return {
    version: 1,
    source: 'moodboard',
    characterId: readText(input.characterId, 120) || undefined,
    templateId: input.templateId,
    paletteNotes: notesForRole(tiles, 'palette'),
    lightingNotes: notesForRole(tiles, 'lighting'),
    locationNotes: notesForRole(tiles, 'location'),
    styleNotes: notesForRole(tiles, 'style'),
    moodNotes: notesForRole(tiles, 'mood'),
    wardrobeId: readText(input.wardrobeId, 120) || undefined,
    instruction: readText(input.instruction, 480) || undefined,
    vibePrompt: readText(input.vibePrompt, 2400) || undefined,
    tileSummaries: tiles.map(tile => ({
      role: tile.role,
      notes: readText(tile.notes, 320) || undefined,
      imageFilename: readText(tile.imageFilename, 240) || undefined,
    })),
    savedAt: input.savedAt ?? Date.now(),
  };
}

export function normalizeLookPack(value: unknown): LookPack | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const raw = value as Partial<LookPack>;
  if (raw.version !== 1 || raw.source !== 'moodboard') {
    return null;
  }
  const tileSummaries = Array.isArray(raw.tileSummaries)
    ? raw.tileSummaries
        .filter(entry => entry && typeof entry === 'object')
        .map(entry => ({
          role: (entry as { role?: MoodboardTileRole }).role ?? ('other' as MoodboardTileRole),
          notes: readText((entry as { notes?: string }).notes, 320) || undefined,
          imageFilename:
            readText((entry as { imageFilename?: string }).imageFilename, 240) || undefined,
        }))
    : undefined;
  return {
    version: 1,
    source: 'moodboard',
    characterId: readText(raw.characterId, 120) || undefined,
    templateId: raw.templateId,
    paletteNotes: readText(raw.paletteNotes, 480) || undefined,
    lightingNotes: readText(raw.lightingNotes, 480) || undefined,
    locationNotes: readText(raw.locationNotes, 480) || undefined,
    styleNotes: readText(raw.styleNotes, 480) || undefined,
    moodNotes: readText(raw.moodNotes, 480) || undefined,
    wardrobeId: readText(raw.wardrobeId, 120) || undefined,
    instruction: readText(raw.instruction, 480) || undefined,
    vibePrompt: readText(raw.vibePrompt, 2400) || undefined,
    tileSummaries,
    savedAt: typeof raw.savedAt === 'number' ? raw.savedAt : Date.now(),
  };
}

export function saveLookPack(pack: LookPack): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.sessionStorage.setItem(LOOK_PACK_KEY, JSON.stringify(pack));
}

export function loadLookPack(options?: { clear?: boolean }): LookPack | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(LOOK_PACK_KEY);
    if (!raw) {
      return null;
    }
    const pack = normalizeLookPack(JSON.parse(raw) as unknown);
    if (options?.clear) {
      window.sessionStorage.removeItem(LOOK_PACK_KEY);
    }
    return pack;
  } catch {
    window.sessionStorage.removeItem(LOOK_PACK_KEY);
    return null;
  }
}

export function clearLookPack(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.sessionStorage.removeItem(LOOK_PACK_KEY);
}

/** Combined notes string for Fitting / Day tool notes fields. */
export function lookPackNotes(pack: LookPack): string {
  return [
    pack.vibePrompt,
    pack.instruction,
    pack.moodNotes ? `mood: ${pack.moodNotes}` : null,
    pack.lightingNotes ? `lighting: ${pack.lightingNotes}` : null,
    pack.paletteNotes ? `palette: ${pack.paletteNotes}` : null,
    pack.styleNotes ? `style: ${pack.styleNotes}` : null,
    pack.locationNotes ? `location: ${pack.locationNotes}` : null,
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 1200);
}

export function lookPackFittingHref(pack: LookPack): string {
  const params = new URLSearchParams();
  params.set('from', 'look');
  if (pack.characterId) {
    params.set('character', pack.characterId);
  }
  if (pack.wardrobeId) {
    params.set('wardrobe', pack.wardrobeId);
  }
  return `/fitting?${params.toString()}`;
}

export function lookPackDayHref(pack: LookPack): string {
  const params = new URLSearchParams();
  params.set('from', 'look');
  if (pack.characterId) {
    params.set('character', pack.characterId);
  }
  if (pack.wardrobeId) {
    params.set('wardrobe', pack.wardrobeId);
  }
  return `/day?${params.toString()}`;
}

/** Seed every Day slot location / beat from a look pack (wardrobe only when empty). */
export function applyLookPackToDaySlots(slots: DaySlot[], pack: LookPack): DaySlot[] {
  const location = pack.locationNotes?.trim();
  const beatParts = [
    pack.moodNotes,
    pack.lightingNotes,
    pack.paletteNotes,
    pack.styleNotes,
    pack.instruction,
  ]
    .map(part => part?.trim())
    .filter(Boolean);
  const beat = beatParts.join(' · ').slice(0, 320) || undefined;
  const wardrobeId = pack.wardrobeId?.trim();

  return slots.map(slot => ({
    ...slot,
    location: location || slot.location,
    sceneHints: beat || slot.sceneHints,
    wardrobeId: slot.wardrobeId?.trim() || wardrobeId || undefined,
  }));
}
