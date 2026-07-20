import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyAnatomyGuardForModel,
  applyAnatomyGuardToNegative,
  applyAnatomyGuardToPositive,
  normalizeAnatomyGuardMode,
} from "./anatomy-guard.ts";

describe("anatomy guard", () => {
  it("normalizes anatomy guard mode values", () => {
    assert.equal(normalizeAnatomyGuardMode("standard"), "standard");
    assert.equal(normalizeAnatomyGuardMode("strict"), "strict");
    assert.equal(normalizeAnatomyGuardMode(undefined), "standard");
  });

  it("appends anatomy cues to positive prompts", () => {
    const result = applyAnatomyGuardToPositive("A cyclist on a trail.", "standard");
    assert.match(result, /accurate anatomy/i);
    assert.match(result, /A cyclist on a trail\./);
  });

  it("skips duplicate anatomy cues", () => {
    const result = applyAnatomyGuardToPositive(
      "Portrait with accurate anatomy and soft light.",
      "standard",
    );
    assert.equal(result, "Portrait with accurate anatomy and soft light.");
  });

  it("merges anatomy negatives for SD-family models", () => {
    const result = applyAnatomyGuardForModel({
      positive: "Portrait in window light.",
      negative: "blurry",
      model: "sdxl",
      mode: "strict",
    });
    assert.match(result.positive, /anatomically correct hands/i);
    assert.match(result.negative ?? "", /extra limbs/i);
    assert.match(result.negative ?? "", /extra fingers/i);
    assert.match(result.negative ?? "", /blurry/i);
  });

  it("folds anatomy steering into positive for flux models", () => {
    const result = applyAnatomyGuardForModel({
      positive: "Portrait in window light.",
      negative: "ignored",
      model: "flux-dev",
      mode: "standard",
    });
    assert.match(result.positive, /accurate anatomy/i);
    assert.match(result.positive, /Avoid extra limbs/i);
    assert.equal(result.negative, undefined);
  });

  it("adds pose guidance for klein distilled flux models", () => {
    const result = applyAnatomyGuardForModel({
      positive: "A woman standing in sunlight.",
      model: "flux-2-klein-9b-distilled",
      mode: "strict",
    });
    assert.match(result.positive, /Prefer simple standing poses/i);
    assert.match(result.positive, /anatomically correct hands/i);
  });

  it("adds pose guidance for klein base flux models in strict mode", () => {
    const result = applyAnatomyGuardForModel({
      positive: "Portrait in window light.",
      model: "flux-2-klein-9b",
      mode: "strict",
    });
    assert.match(result.positive, /Keep poses straightforward/i);
  });

  it("deduplicates merged negative terms", () => {
    const merged = applyAnatomyGuardToNegative("extra limbs, blurry", "standard");
    assert.equal(
      merged?.split(",").filter((part) => part.trim().toLowerCase() === "extra limbs").length,
      1,
    );
  });
});
