import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyRenderRealismForModel,
  applyRenderRealismToNegative,
  applyRenderRealismToPositive,
  normalizeRenderRealismMode,
} from "./render-realism.ts";

describe("render realism", () => {
  it("normalizes realism mode values", () => {
    assert.equal(normalizeRenderRealismMode("realistic"), "realistic");
    assert.equal(normalizeRenderRealismMode("hyper-realistic"), "hyper-realistic");
    assert.equal(normalizeRenderRealismMode("anime"), "anime");
    assert.equal(normalizeRenderRealismMode("animation"), "anime");
    assert.equal(normalizeRenderRealismMode(undefined), "realistic");
  });

  it("appends realistic cues to positive prompts", () => {
    const result = applyRenderRealismToPositive("A woman in a cafe.", "realistic");
    assert.match(result, /photorealistic/i);
    assert.match(result, /A woman in a cafe\./);
  });

  it("skips duplicate realism cues", () => {
    const result = applyRenderRealismToPositive(
      "Photorealistic portrait in soft daylight.",
      "realistic",
    );
    assert.equal(result, "Photorealistic portrait in soft daylight.");
  });

  it("merges realism negatives for SD-family models", () => {
    const result = applyRenderRealismForModel({
      positive: "Portrait in window light.",
      negative: "blurry",
      model: "sdxl",
      mode: "realistic",
    });
    assert.match(result.positive, /photorealistic/i);
    assert.match(result.negative ?? "", /cartoon/i);
    assert.match(result.negative ?? "", /blurry/i);
  });

  it("folds realism steering into positive for flux models", () => {
    const result = applyRenderRealismForModel({
      positive: "Portrait in window light.",
      negative: "ignored",
      model: "flux-dev",
      mode: "hyper-realistic",
    });
    assert.match(result.positive, /hyperrealistic/i);
    assert.match(result.positive, /Avoid cartoon/i);
    assert.equal(result.negative, undefined);
  });

  it("deduplicates merged negative terms", () => {
    const merged = applyRenderRealismToNegative("cartoon, blurry", "realistic");
    assert.equal(
      merged?.split(",").filter((part) => part.trim().toLowerCase() === "cartoon").length,
      1,
    );
  });

  it("appends anime cues and anti-photo negatives", () => {
    const result = applyRenderRealismForModel({
      positive: "A hero on a rooftop at sunset.",
      negative: "blurry",
      model: "sdxl",
      mode: "anime",
    });
    assert.match(result.positive, /cel shading/i);
    assert.match(result.positive, /rooftop at sunset/i);
    assert.match(result.negative ?? "", /photorealistic/i);
    assert.match(result.negative ?? "", /blurry/i);
  });

  it("skips duplicate anime cues", () => {
    const result = applyRenderRealismToPositive(
      "Anime illustration with cel shading and bold colors.",
      "anime",
    );
    assert.equal(result, "Anime illustration with cel shading and bold colors.");
  });
});
