/**
 * Character OS — one character record for Generate, Roleplay, Compose, Video, and LoRA export.
 * Absorbs identity bundles, session IP-Adapter lock, and Roleplay cast fields.
 */

import {
  BROWSER_STORAGE_HEALTH_EVENT,
  readBrowserValue,
  writeBrowserValue,
} from './browser-storage';
import type { CharacterIdentityBundle } from './character-identity-bundle';
import {
  applyCharacterIdentityBundle,
  buildCharacterIdentityBundle,
} from './character-identity-bundle';
import { normalizeComposeIdentityKind } from './compose-identity-lock';
import type { RoleplayLibrarySession } from './roleplay-library';
import type { RoleplayBio, RoleplayContentId, RoleplayPlayAs, RoleplayTone } from './roleplay';
import type { SharedToolSettings } from './settings-cache';

export const CHARACTERS_KEY = 'comfy-prompt-characters-v1';
export const CHARACTERS_UPDATED_EVENT = 'prompt-studio-characters-updated';
export const MAX_CHARACTERS = 48;

export type CharacterRecord = {
  id: string;
  name: string;
  version: 1;
  updatedAt: number;
  descriptor?: string;
  hints?: string;
  bio?: RoleplayBio;
  ipAdapter?: {
    imageFilename?: string;
    imageFilenames?: string[];
    imageUrl?: string;
    comfyUrl?: string;
    strength?: number;
    modelFilename?: string;
    kind?: SharedToolSettings['identityKind'];
  };
  reference?: {
    originalUrl?: string;
    originalFilename?: string;
    isolatedUrl?: string;
    isolatedFilename?: string;
    isolated?: boolean;
    isolateSubject?: boolean;
  };
  lockedWardrobeId?: string;
  lockedLocation?: string;
  lockedVariationSeed?: string;
  alwaysIncludeClothing?: boolean;
  model?: string;
  detail?: SharedToolSettings['detail'];
  negativeProfileId?: string;
  loraTriggerPhrases?: string[];
  personaId?: string;
  customPersona?: string;
  characterName?: string;
  setting?: string;
  tone?: RoleplayTone;
  content?: RoleplayContentId;
  playAs?: RoleplayPlayAs;
  notes?: string;
};

type CharacterStore = {
  version: 1;
  migratedFromBundles: boolean;
  characters: CharacterRecord[];
};

const EMPTY_CHARACTERS: CharacterRecord[] = [];
let charactersSnapshot: CharacterRecord[] = EMPTY_CHARACTERS;
let charactersSnapshotKey = '';

function charactersSnapshotKeyFor(characters: CharacterRecord[]): string {
  return characters.map(character => `${character.id}:${character.updatedAt}`).join('|');
}

function cacheCharactersSnapshot(characters: CharacterRecord[]): CharacterRecord[] {
  const key = charactersSnapshotKeyFor(characters);
  if (key === charactersSnapshotKey) {
    return charactersSnapshot;
  }
  charactersSnapshotKey = key;
  charactersSnapshot = characters;
  return charactersSnapshot;
}

function notifyCharactersUpdated(): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
    return;
  }
  window.dispatchEvent(new Event(CHARACTERS_UPDATED_EVENT));
}

/** Stable list for React `useSyncExternalStore` — same reference until the store changes. */
export function getCharactersSnapshot(): CharacterRecord[] {
  return cacheCharactersSnapshot(readStore().characters);
}

export function getServerCharactersSnapshot(): CharacterRecord[] {
  return EMPTY_CHARACTERS;
}

export function subscribeCharacters(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return () => {};
  }
  window.addEventListener(CHARACTERS_UPDATED_EVENT, onStoreChange);
  window.addEventListener(BROWSER_STORAGE_HEALTH_EVENT, onStoreChange);
  return () => {
    window.removeEventListener(CHARACTERS_UPDATED_EVENT, onStoreChange);
    window.removeEventListener(BROWSER_STORAGE_HEALTH_EVENT, onStoreChange);
  };
}

function newCharacterId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `char-${crypto.randomUUID()}`;
  }
  return `char-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function readName(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 80) : '';
}

export function slugCharacterName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function characterFromBundle(bundle: CharacterIdentityBundle, id?: string): CharacterRecord {
  return {
    id: id?.trim() || newCharacterId(),
    name: bundle.name.trim(),
    version: 1,
    updatedAt: Date.parse(bundle.exportedAt) || Date.now(),
    descriptor: bundle.descriptor?.trim() || undefined,
    hints: bundle.hints?.trim() || undefined,
    ipAdapter: {
      imageFilename: bundle.ipAdapterImageFilename?.trim() || undefined,
      strength: bundle.ipAdapterStrength,
      modelFilename: bundle.ipAdapterModelFilename?.trim() || undefined,
    },
    lockedWardrobeId: bundle.lockedWardrobeId,
    lockedLocation: bundle.lockedLocation,
    lockedVariationSeed: bundle.lockedVariationSeed,
    alwaysIncludeClothing: bundle.alwaysIncludeClothing,
    model: bundle.model,
    detail: bundle.detail,
    negativeProfileId: bundle.negativeProfileId,
    loraTriggerPhrases: bundle.loraTriggerPhrases?.filter(Boolean),
    notes: bundle.notes?.trim() || undefined,
  };
}

export function bundleFromCharacter(character: CharacterRecord): CharacterIdentityBundle {
  return {
    version: 1,
    exportedAt: new Date(character.updatedAt).toISOString(),
    name: character.name,
    hints: character.hints,
    model: character.model,
    detail: character.detail,
    lockedWardrobeId: character.lockedWardrobeId,
    lockedLocation: character.lockedLocation,
    lockedVariationSeed: character.lockedVariationSeed,
    alwaysIncludeClothing: character.alwaysIncludeClothing,
    negativeProfileId: character.negativeProfileId,
    loraTriggerPhrases: character.loraTriggerPhrases,
    notes: character.notes,
    descriptor: character.descriptor,
    ipAdapterImageFilename: character.ipAdapter?.imageFilename,
    ipAdapterStrength: character.ipAdapter?.strength,
    ipAdapterModelFilename: character.ipAdapter?.modelFilename,
  };
}

export function characterFromShared(
  shared: SharedToolSettings,
  input: { name: string; hints?: string; bio?: RoleplayBio; notes?: string }
): CharacterRecord {
  const name = input.name.trim();
  return {
    id: newCharacterId(),
    name,
    version: 1,
    updatedAt: Date.now(),
    descriptor: shared.activeCharacterDescriptor?.trim() || undefined,
    hints: input.hints?.trim() || undefined,
    bio: input.bio,
    ipAdapter: {
      imageFilename: shared.ipAdapterImageFilename?.trim() || undefined,
      imageFilenames: shared.ipAdapterImageFilenames,
      imageUrl: shared.ipAdapterImageUrl?.trim() || undefined,
      comfyUrl: shared.ipAdapterComfyUrl?.trim() || undefined,
      strength: shared.ipAdapterStrength,
      modelFilename: shared.ipAdapterModelFilename?.trim() || undefined,
      kind: shared.identityKind,
    },
    lockedWardrobeId: shared.lockedWardrobeId,
    lockedLocation: shared.lockedLocation,
    lockedVariationSeed: shared.lockedVariationSeed,
    alwaysIncludeClothing: shared.alwaysIncludeClothing,
    model: shared.model,
    detail: shared.detail,
    characterName: name,
    notes: input.notes?.trim() || undefined,
  };
}

export function applyCharacterRecord(character: CharacterRecord): Partial<SharedToolSettings> {
  const bundlePatch = applyCharacterIdentityBundle(bundleFromCharacter(character));
  return {
    ...bundlePatch,
    activeCharacterId: character.id,
    ipAdapterImageFilenames: character.ipAdapter?.imageFilenames,
    ipAdapterImageUrl: character.ipAdapter?.imageUrl,
    ipAdapterComfyUrl: character.ipAdapter?.comfyUrl,
    identityKind: character.ipAdapter?.kind
      ? normalizeComposeIdentityKind(character.ipAdapter.kind)
      : undefined,
  };
}

export function characterFromRoleplaySession(
  session: RoleplayLibrarySession
): CharacterRecord | null {
  const snapshot = session.snapshot;
  const name =
    readName(session.title) || readName(snapshot.characterName) || readName(snapshot.bio?.name);
  if (!name) {
    return null;
  }
  return {
    id: session.id.startsWith('char-') ? session.id : `char-rp-${session.id}`,
    name,
    version: 1,
    updatedAt: session.updatedAt || Date.now(),
    descriptor: snapshot.bio?.look?.trim() || undefined,
    bio: snapshot.bio,
    reference: {
      originalUrl: snapshot.referenceOriginalUrl,
      originalFilename: snapshot.referenceOriginalFilename,
      isolatedUrl: snapshot.referenceImageUrl,
      isolatedFilename: snapshot.referenceImageFilename,
      isolated: snapshot.referenceIsolated,
      isolateSubject: snapshot.isolateSubject,
    },
    ipAdapter: snapshot.referenceImageFilename
      ? {
          imageFilename: snapshot.referenceImageFilename,
          imageUrl: snapshot.referenceImageUrl,
        }
      : undefined,
    personaId: snapshot.personaId,
    customPersona: snapshot.customPersona,
    characterName: snapshot.characterName,
    setting: snapshot.setting,
    tone: snapshot.tone,
    content: snapshot.content,
    playAs: snapshot.playAs,
  };
}

export function mergeMigratedCharacters(input: {
  existing: CharacterRecord[];
  bundles?: CharacterIdentityBundle[];
  roleplaySessions?: RoleplayLibrarySession[];
}): CharacterRecord[] {
  const byName = new Map<string, CharacterRecord>();
  for (const character of input.existing) {
    const key = slugCharacterName(character.name);
    if (!key) {
      continue;
    }
    byName.set(key, character);
  }

  for (const bundle of input.bundles ?? []) {
    const key = slugCharacterName(bundle.name);
    if (!key || byName.has(key)) {
      continue;
    }
    byName.set(key, characterFromBundle(bundle));
  }

  for (const session of input.roleplaySessions ?? []) {
    const converted = characterFromRoleplaySession(session);
    if (!converted) {
      continue;
    }
    const key = slugCharacterName(converted.name);
    if (!key || byName.has(key)) {
      continue;
    }
    byName.set(key, converted);
  }

  return [...byName.values()]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, MAX_CHARACTERS);
}

function emptyStore(): CharacterStore {
  return { version: 1, migratedFromBundles: false, characters: [] };
}

function readStore(): CharacterStore {
  const raw = readBrowserValue<CharacterStore>(CHARACTERS_KEY);
  if (!raw || raw.version !== 1 || !Array.isArray(raw.characters)) {
    return emptyStore();
  }
  return {
    version: 1,
    migratedFromBundles: raw.migratedFromBundles === true,
    characters: raw.characters.filter(entry => entry && readName(entry.name) && entry.id),
  };
}

function writeStore(store: CharacterStore): void {
  writeBrowserValue(CHARACTERS_KEY, {
    version: 1,
    migratedFromBundles: store.migratedFromBundles,
    characters: store.characters.slice(0, MAX_CHARACTERS),
  });
  notifyCharactersUpdated();
}

export function loadCharacters(): CharacterRecord[] {
  const store = readStore();
  if (store.migratedFromBundles || store.characters.length > 0) {
    return store.characters;
  }
  return store.characters;
}

export function migrateCharactersFromLegacy(input: {
  bundles?: CharacterIdentityBundle[];
  roleplaySessions?: RoleplayLibrarySession[];
}): CharacterRecord[] {
  const store = readStore();
  if (store.migratedFromBundles) {
    return store.characters;
  }
  const characters = mergeMigratedCharacters({
    existing: store.characters,
    bundles: input.bundles,
    roleplaySessions: input.roleplaySessions,
  });
  writeStore({ version: 1, migratedFromBundles: true, characters });
  return characters;
}

export function saveCharacters(characters: CharacterRecord[]): CharacterRecord[] {
  const store = readStore();
  const next = characters
    .filter(entry => readName(entry.name) && entry.id)
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, MAX_CHARACTERS);
  writeStore({ ...store, characters: next });
  return next;
}

export function upsertCharacter(record: CharacterRecord): CharacterRecord[] {
  const name = readName(record.name);
  if (!name) {
    return loadCharacters();
  }
  const nextRecord: CharacterRecord = {
    ...record,
    name,
    version: 1,
    id: record.id?.trim() || newCharacterId(),
    updatedAt: Date.now(),
  };
  const existing = loadCharacters();
  const without = existing.filter(
    entry => entry.id !== nextRecord.id && slugCharacterName(entry.name) !== slugCharacterName(name)
  );
  return saveCharacters([nextRecord, ...without]);
}

export function removeCharacter(id: string): CharacterRecord[] {
  const key = id.trim();
  return saveCharacters(loadCharacters().filter(entry => entry.id !== key));
}

export function getCharacter(id: string | undefined): CharacterRecord | undefined {
  const key = id?.trim();
  if (!key) {
    return undefined;
  }
  return loadCharacters().find(entry => entry.id === key);
}

export function loraTriggerFromCharacter(
  character: CharacterRecord | undefined
): string | undefined {
  const trigger = character?.loraTriggerPhrases?.map(entry => entry.trim()).find(Boolean);
  return trigger || undefined;
}

/** @deprecated Use Character OS records; kept so bundle export stays lossless. */
export function sharedPatchFromLegacyBundle(
  bundle: CharacterIdentityBundle
): Partial<SharedToolSettings> {
  return applyCharacterIdentityBundle(bundle);
}

export function buildBundleFromShared(
  name: string,
  shared: SharedToolSettings,
  hints?: string
): CharacterIdentityBundle {
  return buildCharacterIdentityBundle({ name, shared, hints });
}
