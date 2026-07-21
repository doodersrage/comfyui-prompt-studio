import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_UPSCALE_MODEL_TOKEN,
  formatModelUpscaleMap,
  parseModelUpscaleMap,
  resolveUpscaleModelFilename,
  SUGGESTED_MODEL_UPSCALE_MAP,
} from "./model-upscale-map.ts";

describe("model upscale map", () => {
  it("suggests UltraSharp as the default neural upscaler", () => {
    assert.equal(SUGGESTED_MODEL_UPSCALE_MAP.default, "4x-UltraSharp.pth");
    assert.equal(
      resolveUpscaleModelFilename("qwen-image-2512", {
        upscaleMap: SUGGESTED_MODEL_UPSCALE_MAP,
      }),
      "4x-UltraSharp.pth",
    );
  });

  it("resolves per-model and default entries", () => {
    const map = parseModelUpscaleMap(
      "default=4x-UltraSharp.pth\nflux-dev=RealESRGAN_x4plus.pth",
    );
    assert.equal(
      resolveUpscaleModelFilename("flux-dev", { upscaleMap: map }),
      "RealESRGAN_x4plus.pth",
    );
    assert.equal(
      resolveUpscaleModelFilename("qwen-image-2512", { upscaleMap: map }),
      "4x-UltraSharp.pth",
    );
  });

  it("falls back to custom token value", () => {
    assert.equal(
      resolveUpscaleModelFilename("flux-dev", {
        customTokens: [
          { token: DEFAULT_UPSCALE_MODEL_TOKEN, value: "custom-upscaler.pth" },
        ],
      }),
      "custom-upscaler.pth",
    );
  });

  it("formats map text", () => {
    assert.equal(
      formatModelUpscaleMap({ default: "4x-UltraSharp.pth" }),
      "default=4x-UltraSharp.pth",
    );
  });
});
