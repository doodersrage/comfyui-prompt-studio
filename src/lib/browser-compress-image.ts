/** Target size for engine uploads — stay under Next/proxy ~10MB JSON bodies. */
const DEFAULT_MAX_EDGE = 2048;
const DEFAULT_MAX_BYTES = 3_500_000;
const DEFAULT_QUALITY = 0.9;

function extensionForMime(mimeType: string): string {
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") {
    return "jpg";
  }
  if (mimeType === "image/webp") {
    return "webp";
  }
  return "png";
}

function renameWithExtension(name: string, mimeType: string): string {
  const base = name.replace(/\.[^.]+$/, "") || "prompt-studio-upload";
  return `${base}.${extensionForMime(mimeType)}`;
}

async function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Could not compress image."));
          return;
        }
        resolve(blob);
      },
      mimeType,
      quality,
    );
  });
}

/**
 * Downscale / recompress a browser File so Compose/Refine uploads fit Next body
 * limits (JSON truncates around 10MB; base64 inflates ~33%).
 */
export async function compressImageForEngineUpload(
  file: File,
  options?: {
    maxEdge?: number;
    maxBytes?: number;
    quality?: number;
  },
): Promise<File> {
  const maxEdge = options?.maxEdge ?? DEFAULT_MAX_EDGE;
  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;
  let quality = options?.quality ?? DEFAULT_QUALITY;

  if (!file.type.startsWith("image/") && file.type !== "application/octet-stream") {
    return file;
  }

  // Already small enough — keep original bytes/format.
  if (file.size <= maxBytes) {
    try {
      const probe = await createImageBitmap(file);
      const wide = Math.max(probe.width, probe.height);
      probe.close();
      if (wide <= maxEdge) {
        return file;
      }
    } catch {
      return file;
    }
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  // JPEG keeps Compose figures well under Next/proxy body limits.
  let mimeType = "image/jpeg";
  let blob = await canvasToBlob(canvas, mimeType, quality);
  while (blob.size > maxBytes && quality > 0.55) {
    quality -= 0.08;
    blob = await canvasToBlob(canvas, mimeType, quality);
  }

  // Last resort: shrink canvas further.
  if (blob.size > maxBytes) {
    const shrink = Math.sqrt(maxBytes / blob.size) * 0.92;
    const w2 = Math.max(1, Math.round(canvas.width * shrink));
    const h2 = Math.max(1, Math.round(canvas.height * shrink));
    const canvas2 = document.createElement("canvas");
    canvas2.width = w2;
    canvas2.height = h2;
    const ctx2 = canvas2.getContext("2d");
    if (ctx2) {
      ctx2.drawImage(canvas, 0, 0, w2, h2);
      blob = await canvasToBlob(canvas2, "image/jpeg", 0.8);
      mimeType = "image/jpeg";
    }
  }

  if (blob.size >= file.size && file.size <= maxBytes * 1.2) {
    return file;
  }

  return new File([blob], renameWithExtension(file.name || "upload", mimeType), {
    type: mimeType,
    lastModified: file.lastModified,
  });
}
