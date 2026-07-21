import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { patchSamplerParamsInWorkflow } from "./comfyui-config.ts";
import {
  ensureLightningSamplerParams,
  formatModelSamplerHint,
  getModelSamplerDefaults,
  normalizeModelSamplerPresetTier,
  resolveModelSamplerParams,
} from "./model-sampler-defaults.ts";

describe("model sampler defaults", () => {
  it("returns base category defaults for SDXL models", () => {
    assert.deepEqual(getModelSamplerDefaults("sdxl", "base"), {
      steps: 30,
      cfg: 6.5,
      samplerName: "dpmpp_2m",
      scheduler: "karras",
    });
  });

  it("returns higher optimized defaults for SDXL models", () => {
    assert.deepEqual(getModelSamplerDefaults("sdxl", "optimized"), {
      steps: 36,
      cfg: 6,
      samplerName: "dpmpp_2m",
      scheduler: "karras",
    });
  });

  it("returns fast defaults for flux-schnell in both tiers", () => {
    assert.deepEqual(getModelSamplerDefaults("flux-schnell", "base"), {
      steps: 4,
      cfg: 1,
      samplerName: "euler",
      scheduler: "simple",
    });
    assert.deepEqual(getModelSamplerDefaults("flux-schnell", "optimized"), {
      steps: 4,
      cfg: 1,
      samplerName: "euler",
      scheduler: "simple",
    });
  });

  it("resolves queue params from optimized model defaults", () => {
    assert.deepEqual(resolveModelSamplerParams("qwen-image-2512", "optimized"), {
      steps: 30,
      cfg: 3.5,
      samplerName: "euler",
      scheduler: "beta",
    });
  });

  it("uses official 50-step CFG4 max ladder for vanilla qwen 2512", () => {
    assert.deepEqual(getModelSamplerDefaults("qwen-image-2512", "base"), {
      steps: 20,
      cfg: 2.5,
      samplerName: "euler",
      scheduler: "beta",
    });
    assert.deepEqual(getModelSamplerDefaults("qwen-image-2512", "maxCompatible"), {
      steps: 40,
      cfg: 4,
      samplerName: "euler",
      scheduler: "beta",
    });
    assert.deepEqual(getModelSamplerDefaults("qwen-image-2512", "max"), {
      steps: 50,
      cfg: 4,
      samplerName: "euler",
      scheduler: "beta",
    });
  });

  it("returns lightning defaults for qwen 2512 4-step", () => {
    assert.deepEqual(getModelSamplerDefaults("qwen-image-2512-lightning-4", "base"), {
      steps: 4,
      cfg: 1,
      samplerName: "euler",
      scheduler: "simple",
    });
    assert.deepEqual(
      resolveModelSamplerParams("qwen-image-edit-2511-lightning-8", "optimized"),
      {
        steps: 8,
        cfg: 1,
        samplerName: "euler",
        scheduler: "simple",
      },
    );
  });

  it("clamps stale overrides to lightning sampler params", () => {
    assert.deepEqual(
      ensureLightningSamplerParams(
        { steps: 20, cfg: 4, samplerName: "dpmpp_2m", scheduler: "karras", seed: "9" },
        "qwen-image-2512-lightning-8",
      ),
      {
        steps: 8,
        cfg: 1,
        samplerName: "euler",
        scheduler: "simple",
        seed: "9",
      },
    );
    assert.deepEqual(
      ensureLightningSamplerParams({ cfg: 7, steps: 28 }, "qwen-image-2512"),
      { cfg: 7, steps: 28 },
    );
  });

  it("returns klein distilled and base sampler presets", () => {
    assert.deepEqual(getModelSamplerDefaults("flux-2-klein-4b-distilled", "base"), {
      steps: 4,
      cfg: 1,
      samplerName: "euler",
      scheduler: "simple",
    });
    assert.deepEqual(getModelSamplerDefaults("flux-2-klein-9b-distilled", "optimized"), {
      steps: 6,
      cfg: 1.2,
      samplerName: "res_2s",
      scheduler: "simple",
    });
    assert.deepEqual(getModelSamplerDefaults("flux-2-klein-9b-distilled", "maxCompatible"), {
      steps: 8,
      cfg: 1.2,
      samplerName: "res_2s",
      scheduler: "simple",
    });
    assert.deepEqual(getModelSamplerDefaults("flux-2-klein", "base"), {
      steps: 24,
      cfg: 3.5,
      samplerName: "euler",
      scheduler: "simple",
    });
    assert.deepEqual(getModelSamplerDefaults("flux-2-klein-9b", "base"), {
      steps: 24,
      cfg: 3.5,
      samplerName: "euler",
      scheduler: "simple",
    });
    assert.deepEqual(getModelSamplerDefaults("flux-2-klein-9b", "maxCompatible"), {
      steps: 24,
      cfg: 4,
      samplerName: "res_2s",
      scheduler: "simple",
    });
    assert.deepEqual(getModelSamplerDefaults("flux-2-klein-9b", "optimized"), {
      steps: 24,
      cfg: 4,
      samplerName: "euler",
      scheduler: "simple",
    });
  });

  it("returns rapid aio checkpoint sampler presets", () => {
    assert.deepEqual(getModelSamplerDefaults("qwen-rapid-aio-edit", "base"), {
      steps: 4,
      cfg: 1,
      samplerName: "euler_ancestral",
      scheduler: "beta",
    });
    assert.deepEqual(getModelSamplerDefaults("qwen-rapid-aio-sfw", "maxCompatible"), {
      steps: 8,
      cfg: 1,
      samplerName: "euler",
      scheduler: "beta",
    });
    assert.deepEqual(getModelSamplerDefaults("qwen-rapid-aio-nsfw", "optimized"), {
      steps: 6,
      cfg: 1,
      samplerName: "euler_ancestral",
      scheduler: "sgm_uniform",
    });
  });

  it("normalizes preset tier values", () => {
    assert.equal(normalizeModelSamplerPresetTier("maxCompatible"), "maxCompatible");
    assert.equal(normalizeModelSamplerPresetTier("max-compatible"), "maxCompatible");
    assert.equal(normalizeModelSamplerPresetTier("max"), "max");
    assert.equal(normalizeModelSamplerPresetTier("optimized"), "optimized");
    assert.equal(normalizeModelSamplerPresetTier("base"), "base");
    assert.equal(normalizeModelSamplerPresetTier(undefined), "base");
  });

  it("returns max compatible defaults within model sampler limits", () => {
    const optimized = getModelSamplerDefaults("flux-dev", "optimized");
    const compatible = getModelSamplerDefaults("flux-dev", "maxCompatible");
    const max = getModelSamplerDefaults("flux-dev", "max");
    assert.deepEqual(compatible, optimized);
    assert.ok(max.steps > compatible.steps);
    assert.equal(compatible.samplerName, "euler");
    assert.equal(compatible.scheduler, "simple");
  });

  it("raises cfg slightly for klein distilled on max compatible", () => {
    assert.deepEqual(getModelSamplerDefaults("flux-2-klein-4b-distilled", "maxCompatible"), {
      steps: 8,
      cfg: 1.2,
      samplerName: "res_2s",
      scheduler: "simple",
    });
    assert.deepEqual(getModelSamplerDefaults("flux-2-klein-9b-distilled", "max"), {
      steps: 8,
      cfg: 1.3,
      samplerName: "res_2s",
      scheduler: "simple",
    });
  });

  it("returns max quality defaults above max compatible for SDXL", () => {
    const compatible = getModelSamplerDefaults("sdxl", "maxCompatible");
    const max = getModelSamplerDefaults("sdxl", "max");
    assert.ok(max.steps > compatible.steps);
    assert.ok(compatible.steps >= getModelSamplerDefaults("sdxl", "optimized").steps);
  });

  it("formats sampler hint with preset label", () => {
    assert.match(
      formatModelSamplerHint("flux-dev", "optimized"),
      /Optimized · euler · simple · steps 28/,
    );
  });
});

describe("patchSamplerParamsInWorkflow", () => {
  it("patches KSampler seed, steps, cfg, sampler, and scheduler inputs", () => {
    const workflow = {
      "3": {
        class_type: "KSampler",
        inputs: {
          seed: 1,
          steps: 10,
          cfg: 5,
          sampler_name: "euler",
          scheduler: "normal",
        },
      },
    };

    const result = patchSamplerParamsInWorkflow(workflow, {
      seed: "999",
      steps: "28",
      cfg: "6.5",
      samplerName: "dpmpp_2m",
      scheduler: "karras",
    });

    const inputs = (result.workflow["3"] as { inputs: Record<string, unknown> }).inputs;
    assert.equal(inputs.seed, 999);
    assert.equal(inputs.steps, 28);
    assert.equal(inputs.cfg, 6.5);
    assert.equal(inputs.sampler_name, "dpmpp_2m");
    assert.equal(inputs.scheduler, "karras");
    assert.deepEqual(result.patched, {
      seed: 1,
      steps: 1,
      cfg: 1,
      samplerName: 1,
      scheduler: 1,
    });
  });

  it("resolves {{DENOISE}} placeholder to 1.0 when params omit denoise", () => {
    const workflow = {
      "8": {
        class_type: "KSampler",
        inputs: { denoise: "{{DENOISE}}" },
      },
    };
    const result = patchSamplerParamsInWorkflow(workflow, {
      seed: 1,
      steps: 20,
      cfg: 4,
      samplerName: "euler",
      scheduler: "normal",
    });
    const inputs = (result.workflow["8"] as { inputs: Record<string, unknown> }).inputs;
    assert.equal(inputs.denoise, 1);
    assert.equal(result.patched.denoise, 1);
  });
});
