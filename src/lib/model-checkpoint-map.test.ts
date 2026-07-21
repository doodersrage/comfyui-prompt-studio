import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatModelCheckpointMap,
  parseModelCheckpointMap,
  resolveLoaderFilenamesForModel,
  resolveRefinerFilenameForModel,
  SUGGESTED_MODEL_CHECKPOINT_MAP,
  SUGGESTED_MODEL_REFINER_MAP,
  SUGGESTED_MODEL_VAE_MAP,
  mergeSuggestedLoaderMaps,
  formatSuggestedLoaderMergeMessage,
} from "./model-checkpoint-map.ts";

describe("model checkpoint map", () => {
  it("parses and formats checkpoint map lines", () => {
    const map = parseModelCheckpointMap(
      "# comment\nqwen-image-2512=qwen_image_2512.safetensors\nflux-2-klein-9b:klein-9b.safetensors",
    );
    assert.equal(map["qwen-image-2512"], "qwen_image_2512.safetensors");
    assert.equal(map["flux-2-klein-9b"], "klein-9b.safetensors");
    assert.match(formatModelCheckpointMap(map), /qwen-image-2512=qwen_image_2512/);
  });

  it("resolves loader filenames from map, custom token, and registry hints", () => {
    const fromMap = resolveLoaderFilenamesForModel("flux-2-klein-9b", {
      checkpointMap: { "flux-2-klein-9b": "my-klein.safetensors" },
    });
    assert.equal(fromMap.checkpoint, "my-klein.safetensors");

    const fromToken = resolveLoaderFilenamesForModel("flux-dev", {
      customTokens: [{ token: "{{CHECKPOINT}}", value: "flux1-dev.safetensors" }],
    });
    assert.equal(fromToken.checkpoint, "flux1-dev.safetensors");

    const qwen = resolveLoaderFilenamesForModel("qwen-image-2512", {
      checkpointMap: { "qwen-image-2512": "custom-qwen.safetensors" },
    });
    assert.equal(qwen.unet, "custom-qwen.safetensors");
    assert.equal(qwen.vae, "qwen_image_vae.safetensors");
    assert.equal(qwen.dualClip, "qwen_2.5_vl_7b.safetensors");
  });

  it("infers FLUX Klein UNET/VAE defaults when registry hints are sparse", () => {
    const klein9b = resolveLoaderFilenamesForModel("flux-2-klein-9b");
    assert.equal(klein9b.unet, "flux-2-klein-9b.safetensors");
    assert.equal(klein9b.vae, "flux2-vae.safetensors");

    const kleinDistilled = resolveLoaderFilenamesForModel("flux-2-klein-9b-distilled");
    assert.equal(kleinDistilled.unet, "flux-2-klein-9b-fp8.safetensors");
    assert.equal(kleinDistilled.vae, "flux2-vae.safetensors");
  });

  it("infers Qwen 2512 lightning UNET/VAE defaults (bf16 when tier unknown)", () => {
    const lightning = resolveLoaderFilenamesForModel("qwen-image-2512-lightning-8");
    assert.equal(lightning.unet, "qwen_image_2512_bf16.safetensors");
    assert.equal(lightning.vae, "qwen_image_vae.safetensors");
  });

  it("keeps fp8 UNET when workflow already uses fp8 loaders", () => {
    const fp8 = resolveLoaderFilenamesForModel("qwen-image-2512-lightning-8", {
      precisionTier: "fp8",
    });
    assert.equal(fp8.unet, "qwen_image_2512_fp8_e4m3fn.safetensors");
  });

  it("applies per-model VAE map overrides", () => {
    const mapped = resolveLoaderFilenamesForModel("flux-2-klein-9b", {
      vaeMap: { "flux-2-klein-9b": "FLUX.2-klein-9B.safetensors" },
    });
    assert.equal(mapped.vae, "FLUX.2-klein-9B.safetensors");
  });

  it("includes suggested checkpoint map entries for common models", () => {
    assert.equal(
      SUGGESTED_MODEL_CHECKPOINT_MAP["qwen-image-2512-lightning-8"],
      "qwen_image_2512_bf16.safetensors",
    );
    assert.equal(SUGGESTED_MODEL_REFINER_MAP.default, "sd_xl_refiner_1.0.safetensors");
    assert.equal(SUGGESTED_MODEL_VAE_MAP["qwen-image-2512"], "qwen_image_vae.safetensors");
  });

  it("merges suggested loader maps without clobbering user overrides", () => {
    const merged = mergeSuggestedLoaderMaps({
      checkpointMap: { "qwen-image-2512": "my-custom-unet.safetensors" },
      vaeMap: { "flux-2-klein-9b": "FLUX.2-klein-9B.safetensors" },
    });
    assert.equal(merged.modelCheckpointMap["qwen-image-2512"], "my-custom-unet.safetensors");
    assert.equal(
      merged.modelCheckpointMap["flux-2-klein-9b"],
      "flux-2-klein-9b.safetensors",
    );
    assert.equal(merged.modelVaeMap["flux-2-klein-9b"], "FLUX.2-klein-9B.safetensors");
    assert.equal(merged.modelVaeMap["qwen-image-2512"], "qwen_image_vae.safetensors");
  });

  it("reports when suggested loader merge adds new keys", () => {
    const merged = mergeSuggestedLoaderMaps({
      checkpointMap: { "qwen-image-2512": "custom.safetensors" },
    });
    assert.equal(merged.addedCheckpointKeys.includes("qwen-image-2512"), false);
    assert.ok(merged.addedCheckpointKeys.includes("flux-dev"));
    assert.match(
      formatSuggestedLoaderMergeMessage(
        mergeSuggestedLoaderMaps({
          checkpointMap: SUGGESTED_MODEL_CHECKPOINT_MAP,
          vaeMap: SUGGESTED_MODEL_VAE_MAP,
          refinerMap: SUGGESTED_MODEL_REFINER_MAP,
        }),
      ),
      /already include all suggested entries/i,
    );
  });

  it("resolves SDXL refiner checkpoint defaults", () => {
    assert.equal(
      resolveRefinerFilenameForModel("sdxl"),
      "sd_xl_refiner_1.0.safetensors",
    );
    assert.equal(resolveRefinerFilenameForModel("flux-dev"), undefined);
  });
});
