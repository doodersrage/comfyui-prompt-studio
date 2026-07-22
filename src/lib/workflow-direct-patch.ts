import { isQwenLightningModel } from "./model-sampling-patch";
import type { WorkflowParamValues } from "./comfyui-config";
import {
  COMFY_MODEL_IDS,
  getComfyModelDefinition,
  type ComfyImageModel,
} from "./comfy-models";
import {
  DEFAULT_CHECKPOINT_TOKEN,
  DEFAULT_UNET_TOKEN,
  DEFAULT_VAE_TOKEN,
  filenameLooksLikeCheckpointOnly,
  type ModelLoaderFilenames,
} from "./model-checkpoint-map";
import { precisionHintFromFilename, qwenUnetFamiliesCompatible } from "./model-loader-precision";
import {
  DEFAULT_CONTROLNET_MODEL_TOKEN,
  DEFAULT_CONTROL_IMAGE_TOKEN,
} from "./model-controlnet-map";
import {
  buildLoraFilenameMapFromCustomTokens,
  patchLoraNodesInWorkflow,
} from "./workflow-lora-patch";
import { applyLoraStackToWorkflow, type LoraLibraryEntry } from "./lora-stack";
import {
  insertIpAdapterChainIfMissing,
  insertIpAdapterStack,
  patchIpAdapterTokensInWorkflow,
} from "./ipadapter-workflow-patch";
import {
  insertControlNetChainIfMissing,
  insertControlNetStack,
} from "./controlnet-workflow-patch";
import { insertIdentityChainIfMissing } from "./identity-workflow-patch";
import {
  patchRegionalTokensInWorkflow,
  type RegionalPromptSegment,
} from "./regional-prompt-builder";
import {
  inferLoadImageBinding,
  normalizeInputImageFilenames,
} from "./workflow-load-image-bindings";

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
  loraStack?: number;
  emptySd3Latent?: number;
  unetWeightDtype?: number;
  controlNet?: number;
  controlImage?: number;
  /** Nodes spliced in by insertControlNetChainIfMissing when the workflow had none. */
  controlNetInserted?: number;
  ipAdapterImage?: number;
  ipAdapterStrength?: number;
  ipAdapterModel?: number;
  /** Nodes spliced in by insertIpAdapterChainIfMissing when the workflow had none. */
  ipAdapterInserted?: number;
  /** InstantID/PuLID nodes spliced when IP-Adapter Plus is absent. */
  identityInserted?: number;
  /** {{REGION_*}} placeholders resolved from custom tokens. */
  regionalTokens?: number;
  /** WAN/Hunyuan Video I2V node spliced in to wire an uploaded init image into the sampler chain. */
  videoImageToVideoWired?: number;
};

const VIDEO_I2V_WIRE_ERROR =
  "Init image was set for a video model, but I2V could not be wired. Import a WAN/Hunyuan workflow with WanImageToVideo or HunyuanImageToVideo (or a scaffold with LoadImage + Empty*LatentVideo + VAEDecode/Checkpoint VAE + KSampler), or clear the init image for text-to-video.";

const LTX_I2V_WIRE_ERROR =
  "LTX Video I2V needs an imported pack with LTXVImgToVideo — the system scaffold is T2V-only. Clear the init image for text-to-video, or import an LTX I2V workflow from your library.";

function videoI2vWireError(detail: string): string {
  return `${VIDEO_I2V_WIRE_ERROR} (${detail})`;
}

const INPUT_IMAGE_TYPES = new Set(["LoadImage", "LoadImageOutput"]);
const MASK_IMAGE_TYPES = new Set(["LoadImageMask"]);

const CHECKPOINT_LOADER_TYPES = new Set([
  "CheckpointLoaderSimple",
  "CheckpointLoader",
]);

const UNET_LOADER_TYPES = new Set(["UNETLoader", "UnetLoaderGGUF"]);

const VAE_LOADER_TYPES = new Set(["VAELoader"]);

const DUAL_CLIP_LOADER_TYPES = new Set(["DualCLIPLoader"]);
const CLIP_LOADER_TYPES = new Set(["CLIPLoader"]);

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
  syncLoadersToModel?: boolean,
): nextValue is string {
  if (!nextValue?.trim()) {
    return false;
  }
  if (syncLoadersToModel) {
    return shouldPatchStringField(current, nextValue);
  }
  if (typeof current === "string") {
    if (isUnresolvedWorkflowPlaceholder(current)) {
      return true;
    }
    return false;
  }
  return current == null || current === "";
}

/** Overwrite concrete loader filenames when queue resolved a different precision tier. */
function shouldAlignLoaderPrecision(current: unknown, nextValue: string | undefined): boolean {
  if (!nextValue?.trim() || typeof current !== "string") {
    return false;
  }
  if (isUnresolvedWorkflowPlaceholder(current)) {
    return false;
  }
  const currentTier = precisionHintFromFilename(current.trim());
  const nextTier = precisionHintFromFilename(nextValue.trim());
  if (!currentTier || !nextTier || currentTier === nextTier) {
    return false;
  }
  // Never downgrade concrete bf16/fp16 weights to fp8 at queue time.
  if (currentTier === "bf16" && nextTier === "fp8") {
    return false;
  }
  // Never swap Qwen T2I ↔ Edit UNETs under the guise of fp8→bf16 alignment —
  // that produces crystalline/shattered artifacts.
  if (!qwenUnetFamiliesCompatible(current.trim(), nextValue.trim())) {
    return false;
  }
  return true;
}

/** fp8 weight_dtype on bf16 UNET causes grain/grid — clear dtype when filename is bf16-tier. */
function alignUnetWeightDtypeToFilename(
  inputs: Record<string, unknown>,
  filename: string,
): boolean {
  if (!("weight_dtype" in inputs)) {
    return false;
  }
  const tier = precisionHintFromFilename(filename);
  if (tier !== "bf16") {
    return false;
  }
  const dtype = inputs.weight_dtype;
  if (typeof dtype !== "string" || !/fp8|e4m3fn/i.test(dtype)) {
    return false;
  }
  inputs.weight_dtype = "default";
  return true;
}

function shouldPatchClipFilename(
  current: unknown,
  nextValue: string | undefined,
  syncLoadersToModel?: boolean,
): nextValue is string {
  const trimmedNext = nextValue?.trim();
  if (!trimmedNext) {
    return false;
  }
  if (shouldPatchLoaderFilenameField(current, nextValue, syncLoadersToModel)) {
    return true;
  }
  if (typeof current === "string") {
    const deprecated = DEPRECATED_QWEN_CLIP_FILENAMES[current.trim()];
    if (deprecated && deprecated === trimmedNext) {
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

/** Qwen / SD3 official templates use EmptySD3LatentImage — convert imported EmptyLatentImage. */
export function normalizeEmptyLatentForModel(
  workflow: Record<string, unknown>,
  model?: string,
): { workflow: Record<string, unknown>; converted: number } {
  if (!model?.trim()) {
    return { workflow, converted: 0 };
  }

  const category = COMFY_MODEL_IDS.has(model)
    ? getComfyModelDefinition(model as ComfyImageModel).category
    : /qwen/i.test(model)
      ? "qwen"
      : /sd3/i.test(model)
        ? "sd3"
        : null;
  if (category !== "qwen" && category !== "sd3") {
    return { workflow, converted: 0 };
  }

  const next = structuredClone(workflow);
  let converted = 0;
  for (const node of Object.values(next)) {
    if (!node || typeof node !== "object") {
      continue;
    }
    const record = node as { class_type?: string };
    const classType = record.class_type ?? "";
    // Packs sometimes ship EmptyFlux2LatentImage with Qwen UNET — wrong latent
    // family yields undersized / soft decode. Always prefer EmptySD3 for Qwen/SD3.
    if (
      classType === "EmptyLatentImage" ||
      classType === "EmptyFluxLatentImage" ||
      classType === "EmptyFlux2LatentImage"
    ) {
      record.class_type = "EmptySD3LatentImage";
      converted += 1;
    }
  }

  return converted > 0 ? { workflow: next, converted } : { workflow, converted: 0 };
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
  options?: { syncLoadersToModel?: boolean; alignClipPrecision?: boolean },
): { workflow: Record<string, unknown>; patched: WorkflowDirectPatchCounts } {
  const syncLoadersToModel = options?.syncLoadersToModel === true;
  const alignClipPrecision = options?.alignClipPrecision !== false;
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
      (shouldPatchLoaderFilenameField(inputs.ckpt_name, loaders.checkpoint, syncLoadersToModel) ||
        shouldAlignLoaderPrecision(inputs.ckpt_name, loaders.checkpoint))
    ) {
      inputs.ckpt_name = loaders.checkpoint;
      patched.checkpoint = (patched.checkpoint ?? 0) + 1;
    }

    if (
      loaders.unet &&
      !filenameLooksLikeCheckpointOnly(loaders.unet) &&
      UNET_LOADER_TYPES.has(classType) &&
      "unet_name" in inputs
    ) {
      const shouldPatch =
        shouldPatchLoaderFilenameField(inputs.unet_name, loaders.unet, syncLoadersToModel) ||
        shouldAlignLoaderPrecision(inputs.unet_name, loaders.unet) ||
        (typeof inputs.unet_name === "string" &&
          filenameLooksLikeCheckpointOnly(inputs.unet_name));
      if (shouldPatch) {
        inputs.unet_name = loaders.unet;
        patched.unet = (patched.unet ?? 0) + 1;
        if (alignUnetWeightDtypeToFilename(inputs, loaders.unet)) {
          patched.unetWeightDtype = (patched.unetWeightDtype ?? 0) + 1;
        }
      } else if (
        typeof inputs.unet_name === "string" &&
        !isUnresolvedWorkflowPlaceholder(inputs.unet_name) &&
        alignUnetWeightDtypeToFilename(inputs, inputs.unet_name)
      ) {
        // Filename already matches — still clear stale fp8 dtype on bf16 UNET.
        patched.unetWeightDtype = (patched.unetWeightDtype ?? 0) + 1;
      }
    } else if (
      loaders.unet &&
      UNET_LOADER_TYPES.has(classType) &&
      "unet_name" in inputs &&
      typeof inputs.unet_name === "string" &&
      !isUnresolvedWorkflowPlaceholder(inputs.unet_name) &&
      alignUnetWeightDtypeToFilename(inputs, inputs.unet_name)
    ) {
      patched.unetWeightDtype = (patched.unetWeightDtype ?? 0) + 1;
    }

    if (
      loaders.vae &&
      VAE_LOADER_TYPES.has(classType) &&
      "vae_name" in inputs &&
      shouldPatchLoaderFilenameField(inputs.vae_name, loaders.vae, syncLoadersToModel)
    ) {
      inputs.vae_name = loaders.vae;
      patched.vae = (patched.vae ?? 0) + 1;
    }

    if (loaders.dualClip && DUAL_CLIP_LOADER_TYPES.has(classType)) {
      for (const field of ["clip_name1", "clip_name2"] as const) {
        if (
          field in inputs &&
          (shouldPatchClipFilename(inputs[field], loaders.dualClip, syncLoadersToModel) ||
            (alignClipPrecision &&
              shouldAlignLoaderPrecision(inputs[field], loaders.dualClip)))
        ) {
          inputs[field] = loaders.dualClip;
          patched.dualClip = (patched.dualClip ?? 0) + 1;
        }
      }
    }

    if (
      loaders.dualClip &&
      CLIP_LOADER_TYPES.has(classType) &&
      "clip_name" in inputs &&
      (shouldPatchClipFilename(inputs.clip_name, loaders.dualClip, syncLoadersToModel) ||
        (alignClipPrecision &&
          shouldAlignLoaderPrecision(inputs.clip_name, loaders.dualClip)))
    ) {
      inputs.clip_name = loaders.dualClip;
      patched.dualClip = (patched.dualClip ?? 0) + 1;
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

/**
 * Insert a ControlNet chain when a control image is set but the graph has none,
 * then patch loader/image tokens (IP-Adapter parity).
 */
export function patchControlNetInWorkflow(
  workflow: Record<string, unknown>,
  input: {
    controlNetModelFilename?: string;
    controlImageFilename?: string;
    /** Extra control images for stacked ControlNetApply chains. */
    controlImageFilenames?: string[];
    availableNodeTypes?: Iterable<string> | null;
    controlNetMode?: string;
  },
): { workflow: Record<string, unknown>; patched: WorkflowDirectPatchCounts } {
  const stackEntries = (() => {
    const fromArray = (input.controlImageFilenames ?? [])
      .map((name) => name?.trim())
      .filter(Boolean) as string[];
    if (fromArray.length > 0) {
      return fromArray.map((controlImageFilename, index) => ({
        controlImageFilename,
        controlNetModelFilename:
          index === 0 ? input.controlNetModelFilename : undefined,
        controlNetMode: input.controlNetMode,
      }));
    }
    const primary = input.controlImageFilename?.trim();
    return primary
      ? [
          {
            controlImageFilename: primary,
            controlNetModelFilename: input.controlNetModelFilename,
            controlNetMode: input.controlNetMode,
          },
        ]
      : [];
  })();

  const insertResult =
    stackEntries.length > 1
      ? insertControlNetStack(workflow, stackEntries, {
          availableNodeTypes: input.availableNodeTypes,
        })
      : (() => {
          const single = insertControlNetChainIfMissing(workflow, {
            controlImageFilename: stackEntries[0]?.controlImageFilename,
            availableNodeTypes: input.availableNodeTypes,
            controlNetMode: input.controlNetMode,
          });
          return {
            workflow: single.workflow,
            insertedCount: single.inserted ? 1 : 0,
            insertedNodeIds: single.insertedNodeIds,
          };
        })();

  const nodePatch = patchControlNetNodesInWorkflow(insertResult.workflow, {
    controlNetModelFilename: input.controlNetModelFilename,
    controlImageFilename:
      stackEntries[0]?.controlImageFilename ?? input.controlImageFilename,
  });
  const patched: WorkflowDirectPatchCounts = { ...nodePatch.patched };
  if (insertResult.insertedCount > 0) {
    patched.controlNetInserted = insertResult.insertedNodeIds.length;
  }
  return { workflow: nodePatch.workflow, patched };
}

/**
 * Portable IP-Adapter tokens ({{IPADAPTER_IMAGE}}/{{IPADAPTER_STRENGTH}}/{{IPADAPTER_MODEL}}).
 * First inserts a minimal IP-Adapter chain when the session has a reference
 * image but the workflow has neither IPAdapter nodes nor tokens, then runs the
 * usual token patch pass so the inserted (and any pre-wired) tokens resolve.
 */
export function patchIpAdapterInWorkflow(
  workflow: Record<string, unknown>,
  input: {
    ipAdapterImageFilename?: string;
    /** Extra identity/style refs for stacked IP-Adapter apply chains. */
    ipAdapterImageFilenames?: string[];
    ipAdapterStrength?: number | string;
    ipAdapterModelFilename?: string;
    availableNodeTypes?: Iterable<string> | null;
  },
): { workflow: Record<string, unknown>; patched: WorkflowDirectPatchCounts } {
  const stackEntries = (() => {
    const fromArray = (input.ipAdapterImageFilenames ?? [])
      .map((name) => name?.trim())
      .filter(Boolean) as string[];
    if (fromArray.length > 0) {
      return fromArray.map((imageFilename, index) => ({
        imageFilename,
        strength:
          index === 0 && input.ipAdapterStrength != null
            ? Number(input.ipAdapterStrength)
            : undefined,
        modelFilename:
          index === 0 ? input.ipAdapterModelFilename : undefined,
      }));
    }
    const primary = input.ipAdapterImageFilename?.trim();
    return primary
      ? [
          {
            imageFilename: primary,
            strength:
              input.ipAdapterStrength != null
                ? Number(input.ipAdapterStrength)
                : undefined,
            modelFilename: input.ipAdapterModelFilename,
          },
        ]
      : [];
  })();

  const insertResult =
    stackEntries.length > 1
      ? insertIpAdapterStack(workflow, stackEntries, {
          availableNodeTypes: input.availableNodeTypes,
        })
      : (() => {
          const single = insertIpAdapterChainIfMissing(workflow, {
            imageFilename: stackEntries[0]?.imageFilename,
            availableNodeTypes: input.availableNodeTypes,
          });
          return {
            workflow: single.workflow,
            insertedCount: single.inserted ? 1 : 0,
            insertedNodeIds: single.insertedNodeIds,
          };
        })();

  let nextWorkflow = insertResult.workflow;
  const patched: WorkflowDirectPatchCounts = {};
  if (insertResult.insertedCount > 0) {
    patched.ipAdapterInserted = insertResult.insertedNodeIds.length;
  }

  // If IP-Adapter Plus isn't available, fall back to InstantID/PuLID when installed.
  if (
    insertResult.insertedCount === 0 &&
    stackEntries[0]?.imageFilename?.trim()
  ) {
    const identity = insertIdentityChainIfMissing(nextWorkflow, {
      imageFilename: stackEntries[0].imageFilename,
      availableNodeTypes: input.availableNodeTypes,
    });
    if (identity.inserted) {
      nextWorkflow = identity.workflow;
      patched.identityInserted = identity.insertedNodeIds.length;
    }
  }

  const result = patchIpAdapterTokensInWorkflow(nextWorkflow, {
    imageFilename: stackEntries[0]?.imageFilename ?? input.ipAdapterImageFilename,
    strength: input.ipAdapterStrength,
    modelFilename: input.ipAdapterModelFilename,
  });
  if (result.patched.image) {
    patched.ipAdapterImage = result.patched.image;
  }
  if (result.patched.strength) {
    patched.ipAdapterStrength = result.patched.strength;
  }
  if (result.patched.model) {
    patched.ipAdapterModel = result.patched.model;
  }
  return { workflow: result.workflow, patched };
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
  inputImageFilenames?: string[],
): { workflow: Record<string, unknown>; patched: WorkflowDirectPatchCounts } {
  const filenames = normalizeInputImageFilenames(
    inputImageFilename,
    inputImageFilenames,
  );

  if (filenames.length === 0) {
    return { workflow: structuredClone(workflow), patched: {} };
  }

  // Single-image path: keep legacy blanket patch (placeholder / overwrite).
  if (filenames.length === 1) {
    return patchImageLoaderNodesInWorkflow(
      workflow,
      INPUT_IMAGE_TYPES,
      filenames[0],
      "inputImage",
    );
  }

  const next = structuredClone(workflow) as Record<
    string,
    {
      class_type?: string;
      inputs?: Record<string, unknown>;
      _meta?: { title?: string };
    }
  >;
  const patched: WorkflowDirectPatchCounts = {};
  const loadImageEntries = Object.entries(next).filter(([, node]) =>
    INPUT_IMAGE_TYPES.has(node?.class_type ?? ""),
  );
  const loadImageCount = loadImageEntries.length;
  let loadImageIndex = 0;

  for (const [, node] of loadImageEntries) {
    const classType = node?.class_type ?? "";
    const title = node?._meta?.title ?? "";
    const inputs = node?.inputs;
    const kind = inferLoadImageBinding(classType, title, {
      loadImageIndex,
      loadImageCount,
    });
    loadImageIndex += 1;
    if (!inputs || !("image" in inputs)) {
      continue;
    }

    const figure =
      kind === "inputImage"
        ? 0
        : kind === "inputImage2"
          ? 1
          : kind === "inputImage3"
            ? 2
            : kind === "inputImage4"
              ? 3
              : -1;
    if (figure < 0) {
      continue;
    }
    const filename = filenames[figure];
    if (!filename?.trim()) {
      continue;
    }
    if (shouldPatchStringField(inputs.image, filename)) {
      inputs.image = filename.trim();
      patched.inputImage = (patched.inputImage ?? 0) + 1;
    }
  }

  return { workflow: next, patched };
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

    if (loaders.dualClip && CLIP_LOADER_TYPES.has(classType) && "clip_name" in inputs) {
      const current = coerceLoaderFieldValue(inputs.clip_name);
      const shouldPatch =
        current == null ||
        current.trim() === "" ||
        isUnresolvedWorkflowPlaceholder(current) ||
        (typeof current === "string" &&
          DEPRECATED_QWEN_CLIP_FILENAMES[current.trim()] === loaders.dualClip);
      if (shouldPatch) {
        inputs.clip_name = loaders.dualClip;
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

export function patchImageResizeNodesInWorkflow(
  workflow: Record<string, unknown>,
  params: Pick<WorkflowParamValues, "width" | "height">,
): { workflow: Record<string, unknown>; patched: WorkflowDirectPatchCounts } {
  const next = structuredClone(workflow);
  const patched: WorkflowDirectPatchCounts = {};
  const resizeTypes = new Set(["ImageScale", "ResizeImage"]);

  for (const node of Object.values(next)) {
    if (!node || typeof node !== "object") {
      continue;
    }
    const record = node as {
      class_type?: string;
      inputs?: Record<string, unknown>;
    };
    const inputs = record.inputs;
    if (!inputs || !resizeTypes.has(record.class_type ?? "")) {
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

/** Empty-latent nodes used as the "no init image" latent source in WAN/Hunyuan T2V starter graphs. */
const VIDEO_LATENT_NODE_TYPES = new Set([
  "EmptyHunyuanLatentVideo",
  "EmptyLTXVLatentVideo",
  "EmptyMochiLatentVideo",
  "EmptyCosmosLatentVideo",
]);

/** Built-in ComfyUI I2V conditioning nodes — presence means the graph is already wired. */
const VIDEO_IMAGE_TO_VIDEO_NODE_TYPES = new Set([
  "WanImageToVideo",
  "WanCameraImageToVideo",
  "HunyuanImageToVideo",
  "LTXVImgToVideo",
]);

function asNodeRecord(
  node: unknown,
): { class_type?: string; _meta?: { title?: string }; inputs?: Record<string, unknown> } | null {
  if (!node || typeof node !== "object") {
    return null;
  }
  return node as { class_type?: string; _meta?: { title?: string }; inputs?: Record<string, unknown> };
}

function isNodeOutputRef(value: unknown): value is [string, number] {
  return Array.isArray(value) && typeof value[0] === "string" && typeof value[1] === "number";
}

function findFirstNodeIdByClassTypes(
  workflow: Record<string, unknown>,
  classTypes: Set<string>,
): string | null {
  for (const [nodeId, node] of Object.entries(workflow)) {
    const record = asNodeRecord(node);
    if (record?.class_type && classTypes.has(record.class_type)) {
      return nodeId;
    }
  }
  return null;
}

function collectReferencedNodeIds(workflow: Record<string, unknown>): Set<string> {
  const referenced = new Set<string>();
  for (const node of Object.values(workflow)) {
    const record = asNodeRecord(node);
    if (!record?.inputs) {
      continue;
    }
    for (const value of Object.values(record.inputs)) {
      if (isNodeOutputRef(value)) {
        referenced.add(value[0]);
      }
    }
  }
  return referenced;
}

/** Prefer a LoadImage node titled "init" (our own scaffolds); fall back to any unwired LoadImage. */
function findInitImageLoadNodeId(workflow: Record<string, unknown>): string | null {
  const referenced = collectReferencedNodeIds(workflow);
  let orphanCandidate: string | null = null;

  for (const [nodeId, node] of Object.entries(workflow)) {
    const record = asNodeRecord(node);
    if (record?.class_type !== "LoadImage" || !record.inputs) {
      continue;
    }
    const title = record._meta?.title?.toLowerCase() ?? "";
    if (title.includes("init")) {
      return nodeId;
    }
    if (!referenced.has(nodeId) && orphanCandidate === null) {
      orphanCandidate = nodeId;
    }
  }

  return orphanCandidate;
}

function resolveNumericLikeField(value: unknown, fallback: number): number | string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() && !isUnresolvedWorkflowPlaceholder(value)) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

/**
 * When a video (WAN / Hunyuan Video) model is queued with an init image, splice a built-in
 * WanImageToVideo / HunyuanImageToVideo node between the text encoders and the sampler so the
 * uploaded LoadImage frame actually drives I2V conditioning (VAE-encoded start_image → latent).
 * No-op for T2V (no image) or graphs that already wire their own I2V node.
 */
export function patchVideoImageToVideoWiringInWorkflow(
  workflow: Record<string, unknown>,
  input: {
    model?: string;
    inputImageFilename?: string;
    params?: Pick<WorkflowParamValues, "width" | "height" | "videoFrames">;
  },
): {
  workflow: Record<string, unknown>;
  patched: WorkflowDirectPatchCounts;
  /** Set when a video model has an init image but I2V wiring failed. */
  error?: string;
} {
  const next = structuredClone(workflow);
  const patched: WorkflowDirectPatchCounts = {};

  if (!input.inputImageFilename?.trim() || !input.model?.trim()) {
    return { workflow: next, patched };
  }

  const def = COMFY_MODEL_IDS.has(input.model)
    ? getComfyModelDefinition(input.model as ComfyImageModel)
    : null;
  if (def?.category !== "video") {
    return { workflow: next, patched };
  }

  if (findFirstNodeIdByClassTypes(next, VIDEO_IMAGE_TO_VIDEO_NODE_TYPES)) {
    // Already has a native I2V node — respect the user's custom wiring.
    return { workflow: next, patched };
  }

  // LTX auto-splice is not supported — fail early with a pack-import hint.
  if (/ltx/i.test(input.model)) {
    return {
      workflow: next,
      patched,
      error: LTX_I2V_WIRE_ERROR,
    };
  }

  const loadImageId = findInitImageLoadNodeId(next);
  const latentNodeId = findFirstNodeIdByClassTypes(next, VIDEO_LATENT_NODE_TYPES);
  if (!loadImageId && !latentNodeId) {
    return {
      workflow: next,
      patched,
      error: videoI2vWireError("missing LoadImage init node and Empty*LatentVideo"),
    };
  }
  if (!loadImageId) {
    return {
      workflow: next,
      patched,
      error: videoI2vWireError("missing LoadImage titled Init Image (or an unused LoadImage)"),
    };
  }
  if (!latentNodeId) {
    return {
      workflow: next,
      patched,
      error: videoI2vWireError("missing EmptyHunyuanLatentVideo / EmptyLTXVLatentVideo"),
    };
  }

  const latentInputs = asNodeRecord(next[latentNodeId])?.inputs ?? {};

  let samplerId: string | null = null;
  let samplerInputs: Record<string, unknown> | null = null;
  // Prefer sampler whose latent_image points at the empty video latent.
  for (const [nodeId, node] of Object.entries(next)) {
    const record = asNodeRecord(node);
    if (!record?.inputs) {
      continue;
    }
    const latentRef = record.inputs.latent_image;
    if (isNodeOutputRef(latentRef) && latentRef[0] === latentNodeId) {
      samplerId = nodeId;
      samplerInputs = record.inputs;
      break;
    }
  }
  // Fallback: any sampler-like node with latent_image + positive conditioning.
  if (!samplerId || !samplerInputs) {
    for (const [nodeId, node] of Object.entries(next)) {
      const record = asNodeRecord(node);
      if (!record?.inputs || !isNodeOutputRef(record.inputs.latent_image)) {
        continue;
      }
      const classType = (record.class_type ?? "").toLowerCase();
      const looksLikeSampler =
        classType.includes("ksampler") ||
        classType.includes("samplercustom") ||
        ("seed" in record.inputs && ("steps" in record.inputs || "cfg" in record.inputs));
      if (!looksLikeSampler || !isNodeOutputRef(record.inputs.positive)) {
        continue;
      }
      samplerId = nodeId;
      samplerInputs = record.inputs;
      break;
    }
  }
  if (!samplerId || !samplerInputs) {
    return {
      workflow: next,
      patched,
      error: videoI2vWireError("no KSampler (or sampler-like node) with latent_image + positive"),
    };
  }

  const positiveRef = samplerInputs.positive;
  if (!isNodeOutputRef(positiveRef)) {
    return {
      workflow: next,
      patched,
      error: videoI2vWireError("sampler positive conditioning is not a node link"),
    };
  }
  const negativeRef = isNodeOutputRef(samplerInputs.negative) ? samplerInputs.negative : null;

  let vaeRef: [string, number] | null = null;
  for (const node of Object.values(next)) {
    const record = asNodeRecord(node);
    if (record?.class_type === "VAEDecode" && isNodeOutputRef(record.inputs?.vae)) {
      vaeRef = record.inputs!.vae as [string, number];
      break;
    }
  }
  if (!vaeRef) {
    for (const [nodeId, node] of Object.entries(next)) {
      const record = asNodeRecord(node);
      if (
        record?.class_type &&
        (CHECKPOINT_LOADER_TYPES.has(record.class_type) ||
          VAE_LOADER_TYPES.has(record.class_type))
      ) {
        // CheckpointLoaderSimple: MODEL/CLIP/VAE → output index 2; VAELoader → 0.
        vaeRef = [nodeId, VAE_LOADER_TYPES.has(record.class_type) ? 0 : 2];
        break;
      }
    }
  }
  if (!vaeRef) {
    return {
      workflow: next,
      patched,
      error: videoI2vWireError("no VAE link from VAEDecode / CheckpointLoader / VAELoader"),
    };
  }

  const isHunyuan = /hunyuan/i.test(input.model);
  const width = resolveNumericLikeField(latentInputs.width, Number(input.params?.width) || 832);
  const height = resolveNumericLikeField(latentInputs.height, Number(input.params?.height) || 480);
  const length = resolveNumericLikeField(
    latentInputs.length,
    Number(input.params?.videoFrames) || (isHunyuan ? 53 : 81),
  );
  const batchSize = resolveNumericLikeField(latentInputs.batch_size, 1);

  const newNodeId = nextAvailableWorkflowNodeId(next);
  const startImageRef: [string, number] = [loadImageId, 0];

  if (isHunyuan) {
    next[newNodeId] = {
      class_type: "HunyuanImageToVideo",
      inputs: {
        positive: positiveRef,
        vae: vaeRef,
        width,
        height,
        length,
        batch_size: batchSize,
        guidance_type: "v1 (concat)",
        start_image: startImageRef,
      },
      _meta: { title: "Hunyuan Image → Video (auto-wired I2V)" },
    };
    samplerInputs.positive = [newNodeId, 0];
    samplerInputs.latent_image = [newNodeId, 1];
  } else {
    next[newNodeId] = {
      class_type: "WanImageToVideo",
      inputs: {
        positive: positiveRef,
        negative: negativeRef ?? positiveRef,
        vae: vaeRef,
        width,
        height,
        length,
        batch_size: batchSize,
        start_image: startImageRef,
      },
      _meta: { title: "Wan Image → Video (auto-wired I2V)" },
    };
    samplerInputs.positive = [newNodeId, 0];
    if (negativeRef) {
      samplerInputs.negative = [newNodeId, 1];
    }
    samplerInputs.latent_image = [newNodeId, 2];
  }

  patched.videoImageToVideoWired = 1;
  return { workflow: next, patched };
}

function nextAvailableWorkflowNodeId(workflow: Record<string, unknown>): string {
  let max = 0;
  for (const key of Object.keys(workflow)) {
    if (/^\d+$/.test(key)) {
      max = Math.max(max, Number(key));
    }
  }
  return String(max + 1);
}

function regionalSegmentsFromCustomTokens(
  customTokens?: Array<{ token: string; value: string }>,
): RegionalPromptSegment[] {
  if (!customTokens?.length) {
    return [];
  }
  const map: Record<string, string> = {
    "{{REGION_SUBJECT}}": "subject",
    "{{REGION_BACKGROUND}}": "background",
    "{{REGION_FOREGROUND}}": "foreground",
    "{{REGION_LIGHTING}}": "lighting",
  };
  const segments: RegionalPromptSegment[] = [];
  for (const entry of customTokens) {
    const regionId = map[entry.token.trim()];
    if (regionId && entry.value.trim()) {
      segments.push({ regionId, prompt: entry.value.trim() });
    }
  }
  return segments;
}

export function patchWorkflowDirectParams(
  workflow: Record<string, unknown>,
  input: {
    params?: WorkflowParamValues;
    loaders?: ModelLoaderFilenames;
    upscaleModelFilename?: string;
    controlNetModelFilename?: string;
    controlImageFilename?: string;
    controlImageFilenames?: string[];
    ipAdapterImageFilename?: string;
    ipAdapterImageFilenames?: string[];
    ipAdapterStrength?: number | string;
    ipAdapterModelFilename?: string;
    /** ComfyUI object_info node class names — gates the optional CLIPVisionLoader when inserting an IP-Adapter chain. */
    availableNodeTypes?: Iterable<string> | null;
    customTokens?: Array<{ token: string; value: string }>;
    syncWorkflowLoadersToModel?: boolean;
    model?: string;
    /** Active LoRA stack — strengths patched onto LoraLoader nodes, extras chained in. */
    loraLibrary?: LoraLibraryEntry[];
    /** Positive prompt — kept for call-site compat; keyword LoRA matching removed. */
    prompt?: string;
  },
): {
  workflow: Record<string, unknown>;
  patched: WorkflowDirectPatchCounts;
  error?: string;
} {
  const latentType = normalizeEmptyLatentForModel(workflow, input.model);
  const latentPatch = patchLatentSizeInWorkflow(latentType.workflow, input.params ?? {});
  const loaderPatch = patchLoaderNodesInWorkflow(latentPatch.workflow, input.loaders ?? {}, {
    syncLoadersToModel: input.syncWorkflowLoadersToModel,
    // LightX2V official keeps fp8_scaled CLIP with bf16 UNET — don't "upgrade" CLIP.
    alignClipPrecision: !isQwenLightningModel(input.model),
  });
  const loraPatch = patchLoraNodesInWorkflow(
    loaderPatch.workflow,
    buildLoraFilenameMapFromCustomTokens(input.customTokens ?? []),
  );
  const loraStackPatch = applyLoraStackToWorkflow(loraPatch.workflow, input.loraLibrary, {
    prompt: input.prompt,
  });
  const controlPatch = patchControlNetInWorkflow(loraStackPatch.workflow, {
    controlNetModelFilename: input.controlNetModelFilename,
    controlImageFilename: input.controlImageFilename,
    controlImageFilenames:
      input.controlImageFilenames ?? input.params?.controlImageFilenames,
    availableNodeTypes: input.availableNodeTypes,
    controlNetMode: input.params?.controlNetMode,
  });
  const ipAdapterPatch = patchIpAdapterInWorkflow(controlPatch.workflow, {
    ipAdapterImageFilename: input.ipAdapterImageFilename,
    ipAdapterImageFilenames:
      input.ipAdapterImageFilenames ?? input.params?.ipAdapterImageFilenames,
    ipAdapterStrength: input.ipAdapterStrength,
    ipAdapterModelFilename: input.ipAdapterModelFilename,
    availableNodeTypes: input.availableNodeTypes,
  });
  const upscalePatch = patchUpscaleModelNodesInWorkflow(
    ipAdapterPatch.workflow,
    input.upscaleModelFilename,
  );
  const imagePatch = patchLoadImageNodesInWorkflow(
    upscalePatch.workflow,
    input.params?.inputImageFilename,
    input.params?.inputImageFilenames,
  );
  const maskPatch = patchLoadImageMaskNodesInWorkflow(
    imagePatch.workflow,
    input.params?.maskImageFilename,
  );
  const resizePatch = patchImageResizeNodesInWorkflow(maskPatch.workflow, input.params ?? {});
  const regionalSegments = regionalSegmentsFromCustomTokens(input.customTokens);
  const regionalPatch = patchRegionalTokensInWorkflow(
    resizePatch.workflow,
    regionalSegments,
  );
  const videoWirePatch = patchVideoImageToVideoWiringInWorkflow(regionalPatch.workflow, {
    model: input.model,
    inputImageFilename: input.params?.inputImageFilename,
    params: input.params,
  });

  return {
    workflow: videoWirePatch.workflow,
    patched: {
      ...(latentType.converted > 0 ? { emptySd3Latent: latentType.converted } : {}),
      ...latentPatch.patched,
      ...loaderPatch.patched,
      ...loraPatch.patched,
      ...loraStackPatch.patched,
      ...controlPatch.patched,
      ...ipAdapterPatch.patched,
      ...upscalePatch.patched,
      ...imagePatch.patched,
      ...maskPatch.patched,
      ...resizePatch.patched,
      ...(regionalPatch.patched > 0 ? { regionalTokens: regionalPatch.patched } : {}),
      ...videoWirePatch.patched,
    },
    error: videoWirePatch.error,
  };
}
