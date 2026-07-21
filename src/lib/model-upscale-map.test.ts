import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_UPSCALE_MODEL_TOKEN,
  formatModelUpscaleMap,
  isUpscaleModelInstalled,
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

  it("treats missing inventory entries as not installed", () => {
    assert.equal(
      isUpscaleModelInstalled("4x-UltraSharp.pth", ["RealESRGAN_x4plus.pth"]),
      false,
    );
    assert.equal(
      isUpscaleModelInstalled("4x-UltraSharp.pth", ["4x-UltraSharp.pth"]),
      true,
    );
    assert.equal(isUpscaleModelInstalled("4x-UltraSharp.pth", []), true);
  });

  it("picks an installed upscaler from inventory when mapped file is missing", () => {
    assert.equal(
      resolveUpscaleModelFilename("sdxl", {
        upscaleMap: { default: "4x-UltraSharp.pth" },
        availableUpscaleModels: ["RealESRGAN_x4plus.pth", "other.pth"],
      }),
      "RealESRGAN_x4plus.pth",
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
