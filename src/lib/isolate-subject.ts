export const ISOLATE_FILL_WHITE = { r: 255, g: 255, b: 255 } as const;

/** Default on; only an explicit falsey flag turns isolation off. */
export function normalizeIsolateSubject(value: unknown): boolean {
  return value !== false && value !== 'false' && value !== 0;
}

/** Alpha-composite RGBA onto an opaque fill (white plate for img2img). */
export function compositeRgbaOnFill(
  src: Uint8ClampedArray,
  fill: { r: number; g: number; b: number } = ISOLATE_FILL_WHITE
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    const alpha = (src[i + 3] ?? 0) / 255;
    const inv = 1 - alpha;
    out[i] = Math.round((src[i] ?? 0) * alpha + fill.r * inv);
    out[i + 1] = Math.round((src[i + 1] ?? 0) * alpha + fill.g * inv);
    out[i + 2] = Math.round((src[i + 2] ?? 0) * alpha + fill.b * inv);
    out[i + 3] = 255;
  }
  return out;
}

function cutoutFilename(name: string): string {
  const base = name.replace(/\.[^.]+$/, '') || 'roleplay-ref';
  return `${base}-cutout.png`;
}

async function blobToImageBitmap(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob);
}

/** Paint a transparent cutout onto an opaque white PNG. */
export async function flattenCutoutOnWhite(cutout: Blob, filename: string): Promise<File> {
  const bitmap = await blobToImageBitmap(cutout);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, bitmap.width);
    canvas.height = Math.max(1, bitmap.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not isolate the subject (no canvas).');
    }
    ctx.fillStyle = `rgb(${ISOLATE_FILL_WHITE.r}, ${ISOLATE_FILL_WHITE.g}, ${ISOLATE_FILL_WHITE.b})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        next => {
          if (!next) {
            reject(new Error('Could not write the isolated subject.'));
            return;
          }
          resolve(next);
        },
        'image/png',
        1
      );
    });
    return new File([blob], cutoutFilename(filename), {
      type: 'image/png',
      lastModified: Date.now(),
    });
  } finally {
    bitmap.close();
  }
}

type CutoutImage = {
  toBlob?: () => Promise<Blob> | Blob;
  toCanvas?: () => HTMLCanvasElement;
};

let segmenterPromise: Promise<(source: Blob) => Promise<Blob>> | null = null;

async function cutoutToBlob(raw: unknown): Promise<Blob> {
  if (raw instanceof Blob) {
    return raw;
  }
  const image = raw as CutoutImage | undefined;
  if (image && typeof image.toBlob === 'function') {
    return await image.toBlob();
  }
  if (image && typeof image.toCanvas === 'function') {
    const canvas = image.toCanvas();
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        blob => {
          if (!blob) {
            reject(new Error('Could not encode the cut-out.'));
            return;
          }
          resolve(blob);
        },
        'image/png',
        1
      );
    });
  }
  throw new Error('Background removal did not return an image.');
}

async function getSegmenter(): Promise<(source: Blob) => Promise<Blob>> {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      const { pipeline } = await import('@huggingface/transformers');
      const segmenter = await pipeline('background-removal', 'Xenova/modnet', {
        dtype: 'q8',
      });
      return async (source: Blob) => {
        const output = await segmenter(source);
        const raw = Array.isArray(output) ? output[0] : output;
        return await cutoutToBlob(raw);
      };
    })();
  }
  return segmenterPromise;
}

/**
 * Browser cutout (MODNet), then flatten onto white so img2img/edit models
 * cannot lock onto the original scene.
 */
export async function isolateSubjectOnWhite(source: Blob, filename: string): Promise<File> {
  const segment = await getSegmenter();
  const cutout = await segment(source);
  return flattenCutoutOnWhite(cutout, filename);
}
