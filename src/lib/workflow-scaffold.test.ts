import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildWorkflowScaffoldForModel,
  cloneWorkflowWithBindings,
  scaffoldWorkflowForModel,
} from "./workflow-scaffold.ts";

describe("workflow scaffold", () => {
  it("builds a flux scaffold with placeholders", () => {
    const result = buildWorkflowScaffoldForModel("flux-2-klein-9b");
    assert.equal(result.category, "flux");
    assert.match(result.json, /ModelSamplingFlux/);
    assert.match(result.json, /\{\{FLUX_MAX_SHIFT\}\}/);
    assert.match(result.json, /\{\{POSITIVE\}\}/);
    assert.match(result.json, /\{\{WIDTH\}\}/);
  });

  it("builds flux inpaint scaffold with ModelSamplingFlux", () => {
    const result = buildWorkflowScaffoldForModel("flux-inpaint");
    assert.match(result.json, /ModelSamplingFlux/);
    assert.doesNotMatch(result.json, /ModelSamplingAuraFlow/);
    assert.match(result.json, /LoadImageMask/);
    assert.match(result.json, /InpaintModelConditioning/);
    assert.match(result.json, /\{\{MASK_IMAGE\}\}/);
    assert.match(result.json, /\{\{INPUT_IMAGE\}\}/);
  });

  it("builds a qwen scaffold with UNET loader", () => {
    const result = buildWorkflowScaffoldForModel("qwen-image-2512");
    assert.equal(result.category, "qwen");
    assert.match(result.json, /UNETLoader/);
    assert.match(result.json, /CLIPLoader/);
    assert.match(result.json, /EmptySD3LatentImage/);
    assert.match(result.json, /"type": "qwen_image"/);
    assert.match(result.json, /qwen_2\.5_vl_7b\.safetensors/);
    assert.match(result.json, /\{\{UNET\}\}/);
  });

  it("builds lightning scaffold with EmptySD3LatentImage", () => {
    const result = buildWorkflowScaffoldForModel("qwen-image-2512-lightning-8");
    assert.match(result.json, /EmptySD3LatentImage/);
    assert.match(result.json, /LoraLoader/);
    assert.doesNotMatch(result.json, /EmptyLatentImage/);
  });

  it("builds a wired qwen edit img2img scaffold", () => {
    const result = buildWorkflowScaffoldForModel("qwen-image-edit-2511");
    assert.match(result.json, /TextEncodeQwenImageEditPlus/);
    assert.match(result.json, /VAEEncode/);
    assert.match(result.json, /LoadImage/);
    assert.doesNotMatch(result.json, /EmptyLatentImage/);
    assert.match(result.json, /"latent_image"/);
    assert.match(result.json, /"901"/);
  });

  it("builds rapid aio edit scaffold from checkpoint loader", () => {
    const result = buildWorkflowScaffoldForModel("qwen-rapid-aio-edit");
    assert.match(result.json, /CheckpointLoaderSimple/);
    assert.match(result.json, /TextEncodeQwenImageEditPlus/);
    assert.match(result.json, /VAEEncode/);
  });

  it("clones an existing workflow and applies bindings", () => {
    const source = JSON.stringify({
      "1": {
        class_type: "KSampler",
        inputs: {
          seed: 1,
          steps: 20,
          cfg: 7,
          sampler_name: "euler",
          scheduler: "normal",
        },
      },
    });
    const cloned = cloneWorkflowWithBindings(source);
    assert.match(cloned.json, /\{\{SEED\}\}/);
    assert.match(cloned.json, /\{\{STEPS\}\}/);
    assert.ok(cloned.bindingChanges >= 3);
  });

  it("prefers source json when scaffolding from existing workflow", () => {
    const source = JSON.stringify({
      "1": { class_type: "CLIPTextEncode", inputs: { text: "hello" } },
    });
    const result = scaffoldWorkflowForModel("qwen-image-2512", { sourceJson: source });
    assert.equal(result.source, "clone");
    assert.match(result.json, /\{\{POSITIVE\}\}/);
  });
});
