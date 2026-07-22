import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatInventorySyncMessage,
  matchInventoryFilename,
  syncLoaderMapsFromInventory,
} from "./loader-map-inventory-sync.ts";

describe("matchInventoryFilename", () => {
  it("prefers exact then stem matches", () => {
    assert.equal(
      matchInventoryFilename("flux1-dev.safetensors", [
        "other.safetensors",
        "flux1-dev.safetensors",
      ]),
      "flux1-dev.safetensors",
    );
    assert.equal(
      matchInventoryFilename("flux1-dev.safetensors", ["models/flux1-dev-fp8.safetensors"]),
      "models/flux1-dev-fp8.safetensors",
    );
  });
});

describe("syncLoaderMapsFromInventory", () => {
  it("fills empty keys only and never overwrites user values", () => {
    const result = syncLoaderMapsFromInventory({
      models: {
        checkpoints: ["sd_xl_base_1.0.safetensors"],
        unets: ["flux1-dev.safetensors"],
        vaes: ["ae.safetensors", "flux2-vae.safetensors"],
        upscaleModels: ["4x-UltraSharp.pth"],
        clips: [],
        dualClipTypes: [],
        clipLoaderTypes: [],
        loras: [],
        controlNets: ["control_v11p_sd15_canny.pth"],
      },
      checkpointMap: { "flux-dev": "keep-me.safetensors" },
      vaeMap: {},
      upscaleMap: {},
      controlNetMap: {},
    });

    assert.equal(result.modelCheckpointMap["flux-dev"], "keep-me.safetensors");
    assert.ok(!result.filledCheckpointKeys.includes("flux-dev"));
    assert.equal(result.modelCheckpointMap.sdxl, "sd_xl_base_1.0.safetensors");
    assert.ok(result.filledCheckpointKeys.includes("sdxl"));
    assert.equal(result.modelVaeMap["flux-dev"], "ae.safetensors");
    assert.equal(result.modelUpscaleMap.default, "4x-UltraSharp.pth");
    assert.equal(
      result.modelControlNetMap.default,
      "control_v11p_sd15_canny.pth",
    );
    assert.match(formatInventorySyncMessage(result), /Filled \d+ empty map key/);
  });

  it("reports zero fills when nothing matches", () => {
    const result = syncLoaderMapsFromInventory({
      models: {
        checkpoints: [],
        unets: [],
        vaes: [],
        upscaleModels: [],
        clips: [],
        dualClipTypes: [],
        clipLoaderTypes: [],
        loras: [],
        controlNets: [],
      },
      checkpointMap: { sdxl: "already.safetensors" },
    });
    assert.equal(result.filledCheckpointKeys.length, 0);
    assert.equal(
      formatInventorySyncMessage(result),
      "No empty map keys matched ComfyUI inventory.",
    );
  });
});
