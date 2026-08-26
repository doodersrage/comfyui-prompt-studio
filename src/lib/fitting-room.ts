import type { CharacterRecord } from '@/lib/character-os';
import { activeLook } from '@/lib/character-os';

export type FittingPlate = {
  filename?: string;
  imageUrl?: string;
  originalFilename?: string;
  originalUrl?: string;
  isolated?: boolean;
  isolateSubject?: boolean;
};

/** Resolve a try-on plate from Cast character / active look. */
export function resolveFittingPlateFromCharacter(
  character: CharacterRecord | null | undefined
): FittingPlate | null {
  if (!character) {
    return null;
  }
  let look;
  try {
    look = activeLook(character);
  } catch {
    look = undefined;
  }
  const reference = look?.reference ?? character.reference;
  if (reference) {
    const isolated = reference.isolated === true;
    const filename =
      (isolated ? reference.isolatedFilename : reference.originalFilename)?.trim() ||
      reference.isolatedFilename?.trim() ||
      reference.originalFilename?.trim() ||
      '';
    const imageUrl =
      (isolated ? reference.isolatedUrl : reference.originalUrl)?.trim() ||
      reference.isolatedUrl?.trim() ||
      reference.originalUrl?.trim() ||
      '';
    if (filename || imageUrl) {
      return {
        filename: filename || undefined,
        imageUrl: imageUrl || undefined,
        originalFilename: reference.originalFilename?.trim() || undefined,
        originalUrl: reference.originalUrl?.trim() || undefined,
        isolated,
        isolateSubject: reference.isolateSubject !== false,
      };
    }
  }

  const ip = look?.ipAdapter ?? character.ipAdapter;
  const filename = ip?.imageFilename?.trim() || '';
  const imageUrl = ip?.imageUrl?.trim() || ip?.comfyUrl?.trim() || '';
  if (!filename && !imageUrl) {
    return null;
  }
  return {
    filename: filename || undefined,
    imageUrl: imageUrl || undefined,
    isolated: false,
    isolateSubject: true,
  };
}

export type FittingSwipeKit = {
  id: string;
  label: string;
  group?: string;
};

const SWIPE_DECK_LIMIT = 24;

/**
 * Curated kit deck for Fitting swipe — non-empty catalog options, preferred kit first,
 * outfit-group kits favored when present.
 */
export function buildFittingSwipeDeck(
  options: Array<{ value: string; label: string; group?: string }>,
  preferredId?: string,
  limit = SWIPE_DECK_LIMIT
): FittingSwipeKit[] {
  const kits: FittingSwipeKit[] = [];
  const seen = new Set<string>();
  for (const option of options) {
    const id = option.value?.trim();
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    kits.push({
      id,
      label: option.label?.trim() || id,
      group: option.group?.trim() || undefined,
    });
  }
  if (kits.length === 0) {
    return [];
  }

  const preferred = preferredId?.trim();
  const outfitFirst = [...kits].sort((left, right) => {
    if (preferred) {
      if (left.id === preferred) {
        return -1;
      }
      if (right.id === preferred) {
        return 1;
      }
    }
    const leftOutfit = /outfit/i.test(left.group ?? '') ? 0 : 1;
    const rightOutfit = /outfit/i.test(right.group ?? '') ? 0 : 1;
    if (leftOutfit !== rightOutfit) {
      return leftOutfit - rightOutfit;
    }
    return left.label.localeCompare(right.label);
  });

  return outfitFirst.slice(0, Math.max(1, limit));
}

export function fittingSwipeIndex(deck: FittingSwipeKit[], wardrobeId?: string): number {
  const id = wardrobeId?.trim();
  if (!id || deck.length === 0) {
    return 0;
  }
  const index = deck.findIndex(kit => kit.id === id);
  return index >= 0 ? index : 0;
}

export function fittingSwipeNeighbor(
  deck: FittingSwipeKit[],
  wardrobeId: string | undefined,
  delta: number
): FittingSwipeKit | null {
  if (deck.length === 0) {
    return null;
  }
  const current = fittingSwipeIndex(deck, wardrobeId);
  const next = (current + delta + deck.length) % deck.length;
  return deck[next] ?? null;
}

/** Img2img instruction: keep identity, swap wardrobe to the locked kit. */
export function buildFittingOutfitPrompt(input: {
  outfitLabel: string;
  characterName?: string;
  characterDescriptor?: string;
  notes?: string;
  isolated?: boolean;
}): string {
  const outfit = input.outfitLabel.trim();
  const name = input.characterName?.trim();
  const descriptor = input.characterDescriptor?.trim();
  const notes = input.notes?.trim();
  return [
    'Edit instruction for an outfit try-on:',
    'keep: face, hair, body identity, skin tone, and likeness from the reference plate',
    name ? `subject: ${name}` : null,
    descriptor ? `look notes: ${descriptor}` : null,
    `replace: all clothing and footwear with this outfit — ${outfit}`,
    'do not keep the reference photo street clothes, uniform, or shoes unless the outfit explicitly includes them',
    input.isolated
      ? 'background: clean plain studio / white seamless; no scene from the original photo'
      : 'background: keep a simple neutral setting; do not invent a busy location',
    notes ? `extra: ${notes}` : null,
    'output: single full-body or three-quarter fashion still of the same person in the new kit',
  ]
    .filter(Boolean)
    .join('\n');
}
