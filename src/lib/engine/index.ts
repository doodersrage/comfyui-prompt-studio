import { loadEngineSettings } from "@/lib/engine-settings";
import { comfyEngineAdapter } from "./comfy-adapter";
import { diffusersEngineAdapter } from "./diffusers-adapter";
import type { EngineAdapter, EngineId } from "./types";

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
} from "./types";

export { comfyEngineAdapter } from "./comfy-adapter";
export { diffusersEngineAdapter } from "./diffusers-adapter";
export { buildDiffusersViewPath, buildEngineViewPath } from "./view-paths";

export function getEngineAdapterById(id: EngineId | undefined): EngineAdapter {
  return id === "diffusers" ? diffusersEngineAdapter : comfyEngineAdapter;
}

/** Active inference engine (ComfyUI default; Diffusers when selected in settings). */
export function getEngineAdapter(): EngineAdapter {
  if (typeof window !== "undefined" && loadEngineSettings().engine === "diffusers") {
    return diffusersEngineAdapter;
  }
  return comfyEngineAdapter;
}
