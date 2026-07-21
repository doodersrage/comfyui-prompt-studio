import type { WorkflowParamValues } from "./comfyui-config";
import {
  DEFAULT_CHECKPOINT_TOKEN,
  DEFAULT_UNET_TOKEN,
  DEFAULT_VAE_TOKEN,
  type ModelLoaderFilenames,
} from "./model-checkpoint-map";
import {
  DEFAULT_CONTROLNET_MODEL_TOKEN,
  DEFAULT_CONTROL_IMAGE_TOKEN,
} from "./model-controlnet-map";
import {
  buildLoraFilenameMapFromCustomTokens,
  patchLoraNodesInWorkflow,
} from "./workflow-lora-patch";

export const IMAGE_SCALE_BY_NODE_TYPE = "ImageScaleBy";

export type WorkflowDirectPatchCounts = {
  width?: number;
  height?: number;
  checkpoint?: number;
  unet?: number;
  vae?: number;
  dualClip?: number;
  upscaleModel?: number;
  inputImage?: number;
  maskImage?: number;
  lora?: number;
  controlNet?: number;
  controlImage?: number;
};

const INPUT_IMAGE_TYPES = new Set(["LoadImage", "LoadImageOutput"]);
const MASK_IMAGE_TYPES = new Set(["LoadImageMask"]);

const CHECKPOINT_LOADER_TYPES = new Set([
  "CheckpointLoaderSimple",
  "CheckpointLoader",
]);

const UNET_LOADER_TYPES = new Set(["UNETLoader", "UnetLoaderGGUF"]);

const VAE_LOADER_TYPES = new Set(["VAELoader"]);

const DUAL_CLIP_LOADER_TYPES = new Set(["DualCLIPLoader"]);

const DEPRECATED_QWEN_CLIP_FILENAMES: Record<string, string> = {
  "qwen_2.5_vl_7b_bf16.safetensors": "qwen_2.5_vl_7b.safetensors",
};

const CONTROLNET_LOADER_TYPES = new Set(["ControlNetLoader", "DiffControlNetLoader"]);

const UPSCALE_MODEL_LOADER_TYPES = new Set(["UpscaleModel", "UpscaleModelLoader"]);

function isUnresolvedWorkflowPlaceholder(value: unknown): boolean {
  return typeof value === "string" && /^\{\{[A-Z0-9_]+\}\}$/.test(value.trim());
}

function shouldPatchStringField(
  current: unknown,
  nextValue: string | undefined,
): nextValue is string {
  if (!nextValue?.trim()) {
    return false;
  }
  if (typeof current === "string") {
    if (isUnresolvedWorkflowPlaceholder(current)) {
      return true;
    }
    return current.trim() !== nextValue.trim();
  }
  return current == null || current === "";
}

/** Loader filenames: only fill placeholders/empty fields — never clobber a chosen checkpoint/UNET/VAE. */
function shouldPatchLoaderFilenameField(
  current: unknown,
  nextValue: string | undefined,
): nextValue is string {
  if (!nextValue?.trim()) {
    return false;
  }
  if (typeof current === "string") {
    if (isUnresolvedWorkflowPlaceholder(current)) {
      return true;
    }
    return false;
  }
  return current == null || current === "";
}

function shouldPatchClipFilename(
  current: unknown,
  nextValue: string | undefined,
): nextValue is string {
  if (!nextValue?.trim()) {
    return false;
  }
  if (shouldPatchLoaderFilenameField(current, nextValue)) {
    return true;
  }
  if (typeof current === "string") {
    const deprecated = DEPRECATED_QWEN_CLIP_FILENAMES[current.trim()];
    if (deprecated && deprecated === nextValue.trim()) {
      return true;
    }
  }
  return false;
}

function shouldPatchNumericField(
  current: unknown,
  nextValue: string | number | undefined,
): nextValue is string | number {
  if (nextValue == null || nextValue.toString().trim() === "") {
    return false;
  }
  if (isUnresolvedWorkflowPlaceholder(current)) {
    return true;
  }
  if (typeof current === "number") {
    return Number(current) !== Number(nextValue);
  }
  if (typeof current === "string" && /^\d+$/.test(current.trim())) {
    return Number(current) !== Number(nextValue);
  }
  return current == null || current === "";
}

export function isLatentSizeNode(classType: string, inputs: Record<string, unknown>): boolean {
  const classLower = classType.toLowerCase();
  if (!("width" in inputs) || !("height" in inputs)) {
    return false;
  }
  return (
    classLower.includes("emptylatent") ||
    classLower.includes("latentimage") ||
    (classLower.includes("empty") && classLower.includes("latent"))
  );
}

export function patchLatentSizeInWorkflow(
  workflow: Record<string, unknown>,
  params: Pick<WorkflowParamValues, "width" | "height">,
): { workflow: Record<string, unknown>; patched: WorkflowDirectPatchCounts } {
  const next = structuredClone(workflow);
  const patched: WorkflowDirectPatchCounts = {};

  for (const node of Object.values(next)) {
    if (!node || typeof node !== "object") {
      continue;
    }

    const record = node as {
      class_type?: string;
      inputs?: Record<string, unknown>;
    };
    const inputs = record.inputs;
    if (!inputs || !isLatentSizeNode(record.class_type ?? "", inputs)) {
      continue;
    }

    if (shouldPatchNumericField(inputs.width, params.width)) {
      inputs.width = Number(params.width);
      patched.width = (patched.width ?? 0) + 1;
    }
    if (shouldPatchNumericField(inputs.height, params.height)) {
      inputs.height = Number(params.height);
      patched.height = (patched.height ?? 0) + 1;
    }
  }

  return { workflow: next, patched };
}

export function patchLoaderNodesInWorkflow(
  workflow: Record<string, unknown>,
  loaders: ModelLoaderFilenames,
): { workflow: Record<string, unknown>; patched: WorkflowDirectPatchCounts } {
  const next = structuredClone(workflow);
  const patched: WorkflowDirectPatchCounts = {};

  for (const node of Object.values(next)) {
    if (!node || typeof node !== "object") {
      continue;
    }

    const record = node as {
      class_type?: string;
      inputs?: Record<string, unknown>;
    };
    const classType = record.class_type ?? "";
    const inputs = record.inputs;
    if (!inputs) {
      continue;
    }

    if (
      loaders.checkpoint &&
      CHECKPOINT_LOADER_TYPES.has(classType) &&
      "ckpt_name" in inputs &&
      shouldPatchLoaderFilenameField(inputs.ckpt_name, loaders.checkpoint)
    ) {
      inputs.ckpt_name = loaders.checkpoint;
      patched.checkpoint = (patched.checkpoint ?? 0) + 1;
    }

    if (
      loaders.unet &&
      UNET_LOADER_TYPES.has(classType) &&
      "unet_name" in inputs &&
      shouldPatchLoaderFilenameField(inputs.unet_name, loaders.unet)
    ) {
      inputs.unet_name = loaders.unet;
      patched.unet = (patched.unet ?? 0) + 1;
    }

    if (
      loaders.vae &&
      VAE_LOADER_TYPES.has(classType) &&
      "vae_name" in inputs &&
      shouldPatchLoaderFilenameField(inputs.vae_name, loaders.vae)
    ) {
      inputs.vae_name = loaders.vae;
      patched.vae = (patched.vae ?? 0) + 1;
    }

    if (loaders.dualClip && DUAL_CLIP_LOADER_TYPES.has(classType)) {
      for (const field of ["clip_name1", "clip_name2"] as const) {
        if (
          field in inputs &&
          shouldPatchClipFilename(inputs[field], loaders.dualClip)
        ) {
          inputs[field] = loaders.dualClip;
          patched.dualClip = (patched.dualClip ?? 0) + 1;
        }
      }
    }
  }

  return { workflow: next, patched };
}

export function patchControlNetNodesInWorkflow(
  workflow: Record<string, unknown>,
  input: {
    controlNetModelFilename?: string;
    controlImageFilename?: string;
  },
): { workflow: Record<string, unknown>; patched: WorkflowDirectPatchCounts } {
  const next = structuredClone(workflow);
  const patched: WorkflowDirectPatchCounts = {};

  for (const node of Object.values(next)) {
    if (!node || typeof node !== "object") {
      continue;
    }
    const record = node as {
      class_type?: string;
      inputs?: Record<string, unknown>;
    };
    const classType = record.class_type ?? "";
    const inputs = record.inputs;
    if (!inputs) {
      continue;
    }

    if (
      CONTROLNET_LOADER_TYPES.has(classType) &&
      "control_net_name" in inputs &&
      shouldPatchLoaderFilenameField(inputs.control_net_name, input.controlNetModelFilename)
    ) {
      inputs.control_net_name = input.controlNetModelFilename;
      patched.controlNet = (patched.controlNet ?? 0) + 1;
    }

    if (
      INPUT_IMAGE_TYPES.has(classType) &&
      "image" in inputs &&
      shouldPatchStringField(inputs.image, input.controlImageFilename)
    ) {
      const current = typeof inputs.image === "string" ? inputs.image : "";
      if (
        current.includes(DEFAULT_CONTROL_IMAGE_TOKEN) ||
        isUnresolvedWorkflowPlaceholder(current)
      ) {
        inputs.image = input.controlImageFilename;
        patched.controlImage = (patched.controlImage ?? 0) + 1;
      }
    }
  }

  return { workflow: next, patched };
}

export function patchUpscaleModelNodesInWorkflow(
  workflow: Record<string, unknown>,
  upscaleModelFilename?: string,
): { workflow: Record<string, unknown>; patched: WorkflowDirectPatchCounts } {
  const next = structuredClone(workflow);
  const patched: WorkflowDirectPatchCounts = {};

  if (!upscaleModelFilename?.trim()) {
    return { workflow: next, patched };
  }

  for (const node of Object.values(next)) {
    if (!node || typeof node !== "object") {
      continue;
    }

    const record = node as {
      class_type?: string;
      inputs?: Record<string, unknown>;
    };
    const classType = record.class_type ?? "";
    const inputs = record.inputs;
    if (!inputs || !UPSCALE_MODEL_LOADER_TYPES.has(classType) || !("model_name" in inputs)) {
      continue;
    }

    if (shouldPatchLoaderFilenameField(inputs.model_name, upscaleModelFilename)) {
      inputs.model_name = upscaleModelFilename.trim();
      patched.upscaleModel = (patched.upscaleModel ?? 0) + 1;
    }
  }

  return { workflow: next, patched };
}

function patchImageLoaderNodesInWorkflow(
  workflow: Record<string, unknown>,
  classTypes: Set<string>,
  filename: string | undefined,
  countKey: "inputImage" | "maskImage",
): { workflow: Record<string, unknown>; patched: WorkflowDirectPatchCounts } {
  const next = structuredClone(workflow);
  const patched: WorkflowDirectPatchCounts = {};

  if (!filename?.trim()) {
    return { workflow: next, patched };
  }

  for (const node of Object.values(next)) {
    if (!node || typeof node !== "object") {
      continue;
    }

    const record = node as {
      class_type?: string;
      inputs?: Record<string, unknown>;
    };
    const classType = record.class_type ?? "";
    const inputs = record.inputs;
    if (!inputs || !classTypes.has(classType) || !("image" in inputs)) {
      continue;
    }

    if (shouldPatchStringField(inputs.image, filename)) {
      inputs.image = filename.trim();
      patched[countKey] = (patched[countKey] ?? 0) + 1;
    }
  }

  return { workflow: next, patched };
}

export function patchLoadImageNodesInWorkflow(
  workflow: Record<string, unknown>,
  inputImageFilename?: string,
): { workflow: Record<string, unknown>; patched: WorkflowDirectPatchCounts } {
  return patchImageLoaderNodesInWorkflow(
    workflow,
    INPUT_IMAGE_TYPES,
    inputImageFilename,
    "inputImage",
  );
}

export function patchLoadImageMaskNodesInWorkflow(
  workflow: Record<string, unknown>,
  maskImageFilename?: string,
): { workflow: Record<string, unknown>; patched: WorkflowDirectPatchCounts } {
  return patchImageLoaderNodesInWorkflow(
    workflow,
    MASK_IMAGE_TYPES,
    maskImageFilename,
    "maskImage",
  );
}

function coerceLoaderFieldValue(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }
  return null;
}

/** Last-resort pass: overwrite unresolved loader placeholders on every loader node. */
export function forceResolveLoaderPlaceholders(
  workflow: Record<string, unknown>,
  loaders: ModelLoaderFilenames,
): Record<string, unknown> {
  const next = structuredClone(workflow) as Record<string, unknown>;

  for (const node of Object.values(next)) {
    if (!node || typeof node !== "object") {
      continue;
    }

    const record = node as {
      class_type?: string;
      inputs?: Record<string, unknown>;
    };
    const classType = record.class_type ?? "";
    const inputs = record.inputs;
    if (!inputs) {
      continue;
    }

    if (
      loaders.checkpoint &&
      CHECKPOINT_LOADER_TYPES.has(classType) &&
      "ckpt_name" in inputs
    ) {
      const current = coerceLoaderFieldValue(inputs.ckpt_name);
      if (
        current == null ||
        current.trim() === "" ||
        isUnresolvedWorkflowPlaceholder(current) ||
        current === DEFAULT_CHECKPOINT_TOKEN
      ) {
        inputs.ckpt_name = loaders.checkpoint;
      }
    }

    if (
      loaders.unet &&
      UNET_LOADER_TYPES.has(classType) &&
      "unet_name" in inputs
    ) {
      const current = coerceLoaderFieldValue(inputs.unet_name);
      if (
        current == null ||
        current.trim() === "" ||
        isUnresolvedWorkflowPlaceholder(current) ||
        current === DEFAULT_UNET_TOKEN
      ) {
        inputs.unet_name = loaders.unet;
      }
    }

    if (
      loaders.vae &&
      VAE_LOADER_TYPES.has(classType) &&
      "vae_name" in inputs
    ) {
      const current = coerceLoaderFieldValue(inputs.vae_name);
      if (
        current == null ||
        current.trim() === "" ||
        isUnresolvedWorkflowPlaceholder(current) ||
        current === DEFAULT_VAE_TOKEN
      ) {
        inputs.vae_name = loaders.vae;
      }
    }

    if (loaders.dualClip && DUAL_CLIP_LOADER_TYPES.has(classType)) {
      for (const field of ["clip_name1", "clip_name2"] as const) {
        if (!(field in inputs)) {
          continue;
        }
        const current = coerceLoaderFieldValue(inputs[field]);
        const shouldPatch =
          current == null ||
          current.trim() === "" ||
          isUnresolvedWorkflowPlaceholder(current) ||
          (typeof current === "string" &&
            DEPRECATED_QWEN_CLIP_FILENAMES[current.trim()] === loaders.dualClip);
        if (shouldPatch) {
          inputs[field] = loaders.dualClip;
        }
      }
    }

    for (const [field, value] of Object.entries(inputs)) {
      if (typeof value !== "string" || !isUnresolvedWorkflowPlaceholder(value)) {
        continue;
      }
      if (value.includes(DEFAULT_UNET_TOKEN) && loaders.unet && UNET_LOADER_TYPES.has(classType)) {
        inputs[field] = loaders.unet;
      } else if (
        value.includes(DEFAULT_VAE_TOKEN) &&
        loaders.vae &&
        VAE_LOADER_TYPES.has(classType)
      ) {
        inputs[field] = loaders.vae;
      } else if (
        value.includes(DEFAULT_CHECKPOINT_TOKEN) &&
        loaders.checkpoint &&
        CHECKPOINT_LOADER_TYPES.has(classType)
      ) {
        inputs[field] = loaders.checkpoint;
      }
    }
  }

  return replaceLoaderPlaceholderTokensInJson(next, loaders);
}

function replaceLoaderPlaceholderTokensInJson(
  workflow: Record<string, unknown>,
  loaders: ModelLoaderFilenames,
): Record<string, unknown> {
  if (!loaders.checkpoint && !loaders.unet && !loaders.vae) {
    return workflow;
  }

  let json = JSON.stringify(workflow);
  if (loaders.unet) {
    json = json.split(DEFAULT_UNET_TOKEN).join(loaders.unet);
  }
  if (loaders.vae) {
    json = json.split(DEFAULT_VAE_TOKEN).join(loaders.vae);
  }
  if (loaders.checkpoint) {
    json = json.split(DEFAULT_CHECKPOINT_TOKEN).join(loaders.checkpoint);
  }

  return JSON.parse(json) as Record<string, unknown>;
}

export function patchWorkflowDirectParams(
  workflow: Record<string, unknown>,
  input: {
    params?: WorkflowParamValues;
    loaders?: ModelLoaderFilenames;
    upscaleModelFilename?: string;
    controlNetModelFilename?: string;
    controlImageFilename?: string;
    customTokens?: Array<{ token: string; value: string }>;
  },
): {
  workflow: Record<string, unknown>;
  patched: WorkflowDirectPatchCounts;
} {
  const latentPatch = patchLatentSizeInWorkflow(workflow, input.params ?? {});
  const loaderPatch = patchLoaderNodesInWorkflow(latentPatch.workflow, input.loaders ?? {});
  const loraPatch = patchLoraNodesInWorkflow(
    loaderPatch.workflow,
    buildLoraFilenameMapFromCustomTokens(input.customTokens ?? []),
  );
  const controlPatch = patchControlNetNodesInWorkflow(loraPatch.workflow, {
    controlNetModelFilename: input.controlNetModelFilename,
    controlImageFilename: input.controlImageFilename,
  });
  const upscalePatch = patchUpscaleModelNodesInWorkflow(
    controlPatch.workflow,
    input.upscaleModelFilename,
  );
  const imagePatch = patchLoadImageNodesInWorkflow(
    upscalePatch.workflow,
    input.params?.inputImageFilename,
  );
  const maskPatch = patchLoadImageMaskNodesInWorkflow(
    imagePatch.workflow,
    input.params?.maskImageFilename,
  );

  return {
    workflow: maskPatch.workflow,
    patched: {
      ...latentPatch.patched,
      ...loaderPatch.patched,
      ...loraPatch.patched,
      ...controlPatch.patched,
      ...upscalePatch.patched,
      ...imagePatch.patched,
      ...maskPatch.patched,
    },
  };
}
