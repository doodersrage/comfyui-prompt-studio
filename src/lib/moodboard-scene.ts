export type MoodboardTileRole = 'mood' | 'lighting' | 'location' | 'style' | 'palette' | 'other';

export type MoodboardTile = {
  id: string;
  role: MoodboardTileRole;
  label?: string;
  notes?: string;
  imageUrl?: string;
  imageFilename?: string;
};

export type MoodboardTemplateId = 'scene-blend' | 'lighting-mood' | 'location' | 'style-transfer';

export const MOODBOARD_TEMPLATE_OPTIONS: Array<{
  id: MoodboardTemplateId;
  label: string;
  hint: string;
}> = [
  {
    id: 'scene-blend',
    label: 'Scene blend',
    hint: 'Merge location, mood, and palette into one cohesive scene',
  },
  {
    id: 'lighting-mood',
    label: 'Lighting / mood',
    hint: 'Apply lighting direction, contrast, and color mood across the frame',
  },
  {
    id: 'location',
    label: 'Location focus',
    hint: 'Place the subject in the environment suggested by the board',
  },
  {
    id: 'style-transfer',
    label: 'Style transfer',
    hint: 'Render with the art direction and texture cues from the board',
  },
];

export const MOODBOARD_TILE_ROLES: Array<{ id: MoodboardTileRole; label: string }> = [
  { id: 'mood', label: 'Mood' },
  { id: 'lighting', label: 'Lighting' },
  { id: 'location', label: 'Location' },
  { id: 'style', label: 'Style' },
  { id: 'palette', label: 'Palette' },
  { id: 'other', label: 'Other' },
];

const ROLE_LABEL: Record<MoodboardTileRole, string> = Object.fromEntries(
  MOODBOARD_TILE_ROLES.map(entry => [entry.id, entry.label])
) as Record<MoodboardTileRole, string>;

function readText(value: unknown, max = 320): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/** Cap length without trimming — used for in-progress label/notes typing. */
function readEditableText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

export function normalizeMoodboardTemplateId(value: unknown): MoodboardTemplateId {
  if (
    value === 'scene-blend' ||
    value === 'lighting-mood' ||
    value === 'location' ||
    value === 'style-transfer'
  ) {
    return value;
  }
  return 'scene-blend';
}

export function normalizeMoodboardTiles(input?: MoodboardTile[] | null): MoodboardTile[] {
  const next: MoodboardTile[] = [];
  for (const tile of input ?? []) {
    if (!tile?.id) {
      continue;
    }
    const role = MOODBOARD_TILE_ROLES.some(entry => entry.id === tile.role) ? tile.role : 'other';
    next.push({
      id: tile.id,
      role,
      // Do not trim label/notes here — persistTiles runs on every keystroke and
      // trimming would eat Space (and mid-edit trailing whitespace).
      label: readEditableText(tile.label, 80) || undefined,
      notes: readEditableText(tile.notes, 320) || undefined,
      imageUrl: readText(tile.imageUrl, 2048) || undefined,
      imageFilename: readText(tile.imageFilename, 240) || undefined,
    });
    if (next.length >= 4) {
      break;
    }
  }
  return next;
}

function templateLead(templateId: MoodboardTemplateId): string {
  switch (templateId) {
    case 'lighting-mood':
      return 'Compose a scene using the moodboard lighting and color cues.';
    case 'location':
      return 'Compose a scene placing the subject in the moodboard environment.';
    case 'style-transfer':
      return 'Compose a scene rendered with the moodboard art direction.';
    default:
      return 'Compose a cohesive scene from the moodboard references.';
  }
}

/** Text-only scene prompt from moodboard tiles (MVP — no multi-image compose graph). */
export function synthesizeMoodboardPrompt(input: {
  tiles: MoodboardTile[];
  templateId?: MoodboardTemplateId;
  characterName?: string;
  characterDescriptor?: string;
  instruction?: string;
}): string {
  const templateId = normalizeMoodboardTemplateId(input.templateId);
  const tiles = normalizeMoodboardTiles(input.tiles);
  const name = input.characterName?.trim();
  const descriptor = input.characterDescriptor?.trim();
  const instruction = input.instruction?.trim();

  const tileLines = tiles
    .map((tile, index) => {
      const role = ROLE_LABEL[tile.role] ?? 'Reference';
      const label = tile.label?.trim();
      const notes = tile.notes?.trim();
      const hasImage = Boolean(tile.imageUrl?.trim() || tile.imageFilename?.trim());
      const parts = [
        `${index + 1}. ${role}${label ? ` — ${label}` : ''}`,
        notes ? `   notes: ${notes}` : null,
        hasImage ? '   (reference still attached)' : null,
      ].filter(Boolean);
      return parts.join('\n');
    })
    .filter(Boolean);

  if (tileLines.length === 0 && !instruction) {
    throw new Error('Add at least one moodboard tile or a scene instruction.');
  }

  return [
    templateLead(templateId),
    name ? `subject: ${name}` : null,
    descriptor ? `character notes: ${descriptor}` : null,
    instruction ? `direction: ${instruction}` : null,
    tileLines.length > 0 ? 'moodboard cues:\n' + tileLines.join('\n') : null,
    'output: single polished scene still with readable composition and consistent anatomy',
  ]
    .filter(Boolean)
    .join('\n');
}

export function newMoodboardTileId(): string {
  return `mb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
