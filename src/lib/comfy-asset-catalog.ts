import type { ComfyImageModel } from "./comfy-models/client";
import type { ComfyAssetKind } from "./comfy-asset-kinds";

export type ComfyCatalogAsset = {
  id: string;
  label: string;
  kind: ComfyAssetKind;
  /** Relative filename under the kind’s models folder (may include subdirs). */
  filename: string;
  /** Hugging Face (or allowlisted) resolve URL — omit for docs-only rows. */
  url?: string;
  sha256?: string;
  bytes?: number;
  /** App model ids that expect this weight. */
  modelIds: Array<ComfyImageModel | string>;
  notes?: string;
  /** Hint that Install needs HF_TOKEN (gated BFL packs, etc.). */
  requiresHfToken?: boolean;
};

/** Hosts allowed for curated downloads (no client-supplied URLs). */
export const COMFY_ASSET_DOWNLOAD_HOSTS = [
  "huggingface.co",
  "hf.co",
  "cdn-lfs.huggingface.co",
  "cdn-lfs-us-1.huggingface.co",
  "cdn-lfs-eu-1.huggingface.co",
  "cdn.hf.co",
  "cas-server.xethub.hf.co",
] as const;

export function isAllowlistedAssetUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    if (url.protocol !== "https:") {
      return false;
    }
    const host = url.hostname.toLowerCase();
    if (
      COMFY_ASSET_DOWNLOAD_HOSTS.some(
        (allowed) => host === allowed || host.endsWith(`.${allowed}`),
      )
    ) {
      return true;
    }
    // HF Xet / CloudFront bridges: us.aws.cdn.hf.co, eu-west-*.cdn.hf.co, …
    if (host.endsWith(".hf.co") || host.endsWith(".huggingface.co")) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

const QWEN_T2I_MODELS = [
  "qwen-image-2512",
  "qwen-image-2512-lightning-4",
  "qwen-image-2512-lightning-8",
  "qwen-image-2.0",
] as const;

const QWEN_EDIT_MODELS = [
  "qwen-image-edit-2511",
  "qwen-image-edit-2511-lightning-4",
  "qwen-image-edit-2511-lightning-8",
  "qwen-image-edit-2509",
  "qwen-rapid-aio-edit",
] as const;

const QWEN_SHARED_MODELS = [...QWEN_T2I_MODELS, ...QWEN_EDIT_MODELS] as const;

const KLEIN_MODELS = [
  "flux-2-klein",
  "flux-2-klein-4b-distilled",
  "flux-2-klein-9b",
  "flux-2-klein-9b-distilled",
] as const;

const WAN_MODELS = [
  "wan-video",
  "wan-video-rapid-aio",
  "wan-video-lightning-4",
] as const;

/**
 * Curated weights tied to suggested loader maps / supported workflows.
 * Entries without `url` are docs-only (show expected filename, no Install).
 */
export const COMFY_ASSET_CATALOG: ComfyCatalogAsset[] = [
  // ── SDXL ──────────────────────────────────────────────────────────
  {
    id: "sdxl-base",
    label: "SDXL base 1.0",
    kind: "checkpoint",
    filename: "sd_xl_base_1.0.safetensors",
    url: "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors",
    bytes: 6938078334,
    modelIds: ["sdxl"],
  },
  {
    id: "sdxl-refiner",
    label: "SDXL refiner 1.0",
    kind: "refiner",
    filename: "sd_xl_refiner_1.0.safetensors",
    url: "https://huggingface.co/stabilityai/stable-diffusion-xl-refiner-1.0/resolve/main/sd_xl_refiner_1.0.safetensors",
    modelIds: ["sdxl"],
  },
  {
    id: "sdxl-vae",
    label: "SDXL VAE",
    kind: "vae",
    filename: "sdxl_vae.safetensors",
    url: "https://huggingface.co/stabilityai/sdxl-vae/resolve/main/sdxl_vae.safetensors",
    bytes: 334641164,
    modelIds: ["sdxl"],
  },

  // ── Upscale ───────────────────────────────────────────────────────
  {
    id: "ultrasharp-4x",
    label: "4x UltraSharp (upscale)",
    kind: "upscale",
    filename: "4x-UltraSharp.pth",
    url: "https://huggingface.co/Kim2091/UltraSharp/resolve/main/4x-UltraSharp.pth",
    bytes: 66961958,
    sha256: "a5812231fc936b42af08a5edba784195495d303d5b3248c24489ef0c4021fe01",
    modelIds: ["default", "sdxl", "flux-dev", ...KLEIN_MODELS],
  },
  {
    id: "nmkd-siax-4x",
    label: "4x NMKD Siax (upscale)",
    kind: "upscale",
    filename: "4x_NMKD-Siax_200k.pth",
    url: "https://huggingface.co/gemasai/4x_NMKD-Siax_200k/resolve/main/4x_NMKD-Siax_200k.pth",
    bytes: 66957746,
    modelIds: [...QWEN_SHARED_MODELS, "default"],
    notes: "Preferred neural upscaler for Qwen / people stacks.",
  },

  // ── Qwen Image (T2I) ──────────────────────────────────────────────
  {
    id: "qwen-image-2512-bf16",
    label: "Qwen Image 2512 (bf16 UNET)",
    kind: "unet",
    filename: "qwen_image_2512_bf16.safetensors",
    url: "https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/diffusion_models/qwen_image_2512_bf16.safetensors",
    bytes: 40861031488,
    modelIds: [...QWEN_T2I_MODELS],
  },
  {
    id: "qwen-image-2512-fp8",
    label: "Qwen Image 2512 (fp8 UNET)",
    kind: "unet",
    filename: "qwen_image_2512_fp8_e4m3fn.safetensors",
    url: "https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/diffusion_models/qwen_image_2512_fp8_e4m3fn.safetensors",
    bytes: 20430679144,
    modelIds: [...QWEN_T2I_MODELS],
    notes: "Lower-VRAM alternative to bf16.",
  },
  {
    id: "qwen-image-vae",
    label: "Qwen Image VAE",
    kind: "vae",
    filename: "qwen_image_vae.safetensors",
    url: "https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/vae/qwen_image_vae.safetensors",
    bytes: 253806246,
    sha256: "a70580f0213e67967ee9c95f05bb400e8fb08307e017a924bf3441223e023d1f",
    modelIds: [...QWEN_SHARED_MODELS],
  },
  {
    id: "qwen-2.5-vl-7b-fp8",
    label: "Qwen 2.5-VL 7B text encoder (fp8)",
    kind: "clip",
    filename: "qwen_2.5_vl_7b_fp8_scaled.safetensors",
    url: "https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors",
    bytes: 9384670680,
    modelIds: [...QWEN_SHARED_MODELS],
    notes: "Recommended CLIP for most Qwen installs (models/text_encoders).",
  },
  {
    id: "qwen-2.5-vl-7b-bf16",
    label: "Qwen 2.5-VL 7B text encoder (bf16)",
    kind: "clip",
    filename: "qwen_2.5_vl_7b.safetensors",
    url: "https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/text_encoders/qwen_2.5_vl_7b.safetensors",
    bytes: 16584415576,
    modelIds: [...QWEN_SHARED_MODELS],
    notes: "Full-precision text encoder — large; prefer fp8 unless you need max fidelity.",
  },
  {
    id: "qwen-lightning-4",
    label: "Qwen Image Lightning 4-step LoRA",
    kind: "lora",
    filename: "Qwen-Image-Lightning-4steps-V2.0.safetensors",
    url: "https://huggingface.co/lightx2v/Qwen-Image-Lightning/resolve/main/Qwen-Image-Lightning-4steps-V2.0.safetensors",
    bytes: 1698951104,
    modelIds: ["qwen-image-2512-lightning-4"],
  },
  {
    id: "qwen-lightning-8",
    label: "Qwen Image Lightning 8-step LoRA",
    kind: "lora",
    filename: "Qwen-Image-Lightning-8steps-V2.0.safetensors",
    url: "https://huggingface.co/lightx2v/Qwen-Image-Lightning/resolve/main/Qwen-Image-Lightning-8steps-V2.0.safetensors",
    bytes: 1698951104,
    modelIds: ["qwen-image-2512-lightning-8"],
  },

  // ── Qwen Image Edit ───────────────────────────────────────────────
  {
    id: "qwen-image-edit-2511-bf16",
    label: "Qwen Image Edit 2511 (bf16 UNET)",
    kind: "unet",
    filename: "qwen_image_edit_2511_bf16.safetensors",
    url: "https://huggingface.co/Comfy-Org/Qwen-Image-Edit_ComfyUI/resolve/main/split_files/diffusion_models/qwen_image_edit_2511_bf16.safetensors",
    bytes: 40861031560,
    modelIds: [
      "qwen-image-edit-2511",
      "qwen-image-edit-2511-lightning-4",
      "qwen-image-edit-2511-lightning-8",
      "qwen-rapid-aio-edit",
    ],
  },
  {
    id: "qwen-image-edit-2509-bf16",
    label: "Qwen Image Edit 2509 (bf16 UNET)",
    kind: "unet",
    filename: "qwen_image_edit_2509_bf16.safetensors",
    url: "https://huggingface.co/Comfy-Org/Qwen-Image-Edit_ComfyUI/resolve/main/split_files/diffusion_models/qwen_image_edit_2509_bf16.safetensors",
    bytes: 40861031488,
    modelIds: ["qwen-image-edit-2509"],
  },
  {
    id: "qwen-edit-lightning-4",
    label: "Qwen Edit 2511 Lightning 4-step LoRA",
    kind: "lora",
    filename: "Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors",
    url: "https://huggingface.co/lightx2v/Qwen-Image-Edit-2511-Lightning/resolve/main/Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors",
    bytes: 849608296,
    modelIds: ["qwen-image-edit-2511-lightning-4"],
  },
  {
    id: "qwen-edit-lightning-8",
    label: "Qwen Edit 2511 Lightning 8-step LoRA",
    kind: "lora",
    filename: "Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors",
    url: "https://huggingface.co/lightx2v/Qwen-Image-Edit-2511-Lightning/resolve/main/Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors",
    bytes: 849608296,
    modelIds: ["qwen-image-edit-2511-lightning-8"],
  },

  // ── FLUX.1 ────────────────────────────────────────────────────────
  {
    id: "flux1-dev-unet",
    label: "FLUX.1-dev UNET (fp8)",
    kind: "unet",
    filename: "flux1-dev-fp8.safetensors",
    url: "https://huggingface.co/Comfy-Org/flux1-dev/resolve/main/flux1-dev-fp8.safetensors",
    bytes: 17246524772,
    modelIds: ["flux-dev"],
    notes: "Public Comfy-Org fp8 pack. Full bf16 flux1-dev.safetensors is also on this repo.",
  },
  {
    id: "flux1-dev-unet-bf16",
    label: "FLUX.1-dev UNET (bf16)",
    kind: "unet",
    filename: "flux1-dev.safetensors",
    url: "https://huggingface.co/Comfy-Org/flux1-dev/resolve/main/flux1-dev.safetensors",
    bytes: 23802932552,
    modelIds: ["flux-dev"],
  },
  {
    id: "flux1-ae",
    label: "FLUX.1 AE VAE",
    kind: "vae",
    filename: "ae.safetensors",
    modelIds: ["flux-dev"],
    notes:
      "Gated on black-forest-labs/FLUX.1-dev — place manually or download with HF_TOKEN after accepting the license.",
    requiresHfToken: true,
  },
  {
    id: "flux-clip-l",
    label: "FLUX CLIP-L text encoder",
    kind: "clip",
    filename: "clip_l.safetensors",
    url: "https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/clip_l.safetensors",
    bytes: 246144152,
    modelIds: ["flux-dev"],
  },
  {
    id: "flux-t5xxl-fp8",
    label: "FLUX T5-XXL text encoder (fp8 scaled)",
    kind: "clip",
    filename: "t5xxl_fp8_e4m3fn_scaled.safetensors",
    url: "https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/t5xxl_fp8_e4m3fn_scaled.safetensors",
    bytes: 5157348688,
    modelIds: ["flux-dev"],
    notes: "DualCLIPLoader clip_name2 for FLUX.1-dev.",
  },

  // ── FLUX.2 / Klein ────────────────────────────────────────────────
  {
    id: "flux2-vae",
    label: "FLUX.2 VAE",
    kind: "vae",
    filename: "flux2-vae.safetensors",
    url: "https://huggingface.co/Comfy-Org/flux2-dev/resolve/main/split_files/vae/flux2-vae.safetensors",
    bytes: 336213556,
    modelIds: [...KLEIN_MODELS],
  },
  {
    id: "flux2-klein-4b",
    label: "FLUX.2 Klein 4B distilled UNET",
    kind: "unet",
    filename: "flux-2-klein-4b.safetensors",
    url: "https://huggingface.co/Comfy-Org/flux2-klein/resolve/main/split_files/diffusion_models/flux-2-klein-4b.safetensors",
    bytes: 7751105712,
    modelIds: ["flux-2-klein-4b-distilled", "flux-2-klein"],
  },
  {
    id: "flux2-klein-base-4b",
    label: "FLUX.2 Klein 4B Base UNET",
    kind: "unet",
    filename: "flux-2-klein-base-4b.safetensors",
    url: "https://huggingface.co/Comfy-Org/flux2-klein/resolve/main/split_files/diffusion_models/flux-2-klein-base-4b.safetensors",
    bytes: 7751105712,
    modelIds: ["flux-2-klein"],
  },
  {
    id: "flux2-klein-qwen3-4b",
    label: "Klein Qwen3-4B text encoder",
    kind: "clip",
    filename: "qwen_3_4b.safetensors",
    url: "https://huggingface.co/Comfy-Org/flux2-klein/resolve/main/split_files/text_encoders/qwen_3_4b.safetensors",
    bytes: 8044982048,
    modelIds: ["flux-2-klein", "flux-2-klein-4b-distilled"],
  },
  {
    id: "flux2-klein-9b",
    label: "FLUX.2 Klein 9B UNET",
    kind: "unet",
    filename: "flux-2-klein-9b.safetensors",
    modelIds: ["flux-2-klein-9b", "flux-2-klein-9b-distilled"],
    notes: "Often gated / third-party — place under diffusion_models when you have a pack.",
    requiresHfToken: true,
  },
  {
    id: "flux2-klein-qwen3-8b",
    label: "Klein Qwen3-8B text encoder (fp8mixed)",
    kind: "clip",
    filename: "qwen_3_8b_fp8mixed.safetensors",
    modelIds: ["flux-2-klein-9b", "flux-2-klein-9b-distilled"],
    notes: "Expected DualCLIP for Klein 9B — place under text_encoders.",
  },

  // ── WAN video ─────────────────────────────────────────────────────
  {
    id: "wan-video-14b",
    label: "WAN 2.2 T2V 14B high-noise",
    kind: "unet",
    filename: "wan2.2_t2v_high_noise_14B_fp16.safetensors",
    url: "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_repackaged/resolve/main/split_files/diffusion_models/wan2.2_t2v_high_noise_14B_fp16.safetensors",
    bytes: 28577095592,
    modelIds: [...WAN_MODELS],
  },
  {
    id: "wan-video-14b-low",
    label: "WAN 2.2 T2V 14B low-noise",
    kind: "unet",
    filename: "wan2.2_t2v_low_noise_14B_fp16.safetensors",
    url: "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_repackaged/resolve/main/split_files/diffusion_models/wan2.2_t2v_low_noise_14B_fp16.safetensors",
    bytes: 28577095592,
    modelIds: ["wan-video"],
    notes: "Pair with high-noise for dual-noise WAN T2V scaffolds.",
  },
  {
    id: "wan-video-vae",
    label: "WAN 2.2 VAE",
    kind: "vae",
    filename: "wan2.2_vae.safetensors",
    url: "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_repackaged/resolve/main/split_files/vae/wan2.2_vae.safetensors",
    bytes: 1409400960,
    modelIds: [...WAN_MODELS],
  },
  {
    id: "wan-umt5-fp8",
    label: "WAN UMT5-XXL text encoder (fp8)",
    kind: "clip",
    filename: "umt5_xxl_fp8_e4m3fn_scaled.safetensors",
    url: "https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_repackaged/resolve/main/split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors",
    bytes: 6735906897,
    modelIds: [...WAN_MODELS],
  },
  {
    id: "wan-video-rapid-aio",
    label: "WAN 2.2 I2V Rapid AIO",
    kind: "checkpoint",
    filename: "wan2.2-i2v-rapid-aio-v10-nsfw.safetensors",
    modelIds: ["wan-video", "wan-video-rapid-aio", "wan-video-lightning-4"],
    notes: "All-in-one I2V Rapid pack — preferred for Prompt Studio video scaffolds (manual / third-party).",
  },
  {
    id: "wan-video-lightning-low-noise",
    label: "WAN 2.2 Lightning low-noise LoRA",
    kind: "lora",
    filename: "Wan2.2-Lightning-low_noise_model.safetensors",
    modelIds: ["wan-video-lightning-4"],
    notes: "4-step Lightning LoRA for WAN Video Lightning scaffolds.",
  },

  // ── Other video ───────────────────────────────────────────────────
  {
    id: "hunyuan-video",
    label: "Hunyuan Video T2V",
    kind: "unet",
    filename: "hunyuan_video_t2v_720p_bf16.safetensors",
    modelIds: ["hunyuan-video"],
  },
  {
    id: "ltx-video",
    label: "LTX Video 2B",
    kind: "unet",
    filename: "ltx-video-2b-v0.9.safetensors",
    modelIds: ["ltx-video"],
  },

  // ── ControlNet ────────────────────────────────────────────────────
  {
    id: "controlnet-sd15-canny",
    label: "ControlNet SD1.5 Canny (fp16)",
    kind: "controlnet",
    filename: "control_v11p_sd15_canny_fp16.safetensors",
    url: "https://huggingface.co/comfyanonymous/ControlNet-v1-1_fp16_safetensors/resolve/main/control_v11p_sd15_canny_fp16.safetensors",
    bytes: 722601100,
    modelIds: ["default", "sdxl"],
  },
  {
    id: "controlnet-sd15-openpose",
    label: "ControlNet SD1.5 OpenPose (fp16)",
    kind: "controlnet",
    filename: "control_v11p_sd15_openpose_fp16.safetensors",
    url: "https://huggingface.co/comfyanonymous/ControlNet-v1-1_fp16_safetensors/resolve/main/control_v11p_sd15_openpose_fp16.safetensors",
    bytes: 722601100,
    modelIds: ["default", "sdxl"],
  },
  {
    id: "controlnet-sd15-depth",
    label: "ControlNet SD1.5 Depth (fp16)",
    kind: "controlnet",
    filename: "control_v11f1p_sd15_depth_fp16.safetensors",
    url: "https://huggingface.co/comfyanonymous/ControlNet-v1-1_fp16_safetensors/resolve/main/control_v11f1p_sd15_depth_fp16.safetensors",
    bytes: 722601100,
    modelIds: ["default", "sdxl"],
  },
  {
    id: "controlnet-union-sdxl",
    label: "ControlNet Union SDXL",
    kind: "controlnet",
    filename: "controlnet-union-sdxl-1.0.safetensors",
    url: "https://huggingface.co/xinsir/controlnet-union-sdxl-1.0/resolve/main/diffusion_pytorch_model.safetensors",
    bytes: 2512030408,
    modelIds: ["sdxl"],
    notes: "Saved as controlnet-union-sdxl-1.0.safetensors under models/controlnet.",
  },
];

export function getCatalogAsset(id: string): ComfyCatalogAsset | undefined {
  return COMFY_ASSET_CATALOG.find((entry) => entry.id === id);
}

export function catalogAssetsForModel(
  modelId: string,
): ComfyCatalogAsset[] {
  const needle = modelId.trim();
  if (!needle) {
    return [];
  }
  return COMFY_ASSET_CATALOG.filter((entry) =>
    entry.modelIds.some(
      (id) =>
        String(id) === needle ||
        String(id) === "default" ||
        needle.startsWith(`${String(id)}-`),
    ),
  );
}

export function assetIsDownloadable(asset: ComfyCatalogAsset): boolean {
  return Boolean(asset.url && isAllowlistedAssetUrl(asset.url));
}

export function catalogAssetsByKind(
  kind: ComfyAssetKind,
  catalog: readonly ComfyCatalogAsset[] = COMFY_ASSET_CATALOG,
): ComfyCatalogAsset[] {
  return catalog.filter((entry) => entry.kind === kind);
}
