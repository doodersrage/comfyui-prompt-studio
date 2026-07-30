import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveDiffusersOutputPost } from "./diffusers-output-post";

describe("resolveDiffusersOutputPost", () => {
  it("skips Draft and followSettings", () => {
    assert.equal(
      resolveDiffusersOutputPost({
        qualityProfile: "draft",
        studioModel: "qwen-image-2512-lightning-8",
      }),
      null,
    );
    assert.equal(
      resolveDiffusersOutputPost({
        qualityProfile: "followSettings",
        studioModel: "qwen-image-2512-lightning-8",
      }),
      null,
    );
  });

  it("uses soft Lightning scales with anti-moiré blur", () => {
    assert.deepEqual(
      resolveDiffusersOutputPost({
        qualityProfile: "final",
        studioModel: "qwen-image-2512-lightning-8",
      }),
      {
        scale: 1.08,
        method: "bicubic",
        moireBlurSigma: 0.4,
        moireDownscale: 1,
      },
    );
    assert.deepEqual(
      resolveDiffusersOutputPost({
        qualityProfile: "max",
        studioModel: "qwen-image-2512-lightning-8",
      }),
      {
        scale: 1.12,
        method: "bicubic",
        moireBlurSigma: 0.5,
        moireDownscale: 0.92,
      },
    );
  });

  it("keeps vanilla 2512 chroma-guard at 1.25× with light blur", () => {
    assert.deepEqual(
      resolveDiffusersOutputPost({
        qualityProfile: "final",
        studioModel: "qwen-image-2512",
      }),
      {
        scale: 1.25,
        method: "lanczos",
        moireBlurSigma: 0.3,
        moireDownscale: 1,
      },
    );
    assert.deepEqual(
      resolveDiffusersOutputPost({
        qualityProfile: "max",
        studioModel: "qwen-image-2512",
      }),
      {
        scale: 1.25,
        method: "lanczos",
        moireBlurSigma: 0.4,
        moireDownscale: 1,
      },
    );
  });

  it("skips Edit-2511 Lightning T2I and Compose I2I output polish", () => {
    assert.equal(
      resolveDiffusersOutputPost({
        qualityProfile: "final",
        studioModel: "qwen-image-edit-2511-lightning-8",
        hasInputImage: false,
      }),
      null,
    );
    assert.equal(
      resolveDiffusersOutputPost({
        qualityProfile: "max",
        studioModel: "qwen-image-edit-2511-lightning-8",
        hasInputImage: true,
      }),
      null,
    );
  });

  it("skips Rapid AIO output upscale", () => {
    assert.equal(
      resolveDiffusersOutputPost({
        qualityProfile: "max",
        studioModel: "qwen-rapid-aio-sfw",
      }),
      null,
    );
  });
});
