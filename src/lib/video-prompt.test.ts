import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildVideoPrompt, generateVideoPrompt } from "./video-prompt.ts";

describe("video prompt", () => {
  it("composes a template prompt", () => {
    const prompt = buildVideoPrompt({
      subject: "a fox running",
      motion: "bounding through snow",
      camera: "tracking shot",
      durationSec: 4,
    });
    assert.match(prompt, /4s clip/);
    assert.match(prompt, /fox running/);
    assert.match(prompt, /tracking shot/);
  });

  it("falls back to template when preferTemplate is set", async () => {
    const result = await generateVideoPrompt({
      subject: "drone flyover",
      preferTemplate: true,
    });
    assert.equal(result.method, "template");
    assert.match(result.prompt, /drone flyover/);
  });
});
