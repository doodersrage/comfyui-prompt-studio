import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildWorkflowScaffoldForModel, suggestedScaffoldName } from "./workflow-scaffold.ts";
import { assignWorkflowToInferredModels } from "./model-workflow-map.ts";
import { pickVideoCheckpointFromInventory } from "./ensure-video-workflow.ts";

describe("WAN video workflow scaffold", () => {
  it("builds a T2V/I2V-ready graph with video tokens", () => {
    const result = buildWorkflowScaffoldForModel("wan-video");
    assert.equal(result.category, "video");
    assert.match(result.json, /EmptyHunyuanLatentVideo/);
    assert.match(result.json, /SaveAnimatedWEBP/);
    assert.match(result.json, /\{\{VIDEO_FRAMES\}\}/);
    assert.match(result.json, /\{\{VIDEO_FPS\}\}/);
    assert.match(result.json, /\{\{INIT_IMAGE\}\}/);
    assert.match(suggestedScaffoldName("wan-video", "template"), /scaffold/i);
  });

  it("builds an LTX scaffold with EmptyLTXVLatentVideo", () => {
    const result = buildWorkflowScaffoldForModel("ltx-video");
    assert.equal(result.category, "video");
    assert.match(result.json, /EmptyLTXVLatentVideo/);
  });

  it("can assign the scaffold id to wan-video and hunyuan-video without wiping other keys", () => {
    const map = assignWorkflowToInferredModels(
      "wf-wan",
      ["wan-video", "hunyuan-video"],
      { "flux-dev": "wf-flux" },
    );
    assert.equal(map["wan-video"], "wf-wan");
    assert.equal(map["hunyuan-video"], "wf-wan");
    assert.equal(map["flux-dev"], "wf-flux");
  });

  it("picks WAN weights from inventory before unrelated checkpoints", () => {
    assert.equal(
      pickVideoCheckpointFromInventory("wan-video", [
        "sd_xl_base_1.0.safetensors",
        "wan2.1_t2v_1.3B_fp8_scaled.safetensors",
        "flux1-dev.safetensors",
      ]),
      "wan2.1_t2v_1.3B_fp8_scaled.safetensors",
    );
  });

  it("prefers WAN 2.2 / 14B over older 2.1 / 1.3B when both are installed", () => {
    assert.equal(
      pickVideoCheckpointFromInventory("wan-video", [
        "wan2.1_t2v_1.3B_fp8_scaled.safetensors",
        "wan2.2_t2v_high_noise_14B_fp16.safetensors",
        "sd_xl_base_1.0.safetensors",
      ]),
      "wan2.2_t2v_high_noise_14B_fp16.safetensors",
    );
  });

  it("does not invent a WAN filename when inventory has only image checkpoints", () => {
    assert.equal(
      pickVideoCheckpointFromInventory("wan-video", [
        "DreamShaper_8_pruned.safetensors",
        "Qwen-Rapid-AIO-NSFW-v23.safetensors",
      ]),
      undefined,
    );
  });
});
