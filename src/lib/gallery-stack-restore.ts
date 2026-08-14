import type { ComfyGalleryEntry } from './comfyui-gallery-entry';
import type { ComfyImageModel } from './comfy-models/client';
import {
  normalizeComposeIdentityKind,
  normalizeComposeIdentityLockStrength,
} from './compose-identity-lock';
import { normalizeSessionLoraStrengthOverrides } from './lora-stack';
import {
  setSessionLoraIdsForModel,
  setSessionLoraStrengthOverridesForModel,
} from './model-lora-map';
import { normalizeQueueQualityProfile } from './queue-quality-profile';
import { loadSettingsCache, saveSharedSettings, type SharedToolSettings } from './settings-cache';
import { embeddingStem } from './textual-inversion';

export function normalizeSessionEmbeddingTokens(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const entry of value) {
    const stem = typeof entry === 'string' ? embeddingStem(entry) : '';
    const key = stem.toLowerCase();
    if (!stem || seen.has(key)) {
      continue;
    }
    seen.add(key);
    tokens.push(stem);
    if (tokens.length >= 32) {
      break;
    }
  }
  return tokens;
}

export function galleryEntryHasRestorableStack(
  entry: Pick<
    ComfyGalleryEntry,
    | 'model'
    | 'sessionActiveLoraIds'
    | 'sessionLoraStrengthOverrides'
    | 'sessionEmbeddingTokens'
    | 'queueQualityProfile'
    | 'queueParams'
  >
): boolean {
  if (entry.model?.trim()) {
    return true;
  }
  if (entry.sessionActiveLoraIds !== undefined) {
    return true;
  }
  if (
    entry.sessionLoraStrengthOverrides &&
    Object.keys(entry.sessionLoraStrengthOverrides).length > 0
  ) {
    return true;
  }
  if (entry.sessionEmbeddingTokens && entry.sessionEmbeddingTokens.length > 0) {
    return true;
  }
  if (entry.queueQualityProfile) {
    return true;
  }
  return Boolean(entry.queueParams?.ipAdapterImageFilename?.trim());
}

export function formatGalleryStackRestoreSummary(
  entry: Pick<
    ComfyGalleryEntry,
    | 'model'
    | 'sessionActiveLoraIds'
    | 'sessionEmbeddingTokens'
    | 'queueQualityProfile'
    | 'queueParams'
  >
): string {
  const parts: string[] = [];
  if (entry.model?.trim()) {
    parts.push(entry.model.trim());
  }
  if (entry.queueQualityProfile) {
    parts.push(normalizeQueueQualityProfile(entry.queueQualityProfile));
  }
  if (entry.sessionActiveLoraIds !== undefined) {
    parts.push(`${entry.sessionActiveLoraIds.length} LoRAs`);
  }
  if (entry.sessionEmbeddingTokens?.length) {
    parts.push(`${entry.sessionEmbeddingTokens.length} embeddings`);
  }
  if (entry.queueParams?.ipAdapterImageFilename?.trim()) {
    parts.push('identity');
  }
  return parts.join(' · ');
}

/** Merge a still's Generate stack onto shared settings. Does not touch workflowJson. */
export function applyGalleryStackToShared<T extends SharedToolSettings>(
  shared: T,
  entry: Pick<
    ComfyGalleryEntry,
    | 'model'
    | 'sessionActiveLoraIds'
    | 'sessionLoraStrengthOverrides'
    | 'sessionEmbeddingTokens'
    | 'queueQualityProfile'
    | 'queueParams'
  >
): T {
  const model = entry.model?.trim();
  let next: T = { ...shared };

  if (model) {
    next = { ...next, model: model as ComfyImageModel };
  }

  if (entry.queueQualityProfile) {
    next = {
      ...next,
      queueQualityProfile: normalizeQueueQualityProfile(entry.queueQualityProfile),
    };
  }

  const targetModel = (model || next.model) as ComfyImageModel;
  if (entry.sessionActiveLoraIds !== undefined) {
    const ids = entry.sessionActiveLoraIds
      .map(id => (typeof id === 'string' ? id.trim() : ''))
      .filter(Boolean)
      .slice(0, 32);
    next = {
      ...next,
      sessionActiveLoraIds: ids,
      sessionActiveLoraIdsByModel: setSessionLoraIdsForModel(
        next.sessionActiveLoraIdsByModel,
        targetModel,
        ids
      ),
    };
  }

  if (entry.sessionLoraStrengthOverrides) {
    const normalized = normalizeSessionLoraStrengthOverrides(entry.sessionLoraStrengthOverrides);
    next = {
      ...next,
      sessionLoraStrengthOverrides: normalized,
      sessionLoraStrengthOverridesByModel: setSessionLoraStrengthOverridesForModel(
        next.sessionLoraStrengthOverridesByModel,
        targetModel,
        normalized
      ),
    };
  }

  if (entry.sessionEmbeddingTokens !== undefined) {
    next = {
      ...next,
      sessionEmbeddingTokens: normalizeSessionEmbeddingTokens(entry.sessionEmbeddingTokens),
    };
  }

  const identityFilename = entry.queueParams?.ipAdapterImageFilename?.trim();
  if (identityFilename) {
    const stack = (entry.queueParams?.ipAdapterImageFilenames ?? [])
      .map(name => name?.trim())
      .filter(Boolean) as string[];
    next = {
      ...next,
      ipAdapterImageFilename: identityFilename,
      ipAdapterImageFilenames: stack.length > 0 ? stack : [identityFilename],
      ipAdapterStrength:
        entry.queueParams?.ipAdapterStrength != null
          ? normalizeComposeIdentityLockStrength(entry.queueParams.ipAdapterStrength)
          : next.ipAdapterStrength,
      identityKind: entry.queueParams?.identityKind
        ? normalizeComposeIdentityKind(entry.queueParams.identityKind)
        : next.identityKind,
    };
  }

  return next;
}

/** Persist the still's stack onto Generate session settings and toast. */
export function applyGalleryStackToSession(entry: ComfyGalleryEntry): {
  applied: boolean;
  summary: string;
} {
  if (typeof window === 'undefined') {
    return { applied: false, summary: '' };
  }
  const next = applyGalleryStackToShared(loadSettingsCache().shared, entry);
  saveSharedSettings(next, { notify: true });
  const summary = formatGalleryStackRestoreSummary(entry);
  void import('./app-toast').then(({ pushAppToast }) => {
    pushAppToast({
      text: summary ? `Stack on Generate · ${summary}` : 'Stack restored on Generate',
      href: '/',
    });
  });
  return { applied: true, summary };
}
