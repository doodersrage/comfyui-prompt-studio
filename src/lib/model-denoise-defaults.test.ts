import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isEditCapableModel,
  isQwenEditModel,
  resolveDenoiseForModel,
} from "./model-denoise-defaults.ts";

describe("model denoise defaults", () => {
  it("detects edit-capable models", () => {
    assert.equal(isEditCapableModel("qwen-image-edit-2511"), true);
    assert.equal(isEditCapableModel("qwen-rapid-aio-sfw"), true);
    assert.equal(isEditCapableModel("flux-inpaint"), true);
    assert.equal(isEditCapableModel("qwen-image-2512"), false);
  });

  it("detects qwen edit models for wired scaffolds", () => {
    assert.equal(isQwenEditModel("qwen-image-edit-2511"), true);
    assert.equal(isQwenEditModel("qwen-rapid-aio-edit"), true);
    assert.equal(isQwenEditModel("qwen-image-2512"), false);
  });

  it("returns edit denoise when an input image is present", () => {
    assert.equal(
      resolveDenoiseForModel("qwen-image-2512", { hasInputImage: true }),
      0.65,
    );
  });

  it("returns inpaint denoise for flux inpaint in edit context", () => {
    assert.equal(resolveDenoiseForModel("flux-inpaint", { tool: "refine" }), 0.75);
  });

  it("returns inpaint denoise when a mask image is present", () => {
    assert.equal(
      resolveDenoiseForModel("qwen-image-2512", { hasMaskImage: true }),
      0.75,
    );
  });

  it("uses full denoise for plain T2I queue", () => {
    assert.equal(resolveDenoiseForModel("qwen-image-2512", { tool: "generate" }), 1);
  });
});
