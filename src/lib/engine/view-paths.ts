import type { EngineId, EngineOutputImage, EngineViewPathOptions } from "./types";

function appendWidth(
  params: URLSearchParams,
  options?: EngineViewPathOptions,
): void {
  const width = options?.width;
  if (typeof width === "number" && Number.isFinite(width) && width > 0) {
    params.set("w", String(Math.min(Math.floor(width), 2048)));
  }
}

/** Studio-proxied Diffusers view URL (mirrors Comfy view query shape). */
export function buildDiffusersViewPath(
  engineUrl: string,
  image: EngineOutputImage,
  options?: EngineViewPathOptions,
): string {
  const params = new URLSearchParams({
    filename: image.filename,
    subfolder: image.subfolder,
    type: image.type,
    engineUrl: engineUrl.replace(/\/+$/, ""),
  });
  appendWidth(params, options);
  return `/api/diffusers/view?${params.toString()}`;
}

export function buildEngineViewPath(
  engineId: EngineId | undefined,
  engineUrl: string,
  image: EngineOutputImage,
  options?: EngineViewPathOptions,
): string {
  if (engineId === "diffusers") {
    return buildDiffusersViewPath(engineUrl, image, options);
  }
  const params = new URLSearchParams({
    filename: image.filename,
    subfolder: image.subfolder,
    type: image.type,
    comfyUrl: engineUrl.replace(/\/+$/, ""),
  });
  appendWidth(params, options);
  return `/api/comfyui/view?${params.toString()}`;
}
