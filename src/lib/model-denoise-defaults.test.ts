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
    assert.equal(isEditCapableModel("qwen-rapid-aio-sfw"), false);
    assert.equal(isEditCapableModel("qwen-rapid-aio-edit"), true);
    assert.equal(isEditCapableModel("flux-inpaint"), true);
    assert.equal(isEditCapableModel("qwen-image-2512"), false);
  });

  it("detects qwen edit models for wired scaffolds", () => {
    assert.equal(isQwenEditModel("qwen-image-edit-2511"), true);
    assert.equal(isQwenEditModel("qwen-rapid-aio-edit"), true);
    assert.equal(isQwenEditModel("qwen-rapid-aio-sfw"), false);
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

  it("uses full denoise for Lightning edit models (refs do not lower denoise)", () => {
    assert.equal(
      resolveDenoiseForModel("qwen-image-edit-2511-lightning-8", { tool: "generate" }),
      1,
    );
    assert.equal(
      resolveDenoiseForModel("qwen-image-edit-2511-lightning-8", { tool: "refine" }),
      1,
    );
    assert.equal(
      resolveDenoiseForModel("qwen-image-edit-2511-lightning-8", {
        tool: "refine",
        hasInputImage: true,
      }),
      1,
    );
    assert.equal(
      resolveDenoiseForModel("qwen-image-edit-2511-lightning-8", {
        tool: "refine",
        hasInputImage: true,
        override: 0.65,
      }),
      1,
    );
  });

  it("uses full denoise for Rapid AIO even with input images or soft overrides", () => {
    assert.equal(resolveDenoiseForModel("qwen-rapid-aio-sfw", { tool: "generate" }), 1);
    assert.equal(
      resolveDenoiseForModel("qwen-rapid-aio-nsfw", {
        tool: "refine",
        hasInputImage: true,
      }),
      1,
    );
    assert.equal(
      resolveDenoiseForModel("qwen-rapid-aio-edit", {
        tool: "refine",
        hasInputImage: true,
        override: 0.65,
      }),
      1,
    );
    assert.equal(
      resolveDenoiseForModel("qwen-rapid-aio-edit", { hasMaskImage: true }),
      0.75,
    );
  });

  it("forces denoise 1 for WAN video even with init images (I2V)", () => {
    assert.equal(
      resolveDenoiseForModel("wan-video", {
        tool: "video",
        hasInputImage: true,
      }),
      1,
    );
    assert.equal(
      resolveDenoiseForModel("wan-video-lightning-4", {
        tool: "video",
        hasInputImage: true,
        override: 0.65,
      }),
      1,
    );
    assert.equal(
      resolveDenoiseForModel("wan-video-rapid-aio", {
        tool: "video",
        hasInputImage: true,
        override: 0.65,
      }),
      1,
    );
    assert.equal(
      resolveDenoiseForModel("wan-video", { hasInputImage: true }),
      1,
    );
  });
});
