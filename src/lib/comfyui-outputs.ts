export type ComfyOutputImage = {
  filename: string;
  subfolder: string;
  type: string;
  /** Explicit format hint from ComfyUI (e.g. "video/webp", "image/png"). */
  format?: string;
};

/** Media kind for gallery rendering: still image vs. video/animated clip. */
export type ComfyOutputMediaKind = "image" | "video";

const VIDEO_FILE_EXTENSIONS = new Set([
  "mp4",
  "webm",
  "mov",
  "mkv",
  "avi",
]);

/** Animated formats that should be rendered like video (looping, no controls needed). */
const ANIMATED_IMAGE_EXTENSIONS = new Set(["webp", "gif"]);

function fileExtensionOf(filename: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(filename.trim());
  return match ? match[1].toLowerCase() : "";
}

/**
 * Resolves whether a ComfyUI output should be rendered as a `<video>` element
 * (mp4/webm/etc, or animated webp/gif) versus a plain `<img>`.
 *
 * Animated webp/gif are treated as "video" so the gallery can render them
 * with the same looping/muted playback UX as true video containers, while
 * plain photographic outputs remain classic images.
 */
export function resolveComfyOutputMediaKind(
  image: Pick<ComfyOutputImage, "filename" | "format">,
): ComfyOutputMediaKind {
  const format = image.format?.toLowerCase() ?? "";
  if (format.startsWith("video/")) {
    return "video";
  }
  if (format.startsWith("image/")) {
    const formatExt = format.split("/")[1] ?? "";
    if (ANIMATED_IMAGE_EXTENSIONS.has(formatExt)) {
      return "video";
    }
    return "image";
  }

  const ext = fileExtensionOf(image.filename);
  if (VIDEO_FILE_EXTENSIONS.has(ext) || ANIMATED_IMAGE_EXTENSIONS.has(ext)) {
    return "video";
  }
  return "image";
}

/** Default long-edge for gallery grid/list thumbs (proxy resize). */
export const GALLERY_THUMB_WIDTH = 512;

/** Responsive thumb widths used for `srcSet`. */
export const GALLERY_THUMB_SRCSET_WIDTHS = [256, 512, 768] as const;

/** Tiny chips under multi-image gallery cards. */
export const GALLERY_STRIP_THUMB_WIDTH = 128;

/** Mid-res lightbox / slideshow display before full download. */
export const GALLERY_LIGHTBOX_WIDTH = 1280;

/** Ultra-small LQIP under gallery heroes. */
export const GALLERY_LQIP_WIDTH = 32;

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

    // Most nodes (SaveImage, PreviewVideo, SaveAnimatedWEBP, SaveVideo) emit
    // refs under "images"; some custom video nodes (e.g. VHS_VideoCombine)
    // emit under "gifs" instead, using the same {filename,subfolder,type} shape.
    const record = nodeOutput as { images?: unknown[]; gifs?: unknown[] };
    const refLists = [record.images, record.gifs].filter((list): list is unknown[] =>
      Array.isArray(list),
    );

    for (const refList of refLists) {
      for (const image of refList) {
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
          format: typeof ref.format === "string" ? ref.format : undefined,
        });
      }
    }
  }

  return images;
}

export type ComfyViewPathOptions = {
  /** When set, `/api/comfyui/view` returns a resized image thumb. */
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

/** Build a `srcSet` for responsive gallery thumbs. */
export function buildComfyViewSrcSet(
  comfyUrl: string,
  image: ComfyOutputImage,
  widths: readonly number[] = GALLERY_THUMB_SRCSET_WIDTHS,
): string {
  return widths
    .map((width) => `${buildComfyViewPath(comfyUrl, image, { width })} ${width}w`)
    .join(", ");
}
