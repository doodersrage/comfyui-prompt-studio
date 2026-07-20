import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canUpscaleGalleryEntry } from "./comfyui-requeue.ts";

describe("comfyui-requeue upscale guards", () => {
  it("allows completed entries with output images", () => {
    assert.equal(
      canUpscaleGalleryEntry({
        status: "completed",
        images: [{ filename: "out.png", subfolder: "", type: "output" }],
        comfyUrl: "http://127.0.0.1:8188",
      }),
      true,
    );
  });

  it("allows completed entries with sourceImageUrl fallback", () => {
    assert.equal(
      canUpscaleGalleryEntry({
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
      canUpscaleGalleryEntry({
        status: "running",
        images: [{ filename: "out.png", subfolder: "", type: "output" }],
        comfyUrl: "http://127.0.0.1:8188",
      }),
      false,
    );
    assert.equal(
      canUpscaleGalleryEntry({
        status: "completed",
        images: [],
        comfyUrl: "http://127.0.0.1:8188",
      }),
      false,
    );
  });
});
