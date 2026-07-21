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
});
