import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ensureLightningNativeResolutionParams,
  formatModelResolutionHint,
  getModelResolutionPreset,
  normalizeResolutionOrientation,
  normalizeResolutionSizeTier,
  resolveModelResolutionParams,
} from "./model-resolution-defaults.ts";
import { resolveQueueParams } from "./queue-params-settings.ts";

describe("model resolution defaults", () => {
  it("returns SDXL native square at medium tier", () => {
    assert.deepEqual(getModelResolutionPreset("sdxl", "square", "medium"), {
      width: 1024,
      height: 1024,
    });
  });

  it("returns portrait presets with height greater than width", () => {
    const preset = getModelResolutionPreset("flux-dev", "portrait", "medium");
    assert.ok(preset.height > preset.width);
  });

  it("returns landscape presets with width greater than height", () => {
    const preset = getModelResolutionPreset("flux-dev", "landscape", "medium");
    assert.ok(preset.width > preset.height);
  });

  it("applies qwen-image max square override", () => {
    assert.deepEqual(getModelResolutionPreset("qwen-image-2512", "square", "max"), {
      width: 1328,
      height: 1328,
    });
  });

  it("uses native 1328 square at medium for vanilla and lightning", () => {
    assert.deepEqual(getModelResolutionPreset("qwen-image-2512", "square", "medium"), {
      width: 1328,
      height: 1328,
    });
    assert.deepEqual(
      getModelResolutionPreset("qwen-image-2512-lightning-8", "square", "medium"),
      { width: 1328, height: 1328 },
    );
  });

  it("keeps max portrait/landscape at least as large as medium official ARs", () => {
    assert.deepEqual(
      getModelResolutionPreset("qwen-image-2512", "portrait", "max"),
      { width: 928, height: 1664 },
    );
    assert.deepEqual(
      getModelResolutionPreset("qwen-image-2512", "landscape", "max"),
      { width: 1664, height: 928 },
    );
  });

  it("exposes official extra Qwen aspect ratios", () => {
    assert.deepEqual(
      getModelResolutionPreset("qwen-image-2512", "portrait-34", "medium"),
      { width: 1104, height: 1472 },
    );
    assert.deepEqual(
      getModelResolutionPreset("qwen-image-2512", "landscape-43", "medium"),
      { width: 1472, height: 1104 },
    );
    assert.deepEqual(
      getModelResolutionPreset("qwen-image-2512", "portrait-23", "medium"),
      { width: 1056, height: 1584 },
    );
    assert.deepEqual(
      getModelResolutionPreset("qwen-image-2512", "landscape-32", "medium"),
      { width: 1584, height: 1056 },
    );
  });

  it("bumps sub-native lightning queue params to native resolution", () => {
    assert.deepEqual(
      ensureLightningNativeResolutionParams(
        { width: 1024, height: 1024, steps: 8 },
        "qwen-image-2512-lightning-8",
        "square",
        "medium",
      ),
      { width: 1328, height: 1328, steps: 8 },
    );
  });

  it("keeps lightning portrait/landscape presets (not forced square)", () => {
    assert.deepEqual(
      getModelResolutionPreset("qwen-image-2512-lightning-8", "portrait", "max"),
      { width: 1104, height: 1472 },
    );
    assert.deepEqual(
      getModelResolutionPreset("qwen-image-2512-lightning-8", "landscape", "medium"),
      { width: 1472, height: 1104 },
    );
    assert.deepEqual(
      ensureLightningNativeResolutionParams(
        { width: 1104, height: 1472 },
        "qwen-image-2512-lightning-8",
        "portrait",
        "max",
      ),
      { width: 1104, height: 1472 },
    );
  });

  it("rewrites mild portrait to native square when orientation is forced square", () => {
    assert.deepEqual(
      ensureLightningNativeResolutionParams(
        { width: 1104, height: 1472 },
        "qwen-image-2512-lightning-8",
        "square",
        "max",
      ),
      { width: 1328, height: 1328 },
    );
  });

  it("rewrites extreme 928×1664 lightning portrait queues to ~3:4", () => {
    assert.deepEqual(
      ensureLightningNativeResolutionParams(
        { width: 928, height: 1664 },
        "qwen-image-edit-2511-lightning-8",
        "portrait",
        "max",
      ),
      { width: 1104, height: 1472 },
    );
  });

  it("bumps undersized lightning portrait queues to the portrait preset", () => {
    assert.deepEqual(
      ensureLightningNativeResolutionParams(
        { width: 512, height: 768 },
        "qwen-image-2512-lightning-8",
        "portrait",
        "medium",
      ),
      { width: 1104, height: 1472 },
    );
  });

  it("resolves queue width and height params", () => {
    assert.deepEqual(resolveModelResolutionParams("sdxl", "landscape", "medium"), {
      width: 1216,
      height: 832,
    });
  });

  it("normalizes orientation and tier values", () => {
    assert.equal(normalizeResolutionOrientation("portrait"), "portrait");
    assert.equal(normalizeResolutionOrientation(undefined), "square");
    assert.equal(normalizeResolutionSizeTier("max"), "max");
    assert.equal(normalizeResolutionSizeTier(undefined), "medium");
  });

  it("formats resolution hint", () => {
    assert.match(formatModelResolutionHint("sdxl", "portrait", "medium"), /832×1216/);
  });

  it("merges model resolution into resolveQueueParams when overrides disabled", () => {
    const params = resolveQueueParams({
      model: "sdxl",
      resolutionOrientation: "portrait",
      resolutionSizeTier: "medium",
    });
    assert.equal(params.width, 832);
    assert.equal(params.height, 1216);
    assert.equal(params.steps, 30);
  });
});
