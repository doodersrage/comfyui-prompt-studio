import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { patchSamplerParamsInWorkflow } from "./comfyui-config.ts";
import {
  ensureDistilledSamplerParams,
  ensureLightningSamplerParams,
  ensureRapidAioSamplerParams,
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
      cfg: 3.2,
      samplerName: "euler",
      scheduler: "beta",
    });
  });

  it("uses a calmer 50-step CFG ladder for vanilla qwen 2512", () => {
    assert.deepEqual(getModelSamplerDefaults("qwen-image-2512", "base"), {
      steps: 20,
      cfg: 2.5,
      samplerName: "euler",
      scheduler: "beta",
    });
    assert.deepEqual(getModelSamplerDefaults("qwen-image-2512", "maxCompatible"), {
      steps: 40,
      cfg: 3.5,
      samplerName: "euler",
      scheduler: "beta",
    });
    assert.deepEqual(getModelSamplerDefaults("qwen-image-2512", "max"), {
      steps: 50,
      cfg: 3.5,
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

  it("returns lightning defaults for WAN video 4-step", () => {
    assert.deepEqual(getModelSamplerDefaults("wan-video-lightning-4", "base"), {
      steps: 4,
      cfg: 1,
      samplerName: "uni_pc",
      scheduler: "simple",
    });
    assert.deepEqual(
      ensureLightningSamplerParams(
        { steps: 20, cfg: 6, samplerName: "uni_pc", scheduler: "simple", seed: "1" },
        "wan-video-lightning-4",
      ),
      {
        steps: 4,
        cfg: 1,
        samplerName: "uni_pc",
        scheduler: "simple",
        seed: "1",
      },
    );
  });

  it("returns Phr00t Rapid AIO presets for WAN video", () => {
    assert.deepEqual(getModelSamplerDefaults("wan-video-rapid-aio", "base"), {
      steps: 4,
      cfg: 1,
      samplerName: "euler_ancestral",
      scheduler: "beta",
    });
    assert.deepEqual(getModelSamplerDefaults("wan-video-rapid-aio", "optimized"), {
      steps: 6,
      cfg: 1,
      samplerName: "euler_ancestral",
      scheduler: "beta",
    });
    assert.deepEqual(
      ensureRapidAioSamplerParams(
        { steps: 30, cfg: 6, samplerName: "uni_pc", scheduler: "simple", seed: "2" },
        "wan-video-rapid-aio",
      ),
      {
        steps: 4,
        cfg: 1,
        samplerName: "euler_ancestral",
        scheduler: "beta",
        seed: "2",
      },
    );
  });

  it("hints CFG-1 WAN presets (Lightning / Rapid AIO) and full WAN Optimized", async () => {
    const { formatWanVideoSamplerHint } = await import("./model-sampler-defaults.ts");
    assert.match(
      formatWanVideoSamplerHint("wan-video-lightning-4", "base") ?? "",
      /4-step|cfg 1|simple/i,
    );
    assert.match(
      formatWanVideoSamplerHint("wan-video-rapid-aio", "base") ?? "",
      /rapid aio|optimized|cfg.?1/i,
    );
    assert.match(
      formatWanVideoSamplerHint("wan-video", "base") ?? "",
      /optimized/i,
    );
    assert.equal(formatWanVideoSamplerHint("wan-video", "optimized"), null);
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

  it("clamps stale overrides to Rapid AIO sampler params", () => {
    const rapid = getModelSamplerDefaults("qwen-rapid-aio-sfw", "base");
    assert.deepEqual(
      ensureRapidAioSamplerParams(
        { steps: 28, cfg: 4, samplerName: "dpmpp_2m", scheduler: "karras", seed: "3" },
        "qwen-rapid-aio-sfw",
      ),
      {
        steps: rapid.steps,
        cfg: rapid.cfg,
        samplerName: rapid.samplerName,
        scheduler: rapid.scheduler,
        seed: "3",
      },
    );
    assert.deepEqual(
      ensureDistilledSamplerParams(
        { cfg: 7, steps: 20 },
        "qwen-rapid-aio-nsfw",
      ).cfg,
      1,
    );
  });

  it("preserves Rapid AIO Max steps when inject passes base tier", () => {
    const preserved = ensureDistilledSamplerParams(
      {
        steps: 10,
        cfg: 1,
        samplerName: "euler",
        scheduler: "sgm_uniform",
      },
      "qwen-rapid-aio-sfw",
      "base",
    );
    assert.equal(preserved.steps, 10);
    assert.equal(preserved.cfg, 1);
    assert.equal(preserved.scheduler, "sgm_uniform");
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
    assert.deepEqual(getModelSamplerDefaults("flux-2-klein-9b", "max"), {
      steps: 28,
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
    assert.deepEqual(getModelSamplerDefaults("qwen-rapid-aio-sfw", "max"), {
      steps: 10,
      cfg: 1,
      samplerName: "euler",
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

  it("returns video model family sampler presets", () => {
    assert.deepEqual(getModelSamplerDefaults("wan-video", "optimized"), {
      steps: 30,
      cfg: 6,
      samplerName: "uni_pc",
      scheduler: "simple",
    });
    assert.equal(getModelSamplerDefaults("ltx-video", "base").scheduler, "ltxv");
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
