import { loadEngineSettings } from '@/lib/engine-settings';
import { comfyEngineAdapter } from './comfy-adapter';
import { diffusersEngineAdapter } from './diffusers-adapter';
import { falEngineAdapter } from './fal-adapter';
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
  engineDisplayName,
  engineUsesComfyGraph,
  isCloudEngine,
  normalizeEngineId,
  parseEngineId,
  DEFAULT_FAL_IMG2IMG_MODEL,
  DEFAULT_FAL_TXT2IMG_MODEL,
  FAL_MODEL_PRESETS,
  FAL_QUEUE_HOST,
} from './capabilities';

export { comfyEngineAdapter } from './comfy-adapter';
export { diffusersEngineAdapter } from './diffusers-adapter';
export { falEngineAdapter } from './fal-adapter';
export { buildDiffusersViewPath, buildEngineViewPath, buildFalViewPath } from './view-paths';

export function getEngineAdapterById(id: EngineId | undefined): EngineAdapter {
  if (id === 'diffusers') {
    return diffusersEngineAdapter;
  }
  if (id === 'fal') {
    return falEngineAdapter;
  }
  return comfyEngineAdapter;
}

/** Active inference engine (Comfy-primary; Diffusers and Fal optional). */
export function getEngineAdapter(): EngineAdapter {
  return getEngineAdapterById(loadEngineSettings().engine);
}
