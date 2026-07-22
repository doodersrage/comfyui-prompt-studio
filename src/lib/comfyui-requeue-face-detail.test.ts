import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canFaceDetailGalleryEntry,
  galleryEntrySupportsFaceDetail,
} from "./comfyui-requeue.ts";

describe("comfyui-requeue face detail guards", () => {
  it("allows completed entries with output images", () => {
    assert.equal(
      canFaceDetailGalleryEntry({
        status: "completed",
        images: [{ filename: "out.png", subfolder: "", type: "output" }],
        comfyUrl: "http://127.0.0.1:8188",
      }),
      true,
    );
  });

  it("allows completed entries with sourceImageUrl fallback", () => {
    assert.equal(
      canFaceDetailGalleryEntry({
        status: "completed",
        images: [],
        sourceImageUrl: "http://127.0.0.1:8188/view?filename=out.png",
        comfyUrl: "http://127.0.0.1:8188",
      }),
      true,
    );
  });

  it("skips non-completed or imageless entries", () => {
    assert.equal(
      canFaceDetailGalleryEntry({
        status: "running",
        images: [{ filename: "out.png", subfolder: "", type: "output" }],
        comfyUrl: "http://127.0.0.1:8188",
      }),
      false,
    );
    assert.equal(
      canFaceDetailGalleryEntry({
        status: "completed",
        images: [],
        comfyUrl: "http://127.0.0.1:8188",
      }),
      false,
    );
  });

  it("disables face detail for Lightning models (pass-through only)", () => {
    assert.equal(galleryEntrySupportsFaceDetail("qwen-image-2512-lightning-8"), false);
    assert.equal(
      canFaceDetailGalleryEntry({
        status: "completed",
        images: [{ filename: "out.png", subfolder: "", type: "output" }],
        comfyUrl: "http://127.0.0.1:8188",
        model: "qwen-image-2512-lightning-8",
      }),
      false,
    );
  });

  it("allows non-Lightning models", () => {
    assert.equal(galleryEntrySupportsFaceDetail("qwen-image-2512"), true);
    assert.equal(galleryEntrySupportsFaceDetail(undefined), true);
  });
});
