/**
 * ComfyUI WebSocket binary preview protocol:
 *   bytes 0–3: event type (uint32 BE) — 1 = preview image
 *   bytes 4–7: image type (uint32 BE) — 1 = JPEG, 2 = PNG
 *   bytes 8+:  image payload
 */

export const COMFY_PREVIEW_EVENT_IMAGE = 1;
export const COMFY_PREVIEW_IMAGE_JPEG = 1;
export const COMFY_PREVIEW_IMAGE_PNG = 2;

export type ComfyPreviewBinaryParsed = {
  mimeType: "image/jpeg" | "image/png";
  bytes: Uint8Array;
};

export function parseComfyPreviewBinary(
  data: ArrayBuffer | ArrayBufferView,
): ComfyPreviewBinaryParsed | null {
  const view =
    data instanceof ArrayBuffer
      ? new DataView(data)
      : new DataView(data.buffer, data.byteOffset, data.byteLength);

  if (view.byteLength < 9) {
    return null;
  }

  const eventType = view.getUint32(0, false);
  if (eventType !== COMFY_PREVIEW_EVENT_IMAGE) {
    return null;
  }

  const imageType = view.getUint32(4, false);
  const mimeType =
    imageType === COMFY_PREVIEW_IMAGE_PNG ? "image/png" : "image/jpeg";

  const bytes = new Uint8Array(
    view.buffer,
    view.byteOffset + 8,
    view.byteLength - 8,
  );
  if (bytes.byteLength === 0) {
    return null;
  }

  return { mimeType, bytes };
}

export function comfyPreviewBinaryToObjectUrl(
  data: ArrayBuffer | ArrayBufferView,
): string | null {
  const parsed = parseComfyPreviewBinary(data);
  if (!parsed) {
    return null;
  }
  const copy = new Uint8Array(parsed.bytes);
  const blob = new Blob([copy], { type: parsed.mimeType });
  return URL.createObjectURL(blob);
}
