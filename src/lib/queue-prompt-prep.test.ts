import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyQueuePromptSteering } from "./queue-prompt-prep";

describe("queue-prompt-prep Rapid AIO / Lightning", () => {
  it("keeps short negatives and anti-moiré cues for Rapid AIO without long positives", () => {
    const result = applyQueuePromptSteering({
      positive: "a portrait in soft light",
      negative: "blurry",
      model: "qwen-rapid-aio-nsfw",
      realismMode: "realistic",
      anatomyMode: "standard",
    });
    assert.match(result.positive ?? "", /clean continuous tones/i);
    // Realism/anatomy suffixes must not append on CFG-1.
    assert.equal(/photorealistic|anatomically/i.test(result.positive ?? ""), false);
    assert.match(result.negative ?? "", /blurry/);
    assert.match(result.negative ?? "", /moire|moiré/i);
    assert.match(result.negative ?? "", /grid artifacts|banding/i);
    assert.match(result.positive ?? "", /even gradients/i);
  });

  it("drops long auto-negatives for Rapid AIO", () => {
    const longNegative = "a".repeat(200);
    const result = applyQueuePromptSteering({
      positive: "scene",
      negative: longNegative,
      model: "qwen-rapid-aio-sfw",
      realismMode: "off",
      anatomyMode: "off",
    });
    assert.equal((result.negative ?? "").includes(longNegative), false);
    assert.match(result.negative ?? "", /moire|moiré/i);
  });

  it("applies a short photo pack on Lightning CFG-1 without long realism suffixes", () => {
    const result = applyQueuePromptSteering({
      positive: "a cyclist on a mountain trail",
      negative: "blurry",
      model: "qwen-image-2512-lightning-8",
      realismMode: "realistic",
      anatomyMode: "standard",
    });
    assert.match(result.positive ?? "", /a cyclist on a mountain trail/);
    assert.match(result.positive ?? "", /natural photograph|realistic skin texture/i);
    assert.equal(/anatomically|cinematic depth of field/i.test(result.positive ?? ""), false);
    assert.match(result.negative ?? "", /blurry/);
    assert.match(result.negative ?? "", /illustration|drawing|painterly/i);
  });

  it("skips the Lightning photo pack when realism mode is off", () => {
    const result = applyQueuePromptSteering({
      positive: "a cyclist on a mountain trail",
      negative: "blurry",
      model: "qwen-image-2512-lightning-8",
      realismMode: "off",
      anatomyMode: "off",
    });
    assert.equal(result.positive, "a cyclist on a mountain trail");
    assert.equal(result.negative, "blurry");
  });

  it("applies short temporal/limb cues for WAN Lightning CFG-1", () => {
    const result = applyQueuePromptSteering({
      positive: "a fox runs through snow",
      negative: "blurry",
      model: "wan-video-lightning-4",
      realismMode: "realistic",
      anatomyMode: "strict",
    });
    assert.match(result.positive ?? "", /temporal continuity|stable identity/i);
    assert.equal(/photorealistic|anatomically correct hands/i.test(result.positive ?? ""), false);
    assert.match(result.negative ?? "", /blurry/);
    assert.match(result.negative ?? "", /flicker|extra limbs|floating props/i);
    assert.ok((result.negative ?? "").length < 220);
  });

  it("drops long auto-negatives for WAN Lightning and keeps the short pack", () => {
    const longNegative = "a".repeat(200);
    const result = applyQueuePromptSteering({
      positive: "scene",
      negative: longNegative,
      model: "wan-video-lightning-4",
      realismMode: "off",
      anatomyMode: "off",
    });
    assert.equal((result.negative ?? "").includes(longNegative), false);
    assert.match(result.negative ?? "", /flicker|extra limbs/i);
  });

  it("applies short temporal/limb cues for WAN Rapid AIO CFG-1", () => {
    const result = applyQueuePromptSteering({
      positive: "a fox runs through snow",
      negative: "blurry",
      model: "wan-video-rapid-aio",
      realismMode: "realistic",
      anatomyMode: "strict",
    });
    assert.match(result.positive ?? "", /temporal continuity|stable identity/i);
    assert.equal(/photorealistic|anatomically correct hands/i.test(result.positive ?? ""), false);
    assert.match(result.negative ?? "", /flicker|extra limbs/i);
  });

  it("applies klein base photo steering with plastic-skin negatives at queue time", () => {
    const result = applyQueuePromptSteering({
      positive: "Women lounge by a resort pool in pink light.",
      model: "flux-2-klein-9b",
      realismMode: "hyper-realistic",
      anatomyMode: "standard",
    });
    assert.match(result.positive ?? "", /unretouched RAW photograph|DSLR capture/i);
    assert.match(result.positive ?? "", /srx_detail/i);
    assert.match(result.negative ?? "", /plastic skin|blob clouds|repeating foam/i);
  });

  it("prioritizes anatomy/hand cues for Klein Distilled before realism budget", () => {
    const result = applyQueuePromptSteering({
      positive: "A woman standing in sunlight.",
      model: "flux-2-klein-9b-distilled",
      realismMode: "realistic",
      anatomyMode: "strict",
    });
    assert.match(result.positive ?? "", /no extra legs, arms or hands/i);
    assert.match(result.positive ?? "", /no less than two legs, arms, and hands per person/i);
    assert.match(result.positive ?? "", /five separate fingers/i);
    // Anatomy cue should appear before optional realism padding.
    const anatomyAt = (result.positive ?? "").search(/no extra legs, arms or hands/i);
    const realismAt = (result.positive ?? "").search(/photorealistic|natural lighting/i);
    assert.ok(anatomyAt >= 0);
    if (realismAt >= 0) {
      assert.ok(anatomyAt < realismAt);
    }
  });

  it("prioritizes anatomy/hand cues for UltraReal before realism budget", () => {
    const result = applyQueuePromptSteering({
      positive: "A woman in a leather dress stands on a city sidewalk.",
      model: "flux-ultrareal-v4",
      realismMode: "realistic",
      anatomyMode: "strict",
    });
    assert.match(result.positive ?? "", /five distinct fingers/i);
    assert.match(result.positive ?? "", /visible knuckles|clear wrists and elbows/i);
    assert.match(result.positive ?? "", /d1g1cam/i);
  });

  it("applies CFG-1 photo + anatomy steering for Boogu Image Turbo", () => {
    const result = applyQueuePromptSteering({
      positive: "A woman on wet rocks by the ocean",
      negative: "blurry",
      model: "boogu-image-turbo",
      realismMode: "realistic",
      anatomyMode: "standard",
    });
    assert.match(result.positive ?? "", /natural photograph|realistic skin texture/i);
    assert.match(result.positive ?? "", /single subject|five distinct fingers/i);
    assert.equal(/photorealistic, cinematic depth of field/i.test(result.positive ?? ""), false);
    assert.equal(result.negative, undefined);
  });

  it("drops long auto-negatives for Boogu Image Turbo", async () => {
    const { prepareQueuePrompts } = await import("./queue-prompt-prep");
    const longNegative = "a".repeat(200);
    const result = await prepareQueuePrompts({
      model: "boogu-image-turbo",
      positive: "portrait on a beach",
      explicitNegative: longNegative,
      realismMode: "off",
      anatomyMode: "off",
    });
    assert.equal(result.negative, undefined);
  });

  it("drops negatives for Boogu Edit Turbo", async () => {
    const { prepareQueuePrompts } = await import("./queue-prompt-prep");
    const result = await prepareQueuePrompts({
      model: "boogu-image-edit-turbo",
      positive: "warm sunset tones",
      explicitNegative: "blurry, bad anatomy",
      realismMode: "realistic",
      anatomyMode: "standard",
    });
    assert.equal(result.negative, undefined);
    assert.match(result.positive ?? "", /natural photograph/i);
  });
});
