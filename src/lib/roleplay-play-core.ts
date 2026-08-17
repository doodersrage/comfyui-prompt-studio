import { avoidedTokensRequestBody } from './avoided-tokens';
import { ISOLATE_QUEUE_BLOCKED_MESSAGE } from './isolate-subject';
import { sharedLlmRequestBody } from './llm-request-options';
import {
  normalizeAvoidedRoleplayNames,
  resolveRoleplayLockedCharacterName,
  type RoleplayBio,
  type RoleplayContentId,
  type RoleplayScene,
  type RoleplayStoryBeat,
  type RoleplayTone,
} from './roleplay';
import type { SharedToolSettings } from './settings-cache';
import type { EnrichedToolGenerateResult } from './specialized/types';

export type RoleplayApiPayload = EnrichedToolGenerateResult & {
  error?: string;
  bio?: RoleplayBio;
  scenes?: RoleplayScene[];
  provider?: 'llm' | 'template';
};

export type RoleplayQueueStillOptions = {
  inputImageFilename?: string;
  inputImageUrl?: string;
  identityLock: true;
  identityLockStrength?: number;
  identityKind?: SharedToolSettings['identityKind'];
};

export function buildRoleplayRequestBody(input: {
  action: 'bio' | 'scenes' | 'prompt';
  situation?: RoleplayScene;
  shared: SharedToolSettings;
  personaId: string;
  customPersona?: string;
  characterName?: string;
  extraHints?: string;
  setting?: string;
  tone: RoleplayTone;
  content: RoleplayContentId;
  allowGore?: boolean;
  hasReferenceImage: boolean;
  isolatedSubject: boolean;
  bio?: RoleplayBio;
  story?: RoleplayStoryBeat[];
  rejectedScenes?: RoleplayScene[];
}): Record<string, unknown> {
  const nameLock = resolveRoleplayLockedCharacterName(input.characterName);
  const writingBio = input.action === 'bio';
  return {
    action: input.action,
    model: input.shared.model,
    detail: input.shared.detail,
    personaId: input.personaId,
    customPersona: input.customPersona,
    characterName: nameLock,
    avoidCharacterNames:
      writingBio && !nameLock ? normalizeAvoidedRoleplayNames([input.bio?.name]) : [],
    extraHints: input.extraHints,
    setting: input.setting,
    lockedLocation: input.shared.lockedLocation,
    isolatedSubject: input.isolatedSubject,
    tone: input.tone,
    content: input.content,
    allowGore: input.allowGore === true,
    hasReferenceImage: input.hasReferenceImage,
    bio: writingBio ? undefined : input.bio,
    story: writingBio ? [] : input.story,
    rejectedScenes: input.action === 'scenes' ? input.rejectedScenes : undefined,
    situation: input.situation,
    ...avoidedTokensRequestBody(),
    ...sharedLlmRequestBody(input.shared),
  };
}

export function buildRoleplayQueueStillOptions(input: {
  photoMode: boolean;
  isolateSubject: boolean;
  referenceIsolated: boolean;
  filename?: string;
  imageUrl?: string;
  identityLockStrength?: SharedToolSettings['ipAdapterStrength'];
  identityKind?: SharedToolSettings['identityKind'];
}): RoleplayQueueStillOptions | undefined {
  if (!input.photoMode) {
    return undefined;
  }
  if (input.isolateSubject && input.referenceIsolated !== true) {
    throw new Error(ISOLATE_QUEUE_BLOCKED_MESSAGE);
  }
  const filename = input.filename?.trim() || '';
  const imageUrl = input.imageUrl?.trim() || '';
  if (!filename && !imageUrl) {
    return undefined;
  }
  return {
    inputImageFilename: filename || undefined,
    inputImageUrl: imageUrl || undefined,
    identityLock: true,
    identityLockStrength: input.identityLockStrength,
    identityKind: input.identityKind,
  };
}

export async function postRoleplayJson(body: unknown): Promise<{
  ok: boolean;
  data: RoleplayApiPayload;
}> {
  const response = await fetch('/api/roleplay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as RoleplayApiPayload;
  return { ok: response.ok, data };
}
