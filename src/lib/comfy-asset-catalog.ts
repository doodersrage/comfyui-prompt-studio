import type { ComfyImageModel } from "./comfy-models/client";
import type { ComfyAssetKind } from "./comfy-asset-paths";

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

/**
 * Curated weights tied to suggested loader maps.
 * Entries without `url` are docs-only (show expected filename, no Install).
 */
export const COMFY_ASSET_CATALOG: ComfyCatalogAsset[] = [
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
    id: "ultrasharp-4x",
    label: "4x UltraSharp (upscale)",
    kind: "upscale",
    filename: "4x-UltraSharp.pth",
    url: "https://huggingface.co/Kim2091/UltraSharp/resolve/main/4x-UltraSharp.pth",
    bytes: 66961958,
    sha256: "a5812231fc936b42af08a5edba784195495d303d5b3248c24489ef0c4021fe01",
    modelIds: ["default", "sdxl", "flux-dev", "flux-2-klein", "flux-2-klein-9b"],
  },
  {
    id: "flux1-dev-unet",
    label: "FLUX.1-dev UNET",
    kind: "unet",
    filename: "flux1-dev.safetensors",
    modelIds: ["flux-dev"],
    notes: "Often gated on Hugging Face — place the file manually if Install is unavailable.",
  },
  {
    id: "flux1-ae",
    label: "FLUX.1 AE VAE",
    kind: "vae",
    filename: "ae.safetensors",
    modelIds: ["flux-dev"],
    notes: "Usually shipped with FLUX.1-dev; place under models/vae.",
  },
  {
    id: "flux2-vae",
    label: "FLUX.2 VAE",
    kind: "vae",
    filename: "flux2-vae.safetensors",
    modelIds: [
      "flux-2-klein",
      "flux-2-klein-4b-distilled",
      "flux-2-klein-9b",
      "flux-2-klein-9b-distilled",
    ],
    notes: "Expected by Klein suggested VAE map — add when you have a public pack URL.",
  },
  {
    id: "qwen-image-2512",
    label: "Qwen Image 2512",
    kind: "unet",
    filename: "qwen_image_2512_bf16.safetensors",
    modelIds: [
      "qwen-image-2512",
      "qwen-image-2512-lightning-4",
      "qwen-image-2512-lightning-8",
    ],
    notes: "Install from the official Qwen / Comfy-Org pack into diffusion_models.",
  },
  {
    id: "qwen-image-vae",
    label: "Qwen Image VAE",
    kind: "vae",
    filename: "qwen_image_vae.safetensors",
    modelIds: [
      "qwen-image-2512",
      "qwen-image-edit-2511",
      "qwen-image-edit-2509",
    ],
  },
  {
    id: "qwen-image-edit-2511",
    label: "Qwen Image Edit 2511",
    kind: "unet",
    filename: "qwen_image_edit_2511_bf16.safetensors",
    modelIds: [
      "qwen-image-edit-2511",
      "qwen-image-edit-2511-lightning-4",
      "qwen-image-edit-2511-lightning-8",
    ],
  },
  {
    id: "wan-video-rapid-aio",
    label: "WAN 2.2 I2V Rapid AIO",
    kind: "checkpoint",
    filename: "wan2.2-i2v-rapid-aio-v10-nsfw.safetensors",
    modelIds: ["wan-video"],
    notes: "All-in-one I2V Rapid pack — preferred for Prompt Studio video scaffolds.",
  },
  {
    id: "wan-video-14b",
    label: "WAN 2.2 T2V 14B",
    kind: "unet",
    filename: "wan2.2_t2v_high_noise_14B_fp16.safetensors",
    modelIds: ["wan-video"],
    notes: "Official dual-noise T2V weight when not using a Rapid AIO pack.",
  },
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
    entry.modelIds.some((id) => id === needle || id === "default"),
  );
}

export function assetIsDownloadable(asset: ComfyCatalogAsset): boolean {
  return Boolean(asset.url && isAllowlistedAssetUrl(asset.url));
}
