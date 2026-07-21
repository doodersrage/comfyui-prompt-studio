import {
  getComfyModelDefinition,
  type ComfyImageModel,
} from "./comfy-models/client";

export function getReformatTargetModel(
  current: ComfyImageModel,
): ComfyImageModel {
  return current === "flux-2-klein" ? "qwen-image-2512" : "flux-2-klein";
}

export function getReformatTargetLabel(current: ComfyImageModel): string {
  return getComfyModelDefinition(getReformatTargetModel(current)).label;
}
