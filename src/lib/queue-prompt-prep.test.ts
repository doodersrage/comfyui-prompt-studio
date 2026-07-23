import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyQueuePromptSteering } from "./queue-prompt-prep.ts";

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

  it("skips realism/anatomy positives on Lightning CFG-1", () => {
    const result = applyQueuePromptSteering({
      positive: "a cyclist on a mountain trail",
      negative: "blurry",
      model: "qwen-image-2512-lightning-8",
      realismMode: "realistic",
      anatomyMode: "standard",
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
});
