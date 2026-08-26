import {
  clampStillHoldSec,
  DEFAULT_STILL_HOLD_SEC,
  type FilmPlaylistShot,
} from '@/lib/character-film';
import { resolveRoleplaySetting } from '@/lib/roleplay';

export type DaySlotId = 'morning' | 'afternoon' | 'evening' | 'night';

export type DaySlot = {
  id: DaySlotId;
  label: string;
  wardrobeId?: string;
  location?: string;
  sceneHints?: string;
};

export type DaySlotStillStatus = 'queued' | 'running' | 'completed' | 'error';

/** Per-slot still tracked for the day-in-the-life reel / Cut film. */
export type DaySlotStill = {
  slotId: DaySlotId;
  promptId?: string;
  imageUrl?: string;
  status?: DaySlotStillStatus;
};

export const DEFAULT_DAY_SLOTS: DaySlot[] = [
  { id: 'morning', label: 'Morning' },
  { id: 'afternoon', label: 'Afternoon' },
  { id: 'evening', label: 'Evening' },
  { id: 'night', label: 'Night' },
];

const SLOT_IDS = new Set<DaySlotId>(['morning', 'afternoon', 'evening', 'night']);

function readText(value: unknown, max = 240): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/** Merge persisted slots with defaults so all four day parts always exist. */
export function normalizeDaySlots(input?: DaySlot[] | null): DaySlot[] {
  const byId = new Map<DaySlotId, DaySlot>();
  for (const slot of input ?? []) {
    if (!slot?.id || !SLOT_IDS.has(slot.id)) {
      continue;
    }
    byId.set(slot.id, {
      id: slot.id,
      label:
        readText(slot.label, 40) || DEFAULT_DAY_SLOTS.find(entry => entry.id === slot.id)!.label,
      wardrobeId: readText(slot.wardrobeId, 120) || undefined,
      location: readText(slot.location, 160) || undefined,
      sceneHints: readText(slot.sceneHints, 320) || undefined,
    });
  }
  return DEFAULT_DAY_SLOTS.map(defaultSlot => ({
    ...defaultSlot,
    ...byId.get(defaultSlot.id),
    id: defaultSlot.id,
    label: byId.get(defaultSlot.id)?.label || defaultSlot.label,
  }));
}

/** Scene prompt for one time-of-day still. */
export function buildDaySlotPrompt(input: {
  slot: DaySlot;
  wardrobeLabel?: string;
  characterName?: string;
  characterDescriptor?: string;
  lockedLocation?: string;
  notes?: string;
}): string {
  const slot = input.slot;
  const name = input.characterName?.trim();
  const descriptor = input.characterDescriptor?.trim();
  const outfit = input.wardrobeLabel?.trim() || slot.wardrobeId?.trim() || '';
  const setting = resolveRoleplaySetting(slot.location, input.lockedLocation);
  const hints = slot.sceneHints?.trim();
  const notes = input.notes?.trim();

  return [
    `Day planner still — ${slot.label.toLowerCase()}:`,
    name ? `subject: ${name}` : 'subject: the active Cast character',
    descriptor ? `look: ${descriptor}` : null,
    outfit ? `outfit: ${outfit}` : 'outfit: catalog wardrobe kit for this slot',
    setting ? `setting: ${setting}` : 'setting: a coherent location that fits the time of day',
    hints ? `beat: ${hints}` : null,
    notes ? `notes: ${notes}` : null,
    'single cinematic still, full or three-quarter framing, natural lighting for the time of day',
    'keep identity consistent across the day when a Cast character is active',
  ]
    .filter(Boolean)
    .join('\n');
}

function readStillStatus(value: unknown): DaySlotStillStatus | undefined {
  if (value === 'queued' || value === 'running' || value === 'completed' || value === 'error') {
    return value;
  }
  return undefined;
}

export function normalizeDaySlotStills(input?: DaySlotStill[] | null): DaySlotStill[] {
  const bySlot = new Map<DaySlotId, DaySlotStill>();
  for (const still of input ?? []) {
    if (!still?.slotId || !SLOT_IDS.has(still.slotId)) {
      continue;
    }
    bySlot.set(still.slotId, {
      slotId: still.slotId,
      promptId: readText(still.promptId, 160) || undefined,
      imageUrl: readText(still.imageUrl, 2048) || undefined,
      status: readStillStatus(still.status),
    });
  }
  return DEFAULT_DAY_SLOTS.map(slot => bySlot.get(slot.id) ?? { slotId: slot.id });
}

export function upsertDaySlotStill(
  stills: DaySlotStill[] | null | undefined,
  patch: DaySlotStill
): DaySlotStill[] {
  const next = normalizeDaySlotStills(stills).map(still =>
    still.slotId === patch.slotId
      ? {
          ...still,
          ...patch,
          slotId: patch.slotId,
          promptId: patch.promptId?.trim() || still.promptId,
          imageUrl: patch.imageUrl?.trim() || still.imageUrl,
          status: patch.status ?? still.status,
        }
      : still
  );
  return next;
}

export type DayGalleryStill = {
  promptId: string;
  status?: string;
  imageUrl?: string | null;
};

function stillStatusFromGallery(status: string | undefined): DaySlotStillStatus {
  if (status === 'completed') {
    return 'completed';
  }
  if (status === 'error' || status === 'failed' || status === 'cancelled') {
    return 'error';
  }
  if (status === 'running') {
    return 'running';
  }
  return 'queued';
}

/** Merge gallery poll results into day slot stills by promptId. */
export function mergeDaySlotStills(
  stills: DaySlotStill[] | null | undefined,
  gallery: DayGalleryStill[]
): { stills: DaySlotStill[]; changed: boolean } {
  const byPromptId = new Map(
    gallery.map(entry => [entry.promptId.trim(), entry] as const).filter(([id]) => Boolean(id))
  );
  let changed = false;
  const next = normalizeDaySlotStills(stills).map(still => {
    const id = still.promptId?.trim();
    if (!id) {
      return still;
    }
    const match = byPromptId.get(id);
    if (!match) {
      return still;
    }
    const imageUrl = match.imageUrl?.trim() || still.imageUrl;
    const status = stillStatusFromGallery(match.status);
    if (still.imageUrl === imageUrl && still.status === status) {
      return still;
    }
    changed = true;
    return { ...still, imageUrl, status };
  });
  return { stills: next, changed };
}

/** Watch / Cut film playlist from completed day stills (Morning → Night). */
export function dayWatchPlaylist(
  stills: DaySlotStill[] | null | undefined,
  slots: DaySlot[] = DEFAULT_DAY_SLOTS,
  stillHoldSec = DEFAULT_STILL_HOLD_SEC
): FilmPlaylistShot[] {
  const hold = clampStillHoldSec(stillHoldSec);
  const bySlot = new Map(normalizeDaySlotStills(stills).map(still => [still.slotId, still]));
  const shots: FilmPlaylistShot[] = [];
  for (const slot of normalizeDaySlots(slots)) {
    const still = bySlot.get(slot.id);
    const url = still?.status === 'completed' ? still.imageUrl?.trim() : '';
    if (!url) {
      continue;
    }
    shots.push({
      entryId: still?.promptId?.trim() || slot.id,
      title: slot.label,
      url,
      kind: 'still',
      holdSec: hold,
    });
  }
  return shots;
}

/** Seed empty slot wardrobe ids from a Fitting / look-pack wardrobe lock. */
export function seedDaySlotsWardrobe(
  slots: DaySlot[] | null | undefined,
  wardrobeId?: string
): DaySlot[] {
  const id = wardrobeId?.trim();
  if (!id) {
    return normalizeDaySlots(slots);
  }
  return normalizeDaySlots(slots).map(slot => ({
    ...slot,
    wardrobeId: slot.wardrobeId?.trim() || id,
  }));
}
