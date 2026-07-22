/**
 * Outpaint helpers: pad a source canvas and fill the new border as a white
 * inpaint mask so the existing inpaint queue path can expand the frame.
 */

export type OutpaintPadInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export function normalizeOutpaintPad(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1024, Math.round(value)));
}

export function normalizeOutpaintInsets(input: Partial<OutpaintPadInsets>): OutpaintPadInsets {
  return {
    top: normalizeOutpaintPad(input.top),
    right: normalizeOutpaintPad(input.right),
    bottom: normalizeOutpaintPad(input.bottom),
    left: normalizeOutpaintPad(input.left),
  };
}

export function outpaintInsetsHavePad(insets: OutpaintPadInsets): boolean {
  return insets.top + insets.right + insets.bottom + insets.left > 0;
}

export function buildOutpaintInstruction(insets: OutpaintPadInsets, intent: string): string {
  const sides: string[] = [];
  if (insets.top) sides.push(`${insets.top}px top`);
  if (insets.right) sides.push(`${insets.right}px right`);
  if (insets.bottom) sides.push(`${insets.bottom}px bottom`);
  if (insets.left) sides.push(`${insets.left}px left`);
  const edge = sides.length > 0 ? sides.join(", ") : "the expanded border";
  const change = intent.trim() || "continue the scene naturally";
  return `In the masked region (expanded canvas: ${edge}), ${change}. Keep all unmasked original pixels unchanged.`;
}

/**
 * Draw source into a larger canvas; white = expand region (mask), black = keep.
 * Returns data URLs for the padded RGB image and the mask.
 */
export async function renderOutpaintPadAndMask(
  source: HTMLImageElement | ImageBitmap,
  insets: OutpaintPadInsets,
): Promise<{ imageDataUrl: string; maskDataUrl: string; width: number; height: number }> {
  const normalized = normalizeOutpaintInsets(insets);
  if (!outpaintInsetsHavePad(normalized)) {
    throw new Error("Set at least one pad side greater than zero.");
  }

  const srcWidth = "naturalWidth" in source ? source.naturalWidth : source.width;
  const srcHeight = "naturalHeight" in source ? source.naturalHeight : source.height;
  const width = srcWidth + normalized.left + normalized.right;
  const height = srcHeight + normalized.top + normalized.bottom;

  const imageCanvas = document.createElement("canvas");
  imageCanvas.width = width;
  imageCanvas.height = height;
  const imageCtx = imageCanvas.getContext("2d");
  if (!imageCtx) {
    throw new Error("Could not create outpaint canvas.");
  }
  imageCtx.fillStyle = "#808080";
  imageCtx.fillRect(0, 0, width, height);
  imageCtx.drawImage(source, normalized.left, normalized.top);

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = width;
  maskCanvas.height = height;
  const maskCtx = maskCanvas.getContext("2d");
  if (!maskCtx) {
    throw new Error("Could not create outpaint mask canvas.");
  }
  maskCtx.fillStyle = "#ffffff";
  maskCtx.fillRect(0, 0, width, height);
  maskCtx.fillStyle = "#000000";
  maskCtx.fillRect(normalized.left, normalized.top, srcWidth, srcHeight);

  return {
    imageDataUrl: imageCanvas.toDataURL("image/png"),
    maskDataUrl: maskCanvas.toDataURL("image/png"),
    width,
    height,
  };
}
