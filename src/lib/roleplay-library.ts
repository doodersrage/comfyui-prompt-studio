import { readBrowserValue, writeBrowserValue } from './browser-storage';
import { DEFAULT_ROLEPLAY_TOOL_CACHE, type RoleplayToolCache } from './settings-cache';
import {
  CUSTOM_ROLEPLAY_PERSONA_ID,
  getRoleplayArchetype,
  lastRoleplayStillImage,
  MAX_ROLEPLAY_STORY_BEATS,
  normalizeRoleplayCharacterName,
  normalizeRoleplayContent,
  normalizeRoleplayIsolateSubject,
  normalizeRoleplayPlayAs,
  normalizeRoleplayTone,
  parseRoleplayAllowGore,
  parseRoleplayBio,
  ROLEPLAY_INTRO_SCENE_ID,
  type RoleplayBio,
  type RoleplayStoryBeat,
} from './roleplay';

export const ROLEPLAY_LIBRARY_KEY = 'comfy-prompt-roleplay-library-v1';
export const ROLEPLAY_LIBRARY_UPDATED_EVENT = 'roleplay-library-updated';
export const MAX_ROLEPLAY_LIBRARY_SESSIONS = 24;

export type RoleplayLibrarySession = {
  id: string;
  createdAt: number;
  updatedAt: number;
  title: string;
  coverImageUrl?: string;
  beatCount: number;
  snapshot: RoleplayToolCache;
};

function notifyRoleplayLibraryUpdated(): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
    return;
  }
  window.dispatchEvent(new Event(ROLEPLAY_LIBRARY_UPDATED_EVENT));
}

function readString(value: unknown, max = 240): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function normalizeStoryBeat(value: unknown): RoleplayStoryBeat | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const title = readString(record.title, 80);
  if (!title) {
    return null;
  }
  const blurb = readString(record.blurb, 400) || title;
  const id = readString(record.id, 80) || title;
  const at = typeof record.at === 'number' && Number.isFinite(record.at) ? record.at : Date.now();
  const beat: RoleplayStoryBeat = { id: id || title, title, blurb, at };
  if (typeof record.prompt === 'string' && record.prompt.trim()) {
    beat.prompt = record.prompt.trim().slice(0, 4000);
  }
  if (typeof record.promptId === 'string' && record.promptId.trim()) {
    beat.promptId = record.promptId.trim();
  }
  if (typeof record.imageUrl === 'string' && record.imageUrl.trim()) {
    beat.imageUrl = record.imageUrl.trim();
  }
  if (
    record.stillStatus === 'writing' ||
    record.stillStatus === 'queued' ||
    record.stillStatus === 'running' ||
    record.stillStatus === 'completed' ||
    record.stillStatus === 'error'
  ) {
    beat.stillStatus = record.stillStatus;
  }
  if (Array.isArray(record.stillTakes)) {
    beat.stillTakes = record.stillTakes
      .filter((take): take is NonNullable<RoleplayStoryBeat['stillTakes']>[number] =>
        Boolean(take && typeof take === 'object')
      )
      .slice(-8);
  }
  if (typeof record.stillTakeIndex === 'number' && Number.isInteger(record.stillTakeIndex)) {
    beat.stillTakeIndex = record.stillTakeIndex;
  }
  return beat;
}

function normalizeBio(value: unknown): RoleplayBio | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const name = readString(record.name, 80);
  const look = readString(record.look, 400) || readString(record.appearance, 400);
  const personality = readString(record.personality, 400) || readString(record.bio, 400);
  if (!name || !look || !personality) {
    return undefined;
  }
  return parseRoleplayBio(value);
}

export function roleplaySessionTitle(snapshot: RoleplayToolCache): string {
  const named = normalizeRoleplayCharacterName(snapshot.characterName);
  if (named) {
    return named;
  }
  const bioName = snapshot.bio?.name.trim();
  if (bioName) {
    return bioName;
  }
  if (snapshot.personaId === CUSTOM_ROLEPLAY_PERSONA_ID) {
    return snapshot.customPersona?.trim().slice(0, 40) || 'Custom roleplay';
  }
  return getRoleplayArchetype(snapshot.personaId)?.label ?? 'Untitled roleplay';
}

export function roleplaySessionBeatCount(story: RoleplayStoryBeat[] | undefined): number {
  return (story ?? []).filter(beat => beat.id !== ROLEPLAY_INTRO_SCENE_ID).length;
}

export function roleplaySessionHasProgress(cache: RoleplayToolCache | undefined): boolean {
  if (!cache) {
    return false;
  }
  if (cache.bio?.name.trim() && cache.bio.look.trim()) {
    return true;
  }
  return (cache.story ?? []).some(beat => beat.title.trim());
}

export function normalizeRoleplayLibrarySnapshot(value: unknown): RoleplayToolCache | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const story = Array.isArray(record.story)
    ? record.story
        .map(entry => normalizeStoryBeat(entry))
        .filter((entry): entry is RoleplayStoryBeat => Boolean(entry))
        .slice(-MAX_ROLEPLAY_STORY_BEATS)
    : [];
  const bio = normalizeBio(record.bio);
  return {
    personaId: readString(record.personaId, 80) || DEFAULT_ROLEPLAY_TOOL_CACHE.personaId,
    customPersona: readString(record.customPersona, 400) || undefined,
    characterName: normalizeRoleplayCharacterName(record.characterName) || undefined,
    extraHints: readString(record.extraHints, 800) || undefined,
    setting: readString(record.setting, 200) || undefined,
    tone: normalizeRoleplayTone(typeof record.tone === 'string' ? record.tone : undefined),
    content: normalizeRoleplayContent(
      typeof record.content === 'string' ? record.content : undefined
    ),
    playAs: normalizeRoleplayPlayAs(typeof record.playAs === 'string' ? record.playAs : undefined),
    referenceImageUrl: readString(record.referenceImageUrl, 2000) || undefined,
    referenceImageFilename: readString(record.referenceImageFilename, 240) || undefined,
    referenceOriginalUrl: readString(record.referenceOriginalUrl, 2000) || undefined,
    referenceOriginalFilename: readString(record.referenceOriginalFilename, 240) || undefined,
    isolateSubject: normalizeRoleplayIsolateSubject(record.isolateSubject),
    referenceIsolated: record.referenceIsolated === true,
    bio,
    story,
    autoQueue: record.autoQueue !== false,
    allowGore: parseRoleplayAllowGore(record.allowGore),
    activeSessionId: readString(record.activeSessionId, 80) || undefined,
  };
}

export function normalizeRoleplayLibrarySession(value: unknown): RoleplayLibrarySession | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const snapshot = normalizeRoleplayLibrarySnapshot(record.snapshot ?? record);
  if (!snapshot || !roleplaySessionHasProgress(snapshot)) {
    return null;
  }
  const id = readString(record.id, 80) || `roleplay-${crypto.randomUUID()}`;
  const createdAt =
    typeof record.createdAt === 'number' && Number.isFinite(record.createdAt)
      ? record.createdAt
      : Date.now();
  const updatedAt =
    typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt)
      ? record.updatedAt
      : createdAt;
  const cover = lastRoleplayStillImage(snapshot.story)?.url;
  return {
    id,
    createdAt,
    updatedAt,
    title: readString(record.title, 80) || roleplaySessionTitle(snapshot),
    ...(cover ? { coverImageUrl: cover } : {}),
    beatCount: roleplaySessionBeatCount(snapshot.story),
    snapshot: { ...snapshot, activeSessionId: id },
  };
}

export function loadRoleplayLibrary(): RoleplayLibrarySession[] {
  const raw = readBrowserValue<unknown>(ROLEPLAY_LIBRARY_KEY) ?? [];
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map(entry => normalizeRoleplayLibrarySession(entry))
    .filter((entry): entry is RoleplayLibrarySession => Boolean(entry))
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, MAX_ROLEPLAY_LIBRARY_SESSIONS);
}

export function saveRoleplayLibrary(sessions: RoleplayLibrarySession[]): void {
  writeBrowserValue(
    ROLEPLAY_LIBRARY_KEY,
    sessions
      .map(entry => normalizeRoleplayLibrarySession(entry))
      .filter((entry): entry is RoleplayLibrarySession => Boolean(entry))
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, MAX_ROLEPLAY_LIBRARY_SESSIONS)
  );
  notifyRoleplayLibraryUpdated();
}

export function snapshotRoleplaySession(
  cache: RoleplayToolCache,
  id?: string
): RoleplayLibrarySession | null {
  const snapshot = normalizeRoleplayLibrarySnapshot({
    ...cache,
    activeSessionId: id?.trim() || cache.activeSessionId,
  });
  if (!snapshot || !roleplaySessionHasProgress(snapshot)) {
    return null;
  }
  const sessionId = snapshot.activeSessionId?.trim() || `roleplay-${crypto.randomUUID()}`;
  const existing = loadRoleplayLibrary().find(entry => entry.id === sessionId);
  const now = Date.now();
  return normalizeRoleplayLibrarySession({
    id: sessionId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    title: roleplaySessionTitle(snapshot),
    snapshot: { ...snapshot, activeSessionId: sessionId },
  });
}

export function upsertRoleplayLibrarySession(
  session: RoleplayLibrarySession
): RoleplayLibrarySession {
  const normalized = normalizeRoleplayLibrarySession(session);
  if (!normalized) {
    return session;
  }
  const next = [
    normalized,
    ...loadRoleplayLibrary().filter(entry => entry.id !== normalized.id),
  ].slice(0, MAX_ROLEPLAY_LIBRARY_SESSIONS);
  saveRoleplayLibrary(next);
  return normalized;
}

export function persistRoleplayLibraryFromCache(
  cache: RoleplayToolCache
): { session: RoleplayLibrarySession; cache: RoleplayToolCache } | null {
  const session = snapshotRoleplaySession(cache);
  if (!session) {
    return null;
  }
  const saved = upsertRoleplayLibrarySession(session);
  return {
    session: saved,
    cache: { ...cache, ...saved.snapshot, activeSessionId: saved.id },
  };
}

export function deleteRoleplayLibrarySession(id: string): void {
  const key = id.trim();
  if (!key) {
    return;
  }
  saveRoleplayLibrary(loadRoleplayLibrary().filter(entry => entry.id !== key));
}

export function getRoleplayLibrarySession(id: string): RoleplayLibrarySession | null {
  const key = id.trim();
  if (!key) {
    return null;
  }
  return loadRoleplayLibrary().find(entry => entry.id === key) ?? null;
}

export function applyRoleplayLibrarySession(session: RoleplayLibrarySession): RoleplayToolCache {
  const snapshot = normalizeRoleplayLibrarySnapshot(session.snapshot) ?? session.snapshot;
  return {
    ...DEFAULT_ROLEPLAY_TOOL_CACHE,
    ...snapshot,
    activeSessionId: session.id,
  };
}

export function startNewRoleplaySession(current: RoleplayToolCache): RoleplayToolCache {
  return {
    ...DEFAULT_ROLEPLAY_TOOL_CACHE,
    personaId: current.personaId,
    customPersona: current.customPersona,
    characterName: current.characterName,
    extraHints: current.extraHints,
    setting: current.setting,
    tone: current.tone,
    content: current.content,
    playAs: current.playAs,
    referenceImageUrl: current.referenceImageUrl,
    referenceImageFilename: current.referenceImageFilename,
    referenceOriginalUrl: current.referenceOriginalUrl,
    referenceOriginalFilename: current.referenceOriginalFilename,
    isolateSubject: current.isolateSubject,
    referenceIsolated: current.referenceIsolated,
    autoQueue: current.autoQueue,
    allowGore: current.allowGore,
    activeSessionId: undefined,
  };
}
