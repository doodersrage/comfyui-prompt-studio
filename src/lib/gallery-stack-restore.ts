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
import { buildSessionRecipeFromShared, pushSessionRecipe } from './session-recipes';
import { embeddingStem } from './textual-inversion';

export function parseEmbeddingTokensFromPrompt(prompt?: string): string[] {
  if (!prompt?.trim()) {
    return [];
  }
  const stems: string[] = [];
  const pattern = /\bembedding:([^\s,]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(prompt)) !== null) {
    stems.push(match[1] ?? '');
  }
  return normalizeSessionEmbeddingTokens(stems);
}

function resolveEntryEmbeddingTokens(
  entry: Pick<ComfyGalleryEntry, 'sessionEmbeddingTokens' | 'prompt'>
): string[] | undefined {
  const stored =
    entry.sessionEmbeddingTokens !== undefined
      ? normalizeSessionEmbeddingTokens(entry.sessionEmbeddingTokens)
      : undefined;
  if (stored && stored.length > 0) {
    return stored;
  }
  const parsed = parseEmbeddingTokensFromPrompt(entry.prompt);
  if (parsed.length > 0) {
    return parsed;
  }
  return stored;
}

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
    | 'prompt'
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
  if (resolveEntryEmbeddingTokens(entry)?.length) {
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
    | 'prompt'
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
  const embeddings = resolveEntryEmbeddingTokens(entry);
  if (embeddings?.length) {
    parts.push(`${embeddings.length} embeddings`);
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
    | 'prompt'
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

  const embeddings = resolveEntryEmbeddingTokens(entry);
  if (embeddings !== undefined) {
    next = {
      ...next,
      sessionEmbeddingTokens: embeddings,
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

export function galleryEntryCanSaveLook(
  entry: Pick<ComfyGalleryEntry, 'status' | 'reviewRating' | 'model'>
): boolean {
  return (
    entry.status === 'completed' && (entry.reviewRating ?? 0) >= 4 && Boolean(entry.model?.trim())
  );
}

/** Save a named Generate look from a 4–5★ still (session recipe, not a new tab). */
export function saveGalleryLookFromEntry(entry: ComfyGalleryEntry): {
  ok: boolean;
  label?: string;
  error?: string;
} {
  if (typeof window === 'undefined') {
    return { ok: false, error: 'Browser only.' };
  }
  if (!galleryEntryCanSaveLook(entry)) {
    return { ok: false, error: 'Rate 4–5★ to save a look.' };
  }
  const shared = applyGalleryStackToShared(loadSettingsCache().shared, entry);
  const stamp = new Date();
  const date = `${stamp.getMonth() + 1}/${stamp.getDate()}`;
  const label = `Look · ${entry.model?.trim() ?? 'session'} · ${date}`.slice(0, 48);
  const recipe = buildSessionRecipeFromShared({
    shared,
    toolId: 'generate',
    label,
  });
  pushSessionRecipe(recipe);
  void import('./app-toast').then(({ pushAppToast }) => {
    pushAppToast({
      text: `Saved look · ${recipe.label}`,
    });
  });
  return { ok: true, label: recipe.label };
}
