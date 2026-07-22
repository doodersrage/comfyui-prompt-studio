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

  it("uses full max sampler and max resolution for max profile", () => {
    assert.equal(resolveEffectiveSamplerPreset("base", "max"), "max");
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

  it("promotes Rapid AIO Draft to Final so moiré polish runs", async () => {
    const {
      resolveQueueQualityProfile,
      formatQueuePipelineStatusNotes,
    } = await import("./queue-quality-profile.ts");
    assert.equal(
      resolveQueueQualityProfile({
        global: "draft",
        model: "qwen-rapid-aio-nsfw",
      }),
      "final",
    );
    assert.equal(
      resolveQueueQualityProfile({
        override: "draft",
        model: "qwen-rapid-aio-nsfw",
      }),
      "draft",
    );
    const notes = formatQueuePipelineStatusNotes({
      model: "qwen-rapid-aio-nsfw",
      qualityProfile: "final",
    });
    assert.ok(notes.some((note) => /moiré polish on/i.test(note)));
    assert.ok(notes.some((note) => /upscale skipped/i.test(note)));
  });

  it("promotes vanilla 2512 Draft to Final for fuller Base sampling", async () => {
    const { resolveQueueQualityProfile } = await import("./queue-quality-profile.ts");
    assert.equal(
      resolveQueueQualityProfile({
        global: "draft",
        model: "qwen-image-2512",
      }),
      "final",
    );
    assert.equal(
      resolveQueueQualityProfile({
        global: "draft",
        model: "qwen-image-2512-lightning-8",
      }),
      "draft",
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
    assert.equal(
      profileUsesNeuralUpscaleEnrich("final", { model: "qwen-image-2512" }),
      false,
    );
    assert.equal(
      profileUsesNeuralUpscaleEnrich("max", { model: "qwen-image-2512" }),
      false,
    );
    assert.equal(profileUsesNeuralUpscaleEnrich("max"), true);
    const { formatQueueQualityProfileHint } = await import(
      "./queue-quality-profile.ts"
    );
    const finalHint = formatQueueQualityProfileHint("final", "base", "medium", {
      neuralUpscaleAvailable: true,
      model: "qwen-image-2512",
    });
    assert.match(String(finalHint), /chroma guard|Lanczos/i);
    assert.doesNotMatch(String(finalHint), /UpscaleModel/);
    const maxHint = formatQueueQualityProfileHint("max", "base", "medium", {
      neuralUpscaleAvailable: true,
      model: "qwen-image-2512",
    });
    assert.match(String(maxHint), /chroma guard|Lanczos/i);
    assert.doesNotMatch(String(maxHint), /UpscaleModel/);
    const { neuralTargetScaleAfterUpscale, parseNeuralUpscaleFactor } =
      await import("./queue-quality-profile.ts");
    assert.equal(neuralTargetScaleAfterUpscale("final"), 0.3125);
    assert.equal(neuralTargetScaleAfterUpscale("max"), 0.375);
    assert.equal(
      neuralTargetScaleAfterUpscale("max", { polishScale: 1.05 }),
      0.3571,
    );
    assert.equal(
      neuralTargetScaleAfterUpscale("final", {
        neuralFactor: 2,
      }),
      0.625,
    );
    assert.equal(
      neuralTargetScaleAfterUpscale("max", {
        polishScale: 1.05,
        priorLatentScale: 1.2,
      }),
      0.2976,
    );
    const { outputUpscaleScaleAfterLatent } = await import(
      "./queue-quality-profile.ts"
    );
    assert.equal(
      outputUpscaleScaleAfterLatent("max", { priorLatentScale: 1.5 }),
      1,
    );
    assert.equal(
      outputUpscaleScaleAfterLatent("max", { priorLatentScale: 1.2 }),
      1.25,
    );
    assert.equal(parseNeuralUpscaleFactor("4x-UltraSharp.pth"), 4);
    assert.equal(parseNeuralUpscaleFactor("RealESRGAN_x2plus.pth"), 2);
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

  it("gates latent detail pass and neural-only sharpen by model", async () => {
    const {
      profileUsesLatentDetailPass,
      profileUsesSharpenAfterNeuralUpscale,
      sharpenAlphaForProfile,
      latentDetailDenoiseForProfile,
    } = await import("./queue-quality-profile.ts");
    assert.equal(
      profileUsesLatentDetailPass("final", { model: "qwen-image-2512" }),
      false,
    );
    assert.equal(
      profileUsesLatentDetailPass("final", { model: "flux-dev" }),
      true,
    );
    assert.equal(
      profileUsesLatentDetailPass("final", {
        model: "qwen-image-2512-lightning-8",
      }),
      false,
    );
    assert.equal(
      profileUsesSharpenAfterNeuralUpscale("max", { afterNeural: true }),
      true,
    );
    assert.equal(
      profileUsesSharpenAfterNeuralUpscale("max", { afterNeural: false }),
      false,
    );
    assert.equal(
      sharpenAlphaForProfile("max", { model: "qwen-image-2512" }),
      0.06,
    );
    assert.equal(latentDetailDenoiseForProfile("final"), 0.2);
    assert.equal(
      latentDetailDenoiseForProfile("final", { model: "qwen-image-2512" }),
      0.14,
    );
    assert.equal(
      latentDetailDenoiseForProfile("max", { model: "qwen-image-2512" }),
      0.2,
    );
  });
});
