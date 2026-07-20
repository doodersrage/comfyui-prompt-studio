import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
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
