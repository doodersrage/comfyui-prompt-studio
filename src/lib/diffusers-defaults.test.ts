import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DIFFUSERS_DEFAULT_MODEL,
  resolveDiffusersModelHint,
  workshopCropToApi,
} from "./diffusers-defaults";

describe("diffusers-defaults", () => {
  it("maps Flux/Qwen aliases to RealVis", () => {
    assert.equal(resolveDiffusersModelHint("flux-dev"), DIFFUSERS_DEFAULT_MODEL);
    assert.equal(
      resolveDiffusersModelHint("qwen-image-2512"),
      DIFFUSERS_DEFAULT_MODEL,
    );
    assert.equal(resolveDiffusersModelHint(""), DIFFUSERS_DEFAULT_MODEL);
    assert.equal(resolveDiffusersModelHint(null), DIFFUSERS_DEFAULT_MODEL);
  });

  it("keeps explicit SDXL checkpoint names", () => {
    assert.equal(
      resolveDiffusersModelHint("sd_xl_base_1.0.safetensors"),
      "sd_xl_base_1.0.safetensors",
    );
    assert.equal(
      resolveDiffusersModelHint("DreamShaper_8_pruned.safetensors"),
      "DreamShaper_8_pruned.safetensors",
    );
  });

  it("rewrites Qwen checkpoint filenames to RealVis", () => {
    assert.equal(
      resolveDiffusersModelHint("Qwen-Rapid-AIO-SFW-v23.safetensors"),
      DIFFUSERS_DEFAULT_MODEL,
    );
  });

  it("maps workshop crop settings to API values", () => {
    assert.equal(workshopCropToApi("auto"), null);
    assert.equal(workshopCropToApi(undefined), null);
    assert.equal(workshopCropToApi("always"), true);
    assert.equal(workshopCropToApi("never"), false);
  });
});
