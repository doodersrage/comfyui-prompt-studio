import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { auditLoaderMapsAgainstComfyUi } from "./loader-map-health-audit";

describe("loader-map-health-audit", () => {
  it("flags checkpoint filenames missing from ComfyUI lists", () => {
    const issues = auditLoaderMapsAgainstComfyUi({
      checkpointMap: { "qwen-image-2512": "missing.safetensors" },
      vaeMap: {},
      upscaleMap: {},
      models: {
        checkpoints: ["real.safetensors"],
        unets: [],
        vaes: [],
        upscaleModels: [],
        clips: [],
        dualClipTypes: [],
        clipLoaderTypes: [],
        loras: [],
        controlNets: [],
      },
    });
    assert.equal(issues.length, 1);
    assert.equal(issues[0]?.severity, "error");
  });

  it("warns for missing curated suggested defaults instead of hard-failing", () => {
    const issues = auditLoaderMapsAgainstComfyUi({
      checkpointMap: {
        "flux-dev": "flux1-dev.safetensors",
        sdxl: "sd_xl_base_1.0.safetensors",
      },
      vaeMap: {},
      upscaleMap: {},
      models: {
        checkpoints: ["Qwen-Rapid-AIO-NSFW-v23.safetensors"],
        unets: [],
        vaes: [],
        upscaleModels: [],
        clips: [],
        dualClipTypes: [],
        clipLoaderTypes: [],
        loras: [],
        controlNets: [],
      },
    });
    assert.equal(issues.length, 2);
    assert.equal(
      issues.find((issue) => issue.message.includes("flux-dev"))?.severity,
      "error",
    );
    assert.equal(
      issues.find((issue) => issue.message.includes("sdxl"))?.severity,
      "warn",
    );
  });

  it("flags Flux fine-tunes that only exist under checkpoints/", () => {
    const issues = auditLoaderMapsAgainstComfyUi({
      checkpointMap: {
        "flux-ultrareal-v4": "ultrarealFineTune_v4.safetensors",
      },
      vaeMap: {},
      upscaleMap: {},
      models: {
        checkpoints: ["ultrarealFineTune_v4.safetensors"],
        unets: ["flux1-dev.safetensors"],
        vaes: [],
        upscaleModels: [],
        clips: [],
        dualClipTypes: [],
        clipLoaderTypes: [],
        loras: [],
        controlNets: [],
      },
    });
    assert.equal(issues.length, 1);
    assert.match(issues[0]!.message, /checkpoints\/ but UNETLoader/);
  });

  it("warns when upscale model is not installed", () => {
    const issues = auditLoaderMapsAgainstComfyUi({
      checkpointMap: {},
      vaeMap: {},
      upscaleMap: { default: "4x-UltraSharp.pth" },
      models: {
        checkpoints: [],
        unets: [],
        vaes: [],
        upscaleModels: ["RealESRGAN_x4plus.pth"],
        clips: [],
        dualClipTypes: [],
        clipLoaderTypes: [],
        loras: [],
        controlNets: [],
      },
    });
    assert.equal(issues.length, 1);
    assert.equal(issues[0]?.severity, "warn");
  });
});
