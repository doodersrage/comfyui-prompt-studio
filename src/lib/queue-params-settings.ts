import type { WorkflowParamValues } from "./comfyui-config";
import { readBrowserValue, writeBrowserValue } from "./browser-storage";

export const QUEUE_PARAMS_KEY = "comfy-queue-params-v1";

export type QueueParamsSettings = WorkflowParamValues & {
  enabled?: boolean;
};

export const DEFAULT_QUEUE_PARAMS: QueueParamsSettings = {
  enabled: false,
  seed: "",
  width: "",
  height: "",
  cfg: "",
  steps: "",
};

export function loadQueueParamsSettings(): QueueParamsSettings {
  if (typeof window === "undefined") {
    return DEFAULT_QUEUE_PARAMS;
  }
  try {
    const parsed = readBrowserValue<QueueParamsSettings>(QUEUE_PARAMS_KEY);
    if (!parsed) {
      return DEFAULT_QUEUE_PARAMS;
    }
    return { ...DEFAULT_QUEUE_PARAMS, ...parsed };
  } catch {
    return DEFAULT_QUEUE_PARAMS;
  }
}

export function saveQueueParamsSettings(settings: QueueParamsSettings): void {
  if (typeof window === "undefined") {
    return;
  }
  writeBrowserValue(QUEUE_PARAMS_KEY, settings);
}

export function resolveQueueParams(base?: WorkflowParamValues): WorkflowParamValues {
  const settings = loadQueueParamsSettings();
  const seed =
    settings.seed?.toString().trim() ||
    base?.seed?.toString().trim() ||
    String(Math.floor(Math.random() * 2 ** 32));

  const merged: WorkflowParamValues = {
    seed,
    ...(settings.enabled
      ? {
          width: settings.width?.toString().trim() || base?.width?.toString().trim(),
          height: settings.height?.toString().trim() || base?.height?.toString().trim(),
          cfg: settings.cfg?.toString().trim() || base?.cfg?.toString().trim(),
          steps: settings.steps?.toString().trim() || base?.steps?.toString().trim(),
        }
      : base),
  };

  for (const key of Object.keys(merged) as Array<keyof WorkflowParamValues>) {
    const value = merged[key];
    if (value == null || value.toString().trim() === "") {
      delete merged[key];
    }
  }

  return merged;
}
