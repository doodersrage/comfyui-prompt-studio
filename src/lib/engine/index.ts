import { loadEngineSettings } from '@/lib/engine-settings';
import { comfyEngineAdapter } from './comfy-adapter';
import { diffusersEngineAdapter } from './diffusers-adapter';
import { falEngineAdapter } from './fal-adapter';
import { replicateEngineAdapter } from './replicate-adapter';
import type { EngineAdapter, EngineId } from './types';

export type {
  EngineAdapter,
  EngineId,
  EngineJobStatus,
  EngineOutputImage,
  EngineProgressEvent,
  EngineProgressSubscription,
  EngineQueueResult,
  EngineStatusResult,
  EngineSubscribeProgressInput,
  EngineUploadInput,
  EngineUploadedImage,
  EngineViewPathOptions,
} from './types';

export {
  CLOUD_ENGINE_OPTIONS,
  DEFAULT_FAL_IMG2IMG_MODEL,
  DEFAULT_FAL_TXT2IMG_MODEL,
  DEFAULT_REPLICATE_IMG2IMG_MODEL,
  DEFAULT_REPLICATE_TXT2IMG_MODEL,
  FAL_MODEL_PRESETS,
  FAL_QUEUE_HOST,
  REPLICATE_API_HOST,
  REPLICATE_MODEL_PRESETS,
  cloudEngineHost,
  cloudSettingsHref,
  defaultCloudImg2ImgModel,
  defaultCloudTxt2ImgModel,
  engineDisplayName,
  engineUsesComfyGraph,
  isCloudEngine,
  normalizeEngineId,
  parseEngineId,
} from './capabilities';

export { comfyEngineAdapter } from './comfy-adapter';
export { diffusersEngineAdapter } from './diffusers-adapter';
export { falEngineAdapter } from './fal-adapter';
export { replicateEngineAdapter } from './replicate-adapter';
export {
  buildDiffusersViewPath,
  buildEngineViewPath,
  buildFalViewPath,
  buildReplicateViewPath,
} from './view-paths';

export function getEngineAdapterById(id: EngineId | undefined): EngineAdapter {
  if (id === 'diffusers') {
    return diffusersEngineAdapter;
  }
  if (id === 'fal') {
    return falEngineAdapter;
  }
  if (id === 'replicate') {
    return replicateEngineAdapter;
  }
  return comfyEngineAdapter;
}

/** Active inference engine (Comfy-primary; Diffusers / Fal / Replicate optional). */
export function getEngineAdapter(): EngineAdapter {
  return getEngineAdapterById(loadEngineSettings().engine);
}
