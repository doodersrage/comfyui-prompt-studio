import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  detectLoaderPrecisionTier,
  qwenDualClipFilename,
  resolveLoaderPrecisionTier,
} from "./model-loader-precision.ts";
import { resolveLoaderFilenamesForModel } from "./model-checkpoint-map.ts";
import { resolveQueueInjectionContext } from "./comfyui-config.ts";

describe("model loader precision", () => {
  it("detects bf16 tier from DualCLIPLoader filenames", () => {
    const workflow = {
      "10": {
        class_type: "DualCLIPLoader",
        inputs: {
          clip_name1: "qwen_2.5_vl_7b_bf16.safetensors",
          clip_name2: "qwen_2.5_vl_7b_bf16.safetensors",
        },
      },
      "228": {
        class_type: "UNETLoader",
        inputs: { unet_name: "{{UNET}}" },
      },
    };

    assert.equal(detectLoaderPrecisionTier(workflow), "bf16");
  });

  it("detects fp8 tier from UNET filename", () => {
    const workflow = {
      "228": {
        class_type: "UNETLoader",
        inputs: { unet_name: "qwen_image_2512_fp8_e4m3fn.safetensors" },
      },
    };

    assert.equal(detectLoaderPrecisionTier(workflow), "fp8");
  });

  it("prefers bf16 when mixed tiers appear in one workflow", () => {
    const workflow = {
      "10": {
        class_type: "DualCLIPLoader",
        inputs: { clip_name1: "qwen_2.5_vl_7b_bf16.safetensors" },
      },
      "228": {
        class_type: "UNETLoader",
        inputs: { unet_name: "qwen_image_2512_fp8_e4m3fn.safetensors" },
      },
    };

    assert.equal(detectLoaderPrecisionTier(workflow), "bf16");
  });

  it("resolves bf16 and fp8 Qwen dual CLIP filenames", () => {
    assert.equal(qwenDualClipFilename("bf16"), "qwen_2.5_vl_7b_bf16.safetensors");
    assert.equal(qwenDualClipFilename("fp8"), "qwen_2.5_vl_7b_fp8_scaled.safetensors");
  });

  it("resolves queue loaders to match workflow precision tier", () => {
    const workflow = {
      "10": {
        class_type: "DualCLIPLoader",
        inputs: { clip_name1: "qwen_2.5_vl_7b_bf16.safetensors" },
      },
      "228": {
        class_type: "UNETLoader",
        inputs: { unet_name: "{{UNET}}" },
      },
    };

    const tier = resolveLoaderPrecisionTier({ workflow });
    assert.equal(tier, "bf16");

    const { loaders } = resolveQueueInjectionContext({
      model: "qwen-image-2512-lightning-8",
      workflow,
    });
    assert.equal(loaders.unet, "qwen_image_2512_bf16.safetensors");

    const fp8Loaders = resolveLoaderFilenamesForModel("qwen-image-2512-lightning-8", {
      precisionTier: "fp8",
    });
    assert.equal(fp8Loaders.unet, "qwen_image_2512_fp8_e4m3fn.safetensors");
  });
});
