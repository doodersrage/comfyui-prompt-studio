import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyQueuePromptSteering } from "./queue-prompt-prep.ts";

describe("queue-prompt-prep Rapid AIO", () => {
  it("keeps short negatives and appends anti-moiré cues", () => {
    const result = applyQueuePromptSteering({
      positive: "a portrait in soft light",
      negative: "blurry",
      model: "qwen-rapid-aio-nsfw",
      realismMode: "off",
      anatomyMode: "off",
    });
    assert.match(result.positive ?? "", /clean continuous tones/i);
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
});
