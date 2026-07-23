/** Client-safe asset kind metadata (no Node fs/path). */

export type ComfyAssetKind =
  | "checkpoint"
  | "unet"
  | "vae"
  | "lora"
  | "upscale"
  | "refiner"
  | "clip"
  | "controlnet";

export const COMFY_ASSET_KIND_LABELS: Record<ComfyAssetKind, string> = {
  checkpoint: "Checkpoint",
  refiner: "Refiner",
  unet: "UNET / diffusion",
  vae: "VAE",
  clip: "Text encoder / CLIP",
  lora: "LoRA",
  upscale: "Upscale",
  controlnet: "ControlNet",
};

export const COMFY_ASSET_KIND_ORDER: ComfyAssetKind[] = [
  "checkpoint",
  "refiner",
  "unet",
  "vae",
  "clip",
  "lora",
  "upscale",
  "controlnet",
];
