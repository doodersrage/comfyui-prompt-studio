import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { modelsInSameFamily } from "./model-workflow-map.ts";

describe("modelsInSameFamily", () => {
  it("returns Lightning siblings for vanilla 2512", () => {
    const family = modelsInSameFamily("qwen-image-2512");
    assert.ok(family.includes("qwen-image-2512"));
    assert.ok(family.includes("qwen-image-2512-lightning-4"));
    assert.ok(family.includes("qwen-image-2512-lightning-8"));
  });

  it("returns Rapid AIO siblings", () => {
    const family = modelsInSameFamily("qwen-rapid-aio-nsfw");
    assert.equal(family.length, 3);
  });
});
