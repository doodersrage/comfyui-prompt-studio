import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COMFY_PREVIEW_EVENT_IMAGE,
  COMFY_PREVIEW_IMAGE_JPEG,
  COMFY_PREVIEW_IMAGE_PNG,
  parseComfyPreviewBinary,
} from "./comfyui-preview-binary.ts";

function buildPreviewFrame(
  imageType: number,
  payload: Uint8Array,
): ArrayBuffer {
  const buffer = new ArrayBuffer(8 + payload.byteLength);
  const view = new DataView(buffer);
  view.setUint32(0, COMFY_PREVIEW_EVENT_IMAGE, false);
  view.setUint32(4, imageType, false);
  new Uint8Array(buffer, 8).set(payload);
  return buffer;
}

describe("comfyui-preview-binary", () => {
  it("parses JPEG preview frames", () => {
    const payload = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const parsed = parseComfyPreviewBinary(
      buildPreviewFrame(COMFY_PREVIEW_IMAGE_JPEG, payload),
    );
    assert.ok(parsed);
    assert.equal(parsed.mimeType, "image/jpeg");
    assert.deepEqual([...parsed.bytes], [...payload]);
  });

  it("parses PNG preview frames", () => {
    const payload = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const parsed = parseComfyPreviewBinary(
      buildPreviewFrame(COMFY_PREVIEW_IMAGE_PNG, payload),
    );
    assert.ok(parsed);
    assert.equal(parsed.mimeType, "image/png");
  });

  it("rejects short or unknown event types", () => {
    assert.equal(parseComfyPreviewBinary(new ArrayBuffer(4)), null);
    const buffer = new ArrayBuffer(12);
    new DataView(buffer).setUint32(0, 99, false);
    assert.equal(parseComfyPreviewBinary(buffer), null);
  });
});
