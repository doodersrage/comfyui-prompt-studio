import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isComposeCapableModel,
  isEditCapableModel,
  isFluxKleinModel,
  isQwenEditModel,
  resolveDistilledQueueDenoise,
  resolveDenoiseForModel,
} from "./model-denoise-defaults";

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

  it("lists Qwen Edit and FLUX.2 Klein as Compose-capable", () => {
    assert.equal(isComposeCapableModel("qwen-image-edit-2511"), true);
    assert.equal(isComposeCapableModel("qwen-rapid-aio-edit"), true);
    for (const id of [
      "flux-2-klein",
      "flux-2-klein-4b-distilled",
      "flux-2-klein-9b",
      "flux-2-klein-9b-distilled",
    ] as const) {
      assert.equal(isFluxKleinModel(id), true);
      assert.equal(isComposeCapableModel(id), true);
    }
    assert.equal(isComposeCapableModel("flux-dev"), false);
    assert.equal(isComposeCapableModel("flux-inpaint"), false);
    assert.equal(isComposeCapableModel("qwen-image-2512"), false);
  });

  it("returns edit denoise when an input image is present", () => {
    assert.equal(
      resolveDenoiseForModel("qwen-image-2512", { hasInputImage: true }),
      0.65,
    );
  });

  it("uses denoise 1 for Klein Compose ReferenceLatent edits", () => {
    assert.equal(
      resolveDenoiseForModel("flux-2-klein-9b", {
        tool: "compose",
        hasInputImage: true,
      }),
      1,
    );
    assert.equal(
      resolveDenoiseForModel("flux-2-klein-9b-distilled", {
        tool: "compose",
        hasInputImage: true,
        override: 0.65,
      }),
      1,
    );
  });

  it("does not bump distilled Klein CFG on ReferenceLatent edit path", async () => {
    const { resolveKleinEditCfg } = await import("./model-denoise-defaults");
    assert.equal(
      resolveKleinEditCfg("flux-2-klein-9b-distilled", {
        tool: "compose",
        hasInputImage: true,
        currentCfg: 1,
      }),
      undefined,
    );
  });

  it("keeps denoise 1 on Generate even with a leftover init image", () => {
    assert.equal(
      resolveDenoiseForModel("qwen-image-2512", {
        tool: "generate",
        hasInputImage: true,
      }),
      1,
    );
    assert.equal(
      resolveDenoiseForModel("flux-2-klein-9b", {
        tool: "generate",
        hasInputImage: true,
      }),
      1,
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
      resolveDenoiseForModel("qwen-image-edit-2511-lightning-8", { tool: "compose" }),
      1,
    );
    assert.equal(
      resolveDenoiseForModel("qwen-image-edit-2511-lightning-8", {
        tool: "compose",
        hasInputImage: true,
      }),
      1,
    );
  });

  it("resolveDistilledQueueDenoise honors sidebar override on Lightning compose", () => {
    assert.equal(
      resolveDistilledQueueDenoise("qwen-image-edit-2511-lightning-8", {
        tool: "compose",
        hasInputImage: true,
        userDenoiseOverride: "0.55",
      }),
      "0.55",
    );
  });

  it("resolveDistilledQueueDenoise keeps explicit client params on Lightning compose", () => {
    assert.equal(
      resolveDistilledQueueDenoise("qwen-image-edit-2511-lightning-8", {
        tool: "compose",
        hasInputImage: true,
        paramsDenoise: "0.72",
      }),
      "0.72",
    );
  });

  it("resolveDistilledQueueDenoise forces soft handoff denoise to 1 on Lightning", () => {
    assert.equal(
      resolveDistilledQueueDenoise("qwen-image-edit-2511-lightning-8", {
        tool: "compose",
        hasInputImage: true,
        paramsDenoise: "0.65",
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
