import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { patchSamplerParamsInWorkflow } from "./comfyui-config.ts";
import {
  formatModelSamplerHint,
  getModelSamplerDefaults,
  normalizeModelSamplerPresetTier,
  resolveModelSamplerParams,
} from "./model-sampler-defaults.ts";

describe("model sampler defaults", () => {
  it("returns base category defaults for SDXL models", () => {
    assert.deepEqual(getModelSamplerDefaults("sdxl", "base"), { steps: 30, cfg: 6.5 });
  });

  it("returns higher optimized defaults for SDXL models", () => {
    assert.deepEqual(getModelSamplerDefaults("sdxl", "optimized"), {
      steps: 36,
      cfg: 6,
    });
  });

  it("returns fast defaults for flux-schnell in both tiers", () => {
    assert.deepEqual(getModelSamplerDefaults("flux-schnell", "base"), {
      steps: 4,
      cfg: 1,
    });
    assert.deepEqual(getModelSamplerDefaults("flux-schnell", "optimized"), {
      steps: 4,
      cfg: 1,
    });
  });

  it("resolves queue params from optimized model defaults", () => {
    assert.deepEqual(resolveModelSamplerParams("qwen-image-2512", "optimized"), {
      steps: 40,
      cfg: 3.5,
    });
  });

  it("normalizes preset tier values", () => {
    assert.equal(normalizeModelSamplerPresetTier("optimized"), "optimized");
    assert.equal(normalizeModelSamplerPresetTier("base"), "base");
    assert.equal(normalizeModelSamplerPresetTier(undefined), "base");
  });

  it("formats sampler hint with preset label", () => {
    assert.match(formatModelSamplerHint("flux-dev", "optimized"), /Optimized · steps 28/);
  });
});

describe("patchSamplerParamsInWorkflow", () => {
  it("patches KSampler seed, steps, and cfg inputs", () => {
    const workflow = {
      "3": {
        class_type: "KSampler",
        inputs: {
          seed: 1,
          steps: 10,
          cfg: 5,
        },
      },
    };

    const result = patchSamplerParamsInWorkflow(workflow, {
      seed: "999",
      steps: "28",
      cfg: "6.5",
    });

    assert.equal((result.workflow["3"] as { inputs: { seed: number } }).inputs.seed, 999);
    assert.equal((result.workflow["3"] as { inputs: { steps: number } }).inputs.steps, 28);
    assert.equal((result.workflow["3"] as { inputs: { cfg: number } }).inputs.cfg, 6.5);
    assert.deepEqual(result.patched, { seed: 1, steps: 1, cfg: 1 });
  });
});
