export type ComfyOutputImage = {
  filename: string;
  subfolder: string;
  type: string;
};

/** Max long-edge for gallery grid/list thumbs (proxy resize). */
export const GALLERY_THUMB_WIDTH = 512;

export function extractImagesFromOutputs(
  outputs: Record<string, unknown> | undefined,
): ComfyOutputImage[] {
  if (!outputs) {
    return [];
  }

  const images: ComfyOutputImage[] = [];

  for (const nodeOutput of Object.values(outputs)) {
    if (!nodeOutput || typeof nodeOutput !== "object") {
      continue;
    }

    const record = nodeOutput as { images?: unknown[] };
    if (!Array.isArray(record.images)) {
      continue;
    }

    for (const image of record.images) {
      if (!image || typeof image !== "object") {
        continue;
      }

      const ref = image as Record<string, unknown>;
      if (typeof ref.filename !== "string" || !ref.filename.trim()) {
        continue;
      }

      images.push({
        filename: ref.filename,
        subfolder: typeof ref.subfolder === "string" ? ref.subfolder : "",
        type: typeof ref.type === "string" ? ref.type : "output",
      });
    }
  }

  return images;
}

export type ComfyViewPathOptions = {
  /** When set, `/api/comfyui/view` returns a resized JPEG thumb. */
  width?: number;
};

export function buildComfyViewPath(
  comfyUrl: string,
  image: ComfyOutputImage,
  options?: ComfyViewPathOptions,
): string {
  const params = new URLSearchParams({
    filename: image.filename,
    subfolder: image.subfolder,
    type: image.type,
    comfyUrl: comfyUrl.replace(/\/+$/, ""),
  });
  const width = options?.width;
  if (typeof width === "number" && Number.isFinite(width) && width > 0) {
    params.set("w", String(Math.min(Math.floor(width), 2048)));
  }
  return `/api/comfyui/view?${params.toString()}`;
}
