import { fetchComfyObjectInfoCached } from './comfyui-object-info-cache';
import { isAudioModel, isMeshModel } from './queue-tool-model';
import { ensureAudioWorkflowScaffold, ensureMeshWorkflowScaffold } from './ensure-media-workflow';
import type { ComfyImageModel } from './comfy-models/client';
import type { SharedToolSettings } from './settings-cache';

export async function pinMediaWeightsAfterInstall(
  kind: 'audio' | 'mesh',
  model: string
): Promise<{
  sharedPatch?: Partial<SharedToolSettings>;
  note: string;
}> {
  if (kind === 'audio' && !isAudioModel(model)) {
    return { note: 'Installed weights. Refresh ComfyUI if loaders stay empty.' };
  }
  if (kind === 'mesh' && !isMeshModel(model)) {
    return { note: 'Installed weights. Refresh ComfyUI if loaders stay empty.' };
  }
  await fetchComfyObjectInfoCached({ forceRefresh: true }).catch(() => null);
  const result =
    kind === 'audio'
      ? ensureAudioWorkflowScaffold(model as ComfyImageModel)
      : ensureMeshWorkflowScaffold(model as ComfyImageModel);
  return {
    sharedPatch: result.sharedPatch,
    note: result.created
      ? `Mapped ${result.model} and created a ${kind} scaffold. Refresh ComfyUI if a loader still looks empty.`
      : `Mapped ${result.model} → workflow “${result.workflow.name}”. Refresh ComfyUI if a loader still looks empty.`,
  };
}
