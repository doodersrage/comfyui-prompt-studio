import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { galleryRefineDenoiseForProfile } from "./gallery-output-refine.ts";

describe("gallery-output-refine", () => {
  it("uses lower denoise for final than max", () => {
    assert.ok(galleryRefineDenoiseForProfile("final") < galleryRefineDenoiseForProfile("max"));
    assert.equal(galleryRefineDenoiseForProfile(undefined), galleryRefineDenoiseForProfile("final"));
  });
});
