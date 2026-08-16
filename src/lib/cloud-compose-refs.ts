import type { EngineId } from './engine/types';
import { isCloudEngine } from './engine/capabilities';

/** Documented Fal endpoints that take `image_urls` (not a single `image_url`). */
export const FAL_MULTI_REF_EDIT_MODELS = [
  'fal-ai/flux-pro/kontext/multi',
  'fal-ai/flux-pro/kontext/max/multi',
] as const;

export const CLOUD_COMPOSE_SINGLE_REF_WARNING =
  'Cloud img2img sends Image 1 only. Image 2–4 stay in the prompt.';

export const CLOUD_COMPOSE_TRANSFER_BLOCKED =
  'Transfer needs Image 2 on the model. This cloud img2img endpoint is single-ref — switch to Fal Kontext multi, or queue on local Comfy.';

export function isFalMultiRefEditModel(modelId?: string | null): boolean {
  const id = String(modelId ?? '')
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, '');
  if (!id) {
    return false;
  }
  return FAL_MULTI_REF_EDIT_MODELS.some(known => id === known || id.endsWith(`/${known}`));
}

/** Replicate has no documented multi-ref edit we will invent. Fal only when the id is Kontext multi. */
export function isCloudMultiRefEditModel(
  engine: EngineId | undefined,
  modelId?: string | null
): boolean {
  if (engine === 'fal') {
    return isFalMultiRefEditModel(modelId);
  }
  return false;
}

export function cloudComposeSendsOnlyImage1(
  engine: EngineId | undefined,
  modelId?: string | null
): boolean {
  return isCloudEngine(engine) && !isCloudMultiRefEditModel(engine, modelId);
}

export function extraCloudComposeFilenames(
  filenames: Array<string | undefined> | undefined,
  engine: EngineId | undefined,
  modelId?: string | null
): string[] {
  if (!isCloudMultiRefEditModel(engine, modelId)) {
    return [];
  }
  return (filenames ?? [])
    .slice(1)
    .map(name => name?.trim() ?? '')
    .filter(Boolean);
}

export function filledComposeExtraCount(filenames: Array<string | undefined> | undefined): number {
  return (filenames ?? []).slice(1).filter(name => name?.trim()).length;
}

export function cloudComposeBlocksTransfer(input: {
  engine?: EngineId;
  modelId?: string | null;
  mode?: string;
  extraFilled?: boolean;
}): boolean {
  if (input.mode !== 'transfer' || !input.extraFilled) {
    return false;
  }
  return cloudComposeSendsOnlyImage1(input.engine, input.modelId);
}
