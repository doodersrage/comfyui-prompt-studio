import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveEffectiveResolutionSizeTier,
  resolveEffectiveSamplerPreset,
} from "./queue-quality-profile.ts";

describe("queue-quality-profile", () => {
  it("keeps sidebar preset when profile follows settings", () => {
    assert.equal(
      resolveEffectiveSamplerPreset("optimized", "followSettings"),
      "optimized",
    );
    assert.equal(
      resolveEffectiveResolutionSizeTier("medium", "followSettings"),
      "medium",
    );
  });

  it("forces draft to base sampler and caps resolution", () => {
    assert.equal(resolveEffectiveSamplerPreset("max", "draft"), "base");
    assert.equal(resolveEffectiveResolutionSizeTier("max", "draft"), "medium");
  });

  it("bumps final renders to at least optimized sampler and medium resolution", () => {
    assert.equal(resolveEffectiveSamplerPreset("base", "final"), "optimized");
    assert.equal(resolveEffectiveResolutionSizeTier("small", "final"), "medium");
  });

  it("uses max compatible sampler and max resolution for max profile", () => {
    assert.equal(resolveEffectiveSamplerPreset("base", "max"), "maxCompatible");
    assert.equal(resolveEffectiveResolutionSizeTier("small", "max"), "max");
  });

  it("resolves per-tool overrides before global profile", async () => {
    const { resolveQueueQualityProfile } = await import("./queue-quality-profile.ts");
    assert.equal(
      resolveQueueQualityProfile({
        tool: "variations",
        global: "draft",
        toolProfiles: { variations: "max" },
      }),
      "max",
    );
    assert.equal(
      resolveQueueQualityProfile({
        tool: "generate",
        global: "final",
        toolProfiles: { variations: "max" },
      }),
      "final",
    );
  });

  it("flags final and max profiles for upscale enrichment", async () => {
    const {
      profileUsesUpscaleEnrich,
      profileUsesNeuralUpscaleEnrich,
      upscaleScaleForProfile,
      upscaleMethodForProfile,
    } = await import("./queue-quality-profile.ts");
    assert.equal(profileUsesUpscaleEnrich("final"), true);
    assert.equal(profileUsesUpscaleEnrich("draft"), false);
    assert.equal(upscaleScaleForProfile("final"), 1.25);
    assert.equal(upscaleScaleForProfile("max"), 1.5);
    assert.equal(
      upscaleScaleForProfile("final", { model: "qwen-image-2512-lightning-8" }),
      1.18,
    );
    assert.equal(
      upscaleScaleForProfile("max", { model: "qwen-image-2512-lightning-8" }),
      1.28,
    );
    assert.equal(
      upscaleMethodForProfile("max", { model: "qwen-image-2512-lightning-8" }),
      "lanczos",
    );
    assert.equal(
      profileUsesNeuralUpscaleEnrich("max", { model: "qwen-image-2512-lightning-8" }),
      false,
    );
    assert.equal(profileUsesNeuralUpscaleEnrich("max"), true);
  });

  it("enables SDXL refiner and neural polish only on appropriate profiles", async () => {
    const {
      profileUsesSdxlRefinerEnrich,
      profileUsesNeuralUpscalePolish,
      lanczosPolishScaleAfterNeural,
      sdxlRefinerDenoiseForProfile,
    } = await import("./queue-quality-profile.ts");
    assert.equal(profileUsesSdxlRefinerEnrich("final"), true);
    assert.equal(profileUsesSdxlRefinerEnrich("draft"), false);
    assert.equal(profileUsesNeuralUpscalePolish("max"), true);
    assert.equal(profileUsesNeuralUpscalePolish("final"), false);
    assert.equal(lanczosPolishScaleAfterNeural(), 1.05);
    assert.equal(sdxlRefinerDenoiseForProfile("max"), 0.3);
    assert.equal(sdxlRefinerDenoiseForProfile("final"), 0.22);
  });
});
