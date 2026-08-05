import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyAnatomyGuardForModel,
  applyAnatomyGuardToNegative,
  applyAnatomyGuardToPositive,
  normalizeAnatomyGuardMode,
} from "./anatomy-guard";

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

  it("adds hand-readability guidance for klein distilled in strict mode, not standing poses", () => {
    const result = applyAnatomyGuardForModel({
      positive: "A woman standing in sunlight.",
      model: "flux-2-klein-9b-distilled",
      mode: "strict",
    });
    assert.match(result.positive, /exactly five separate fingers|five separate fingers with clear knuckles/i);
    assert.match(result.positive, /when hands appear in frame|separated and readable/i);
    assert.doesNotMatch(result.positive, /simple standing pose|prefer simple standing/i);
    assert.match(result.positive, /extra or fused fingers|webbed or melted hands|extra limbs/i);
  });

  it("front-loads strict hand cues for klein distilled when people are likely", () => {
    const result = applyAnatomyGuardForModel({
      positive:
        "Street fighter Chun-Li in a blue dress costume, dynamic fighting stance, neon alley.",
      model: "flux-2-klein-9b-distilled",
      mode: "strict",
    });
    const firstSentenceEnd = result.positive.indexOf(".") + 1;
    const lead = result.positive.slice(0, firstSentenceEnd + 80);
    assert.match(lead, /five separate fingers/i);
    assert.ok(result.positive.indexOf("five separate fingers") < result.positive.length / 2);
  });

  it("strict klein distilled differs from standard on hand-heavy prompts", () => {
    const prompt = "Portrait of a martial artist with hands visible.";
    const standard = applyAnatomyGuardForModel({
      positive: prompt,
      model: "flux-2-klein-9b-distilled",
      mode: "standard",
    });
    const strict = applyAnatomyGuardForModel({
      positive: prompt,
      model: "flux-2-klein-9b-distilled",
      mode: "strict",
    });
    assert.notEqual(strict.positive, standard.positive);
    assert.match(strict.positive, /exactly five separate fingers/i);
    assert.doesNotMatch(standard.positive, /exactly five separate fingers/i);
  });

  it("does not force standing pose language on standard klein distilled", () => {
    const result = applyAnatomyGuardForModel({
      positive: "A woman reclining on a sofa.",
      model: "flux-2-klein-9b-distilled",
      mode: "standard",
    });
    assert.match(result.positive, /five fingers|anatomically correct hands|natural limb count/i);
    assert.doesNotMatch(result.positive, /standing|walking poses/i);
    assert.match(result.positive, /reclining/i);
  });

  it("hardens klein distilled even when weak accurate-anatomy language is present", () => {
    const result = applyAnatomyGuardForModel({
      positive: "Portrait with accurate anatomy and soft light.",
      model: "flux-2-klein-9b-distilled",
      mode: "standard",
    });
    assert.match(result.positive, /five fingers|anatomically correct hands/i);
    assert.match(result.positive, /extra or fused fingers|extra limbs/i);
  });

  it("adds hand guidance for klein base flux models in strict mode", () => {
    const result = applyAnatomyGuardForModel({
      positive: "Portrait in window light.",
      model: "flux-2-klein",
      mode: "strict",
      maxPositiveAppendChars: 500,
    });
    assert.match(result.positive, /when hands|five-fingered hands readable|five fingers distinct/i);
    assert.match(result.positive, /five distinct fingers/i);
    assert.doesNotMatch(result.positive, /simple stance|prefer simple standing/i);
  });

  it("hardens klein base hands and counters fisheye without overriding reclining poses", () => {
    const result = applyAnatomyGuardForModel({
      positive:
        "A woman reclines on a beach under a canopy, framed in sweeping fisheye lens.",
      model: "flux-2-klein-9b",
      mode: "standard",
      maxPositiveAppendChars: 500,
    });
    assert.match(result.positive, /five distinct fingers/i);
    assert.match(result.positive, /reclines/i);
    assert.doesNotMatch(result.positive, /straightforward|simple stance|standing pose/i);
    assert.match(result.positive, /rectangular full-frame|avoid circular fisheye/i);
    assert.match(result.negative ?? "", /extra limbs|extra fingers/i);
  });

  it("hardens ultrareal hands without stance overrides", () => {
    const result = applyAnatomyGuardForModel({
      positive: "A woman in a leather dress stands on a city sidewalk.",
      model: "flux-ultrareal-v4",
      mode: "strict",
      maxPositiveAppendChars: 700,
    });
    assert.match(result.positive, /five distinct fingers/i);
    assert.match(result.positive, /when hands|clasped-hand|five-fingered hands readable/i);
    assert.doesNotMatch(result.positive, /simple stance|prefer simple standing/i);
    assert.match(result.positive, /Avoid extra limbs/i);
  });

  it("deduplicates merged negative terms", () => {
    const merged = applyAnatomyGuardToNegative("extra limbs, blurry", "standard");
    assert.equal(
      merged?.split(",").filter((part) => part.trim().toLowerCase() === "extra limbs").length,
      1,
    );
  });
});
