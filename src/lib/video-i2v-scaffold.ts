import { matchInventoryFilenameNearMiss } from './loader-map-inventory-sync';
import { filenameLooksLikeCheckpointOnly } from './model-checkpoint-map';
import { pickVideoCheckpointFromInventory } from './video-checkpoint-pick';

/**
 * Prefer an installed WAN/Hunyuan/LTX weight. Mapped Rapid AIO names often
 * live under diffusion_models (UNETs), or a nearby stem (nsfw ↔ sfw).
 */
export function resolveInstalledVideoWeight(
  model: string | undefined,
  preferred: string | undefined,
  inventory: string[]
): string | undefined {
  const wanted = preferred?.trim();
  if (inventory.length === 0) {
    return wanted;
  }
  if (wanted) {
    const near = matchInventoryFilenameNearMiss(wanted, inventory);
    if (near) {
      return near;
    }
  }
  return pickVideoCheckpointFromInventory(model?.trim() || 'wan-video', inventory) ?? wanted;
}

function filenameInList(filename: string, list?: string[] | null): boolean {
  const trimmed = filename.trim();
  if (!trimmed || !list?.length) {
    return false;
  }
  const lower = trimmed.toLowerCase();
  return list.some(entry => {
    const e = entry.trim();
    return e === trimmed || e.toLowerCase() === lower;
  });
}

/** True when ComfyUI lists the weight under UNETs only — CheckpointLoaderSimple will reject it. */
export function videoWeightIsUnetOnly(
  filename: string | undefined,
  checkpoints?: string[] | null,
  unets?: string[] | null
): boolean {
  const trimmed = filename?.trim();
  if (!trimmed || filenameLooksLikeCheckpointOnly(trimmed)) {
    return false;
  }
  return filenameInList(trimmed, unets) && !filenameInList(trimmed, checkpoints);
}

export type VideoSplitClipNode =
  | { class_type: 'CLIPLoader'; inputs: { clip_name: string; type: string } }
  | {
      class_type: 'DualCLIPLoader';
      inputs: { clip_name1: string; clip_name2: string; type: string };
    };

export type VideoSplitCompanions = {
  unet: string;
  vae: string;
  clip: VideoSplitClipNode;
};

function pickListedFilename(preferred: string[], inventory?: string[] | null): string | undefined {
  if (!inventory?.length) {
    return preferred[0];
  }
  for (const name of preferred) {
    const near = matchInventoryFilenameNearMiss(name, inventory);
    if (near) {
      return near;
    }
  }
  return undefined;
}

function inferVideoSplitFamily(
  model: string | undefined,
  filename: string
): 'hunyuan' | 'wan' | 'ltx' {
  if (/hunyuan|hy[-_]?video/i.test(filename) || /hunyuan/i.test(model ?? '')) {
    return 'hunyuan';
  }
  if (/ltx/i.test(filename) || /ltx/i.test(model ?? '')) {
    return 'ltx';
  }
  return 'wan';
}

/**
 * CLIP + VAE companions for official Hunyuan / WAN split UNETs (Comfy-Org
 * HunyuanVideo_repackaged / Wan_2.2_ComfyUI_repackaged). Rapid AIO stays on
 * CheckpointLoaderSimple and never reaches this path.
 */
export function resolveVideoSplitCompanions(input: {
  model?: string;
  unet: string;
  availableClips?: string[] | null;
  availableVaes?: string[] | null;
}): { companions?: VideoSplitCompanions; error?: string } {
  const unet = input.unet.trim();
  const family = inferVideoSplitFamily(input.model, unet);

  if (family === 'ltx') {
    return {
      error: `“${unet}” is a diffusion_models UNET — CheckpointLoaderSimple cannot load it. Import a pack-accurate LTX graph (CLIP + VAE) or install an LTX checkpoint.`,
    };
  }

  if (family === 'hunyuan') {
    const vae = pickListedFilename(
      ['hunyuan_video_vae_bf16.safetensors', 'hunyuan_video_vae.safetensors'],
      input.availableVaes
    );
    const clipL = pickListedFilename(['clip_l.safetensors'], input.availableClips);
    const llava = pickListedFilename(
      ['llava_llama3_fp8_scaled.safetensors', 'llava_llama3_fp16.safetensors'],
      input.availableClips
    );
    if (!vae || !clipL || !llava) {
      return {
        error: `“${unet}” is a Hunyuan diffusion_models UNET — CheckpointLoaderSimple cannot load it. Install hunyuan_video_vae_bf16.safetensors plus DualCLIP clip_l.safetensors and llava_llama3_fp8_scaled.safetensors, or queue a WAN Rapid AIO file from checkpoints/.`,
      };
    }
    return {
      companions: {
        unet,
        vae,
        clip: {
          class_type: 'DualCLIPLoader',
          inputs: {
            clip_name1: clipL,
            clip_name2: llava,
            type: 'hunyuan_video',
          },
        },
      },
    };
  }

  const vae = pickListedFilename(
    ['wan2.2_vae.safetensors', 'wan_2.2_vae.safetensors', 'wan_2.1_vae.safetensors'],
    input.availableVaes
  );
  const clip = pickListedFilename(
    ['umt5_xxl_fp8_e4m3fn_scaled.safetensors', 'umt5_xxl_fp16.safetensors'],
    input.availableClips
  );
  if (!vae || !clip) {
    return {
      error: `“${unet}” is a WAN diffusion_models UNET — CheckpointLoaderSimple cannot load it. Install wan2.2_vae.safetensors and umt5_xxl_fp8_e4m3fn_scaled.safetensors, or put a Rapid AIO merge in checkpoints/.`,
    };
  }
  return {
    companions: {
      unet,
      vae,
      clip: {
        class_type: 'CLIPLoader',
        inputs: { clip_name: clip, type: 'wan' },
      },
    },
  };
}

function nextAvailableNodeId(workflow: Record<string, unknown>): string {
  let max = 0;
  for (const key of Object.keys(workflow)) {
    if (/^\d+$/.test(key)) {
      max = Math.max(max, Number(key));
    }
  }
  return String(max + 1);
}

function rewriteCheckpointOutputRefs(
  inputs: Record<string, unknown>,
  checkpointId: string,
  clipId: string,
  vaeId: string
): number {
  let rewritten = 0;
  for (const [key, value] of Object.entries(inputs)) {
    if (
      !Array.isArray(value) ||
      value.length !== 2 ||
      value[0] !== checkpointId ||
      typeof value[1] !== 'number'
    ) {
      continue;
    }
    if (value[1] === 1) {
      inputs[key] = [clipId, 0];
      rewritten += 1;
    } else if (value[1] === 2) {
      inputs[key] = [vaeId, 0];
      rewritten += 1;
    }
  }
  return rewritten;
}

/**
 * CheckpointLoaderSimple only reads models/checkpoints/. Official Hunyuan / WAN
 * I2V weights live in diffusion_models — convert those loaders to UNET + CLIP + VAE
 * and retarget CLIP/VAE links (output 1 / 2).
 */
export function rewriteCheckpointLoadersToVideoSplit(
  workflow: Record<string, unknown>,
  companions: VideoSplitCompanions
): { workflow: Record<string, unknown>; converted: number } {
  const next = structuredClone(workflow);
  const checkpointIds: string[] = [];
  for (const [nodeId, node] of Object.entries(next)) {
    if (!node || typeof node !== 'object') {
      continue;
    }
    const record = node as { class_type?: string };
    if (
      record.class_type === 'CheckpointLoaderSimple' ||
      record.class_type === 'CheckpointLoader'
    ) {
      checkpointIds.push(nodeId);
    }
  }
  if (checkpointIds.length === 0) {
    return { workflow: next, converted: 0 };
  }

  const clipId = nextAvailableNodeId(next);
  next[clipId] = {
    class_type: companions.clip.class_type,
    inputs: { ...companions.clip.inputs },
    _meta: {
      title:
        companions.clip.class_type === 'DualCLIPLoader' ? 'Hunyuan DualCLIP' : 'WAN CLIP (UMT5)',
    },
  };
  const vaeId = nextAvailableNodeId(next);
  next[vaeId] = {
    class_type: 'VAELoader',
    inputs: { vae_name: companions.vae },
    _meta: { title: 'Load Video VAE' },
  };

  for (const checkpointId of checkpointIds) {
    const node = next[checkpointId] as {
      class_type?: string;
      inputs?: Record<string, unknown>;
      _meta?: { title?: string };
    };
    node.class_type = 'UNETLoader';
    node.inputs = { unet_name: companions.unet, weight_dtype: 'default' };
    node._meta = { title: 'Load Video UNET' };
  }

  for (const node of Object.values(next)) {
    if (!node || typeof node !== 'object') {
      continue;
    }
    const inputs = (node as { inputs?: Record<string, unknown> }).inputs;
    if (!inputs) {
      continue;
    }
    for (const checkpointId of checkpointIds) {
      rewriteCheckpointOutputRefs(inputs, checkpointId, clipId, vaeId);
    }
  }

  return { workflow: next, converted: checkpointIds.length };
}

/**
 * Minimal T2V/I2V graph used when the selected workflow cannot accept an init
 * frame (typical: a still-image graph queued as WAN / Hunyuan / LTX I2V).
 * Queue-time patching fills placeholders and splices WanImageToVideo /
 * HunyuanImageToVideo / LTXVImgToVideo.
 */
export function buildBuiltInVideoI2vWorkflow(model: string): Record<string, unknown> {
  const id = String(model ?? '');
  const latentClass = /ltx/i.test(id) ? 'EmptyLTXVLatentVideo' : 'EmptyHunyuanLatentVideo';
  const i2vHint = /ltx/i.test(id)
    ? 'Init Image (optional — auto-wired into LTXVImgToVideo at queue time)'
    : 'Init Image (optional — auto-wired into WanImageToVideo/HunyuanImageToVideo at queue time)';

  return {
    '1': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: '{{CHECKPOINT}}' },
      _meta: { title: 'Load Checkpoint' },
    },
    '2': {
      class_type: 'CLIPTextEncode',
      inputs: { text: '{{POSITIVE}}', clip: ['1', 1] },
      _meta: { title: 'Positive Prompt' },
    },
    '3': {
      class_type: 'CLIPTextEncode',
      inputs: { text: '{{NEGATIVE}}', clip: ['1', 1] },
      _meta: { title: 'Negative Prompt' },
    },
    '900': {
      class_type: 'LoadImage',
      inputs: { image: '{{INIT_IMAGE}}' },
      _meta: { title: i2vHint },
    },
    '4': {
      class_type: latentClass,
      inputs: {
        width: '{{WIDTH}}',
        height: '{{HEIGHT}}',
        length: '{{VIDEO_FRAMES}}',
        batch_size: 1,
      },
      _meta: { title: 'Empty Video Latent' },
    },
    '5': {
      class_type: 'KSampler',
      inputs: {
        seed: '{{SEED}}',
        steps: '{{STEPS}}',
        cfg: '{{CFG}}',
        sampler_name: '{{SAMPLER}}',
        scheduler: '{{SCHEDULER}}',
        denoise: 1,
        model: ['1', 0],
        positive: ['2', 0],
        negative: ['3', 0],
        latent_image: ['4', 0],
      },
      _meta: { title: 'KSampler' },
    },
    '6': {
      class_type: 'VAEDecode',
      inputs: { samples: ['5', 0], vae: ['1', 2] },
      _meta: { title: 'VAE Decode' },
    },
    '7': {
      class_type: 'SaveAnimatedWEBP',
      inputs: {
        images: ['6', 0],
        filename_prefix: 'PromptStudio',
        fps: '{{VIDEO_FPS}}',
        lossless: false,
        quality: 90,
        method: 'default',
      },
      _meta: { title: 'Save Video (WEBP)' },
    },
  };
}
