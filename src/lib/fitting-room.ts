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
