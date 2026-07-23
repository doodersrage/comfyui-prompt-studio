import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildWorkflowScaffoldForModel,
  cloneWorkflowWithBindings,
  scaffoldWorkflowForModel,
} from "./workflow-scaffold.ts";

describe("workflow scaffold", () => {
  it("builds a flux Klein scaffold with CLIPLoader type flux2", () => {
    const result = buildWorkflowScaffoldForModel("flux-2-klein-9b");
    assert.equal(result.category, "flux");
    assert.match(result.json, /ModelSamplingFlux/);
    assert.match(result.json, /UNETLoader/);
    assert.match(result.json, /CLIPLoader/);
    assert.match(result.json, /"type": "flux2"/);
    assert.doesNotMatch(result.json, /DualCLIPLoader/);
    assert.match(result.json, /VAELoader/);
    assert.doesNotMatch(result.json, /CheckpointLoaderSimple/);
    assert.match(result.json, /\{\{UNET\}\}/);
    assert.match(result.json, /qwen_3_8b_fp8mixed/);
    assert.doesNotMatch(result.json, /clip_l\.safetensors/);
    assert.match(result.json, /\{\{FLUX_MAX_SHIFT\}\}/);
    assert.match(result.json, /\{\{POSITIVE\}\}/);
    assert.match(result.json, /\{\{WIDTH\}\}/);
  });

  it("builds flux-dev scaffold with clip_l + t5xxl DualCLIP", () => {
    const result = buildWorkflowScaffoldForModel("flux-dev");
    assert.match(result.json, /clip_l\.safetensors/);
    assert.match(result.json, /t5xxl_fp16\.safetensors/);
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
    assert.match(result.json, /LoraLoaderModelOnly/);
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

  it("builds a video scaffold with an optional init image node ready for I2V auto-wiring", () => {
    const result = buildWorkflowScaffoldForModel("wan-video");
    assert.equal(result.category, "video");
    assert.match(result.json, /EmptyHunyuanLatentVideo/);
    assert.match(result.json, /SaveAnimatedWEBP/);
    assert.match(result.json, /\{\{VIDEO_FRAMES\}\}/);
    assert.match(result.json, /\{\{VIDEO_FPS\}\}/);
    assert.match(result.json, /\{\{INIT_IMAGE\}\}/);
    // Node "900" is the unwired LoadImage placeholder — queue-time patching
    // (patchVideoImageToVideoWiringInWorkflow) splices in the real I2V node.
    assert.match(result.json, /"900"/);
    const graph = JSON.parse(result.json) as Record<
      string,
      { class_type?: string; _meta?: { title?: string } }
    >;
    assert.equal(graph["900"]?.class_type, "LoadImage");
    assert.match(graph["900"]?._meta?.title ?? "", /init/i);
    // The scaffold ships as plain T2V — no I2V conditioning node exists yet;
    // it's only spliced in later by patchVideoImageToVideoWiringInWorkflow.
    assert.equal(
      Object.values(graph).some((node) =>
        ["WanImageToVideo", "HunyuanImageToVideo"].includes(node.class_type ?? ""),
      ),
      false,
    );
    assert.doesNotMatch(result.json, /LoraLoaderModelOnly/);
  });

  it("builds WAN Lightning scaffold with LoraLoaderModelOnly (no AuraFlow)", () => {
    const result = buildWorkflowScaffoldForModel("wan-video-lightning-4");
    assert.equal(result.category, "video");
    assert.match(result.json, /EmptyHunyuanLatentVideo/);
    assert.match(result.json, /LoraLoaderModelOnly/);
    assert.match(result.json, /\{\{LORA_LIGHTNING\}\}/);
    assert.match(result.json, /CheckpointLoaderSimple/);
    assert.doesNotMatch(result.json, /ModelSamplingAuraFlow/);
    const graph = JSON.parse(result.json) as Record<
      string,
      { class_type?: string; inputs?: { model?: [string, number] } }
    >;
    assert.equal(graph["8"]?.class_type, "LoraLoaderModelOnly");
    assert.deepEqual(graph["5"]?.inputs?.model, ["8", 0]);
  });

  it("builds WAN Rapid AIO scaffold without Lightning LoRA", () => {
    const result = buildWorkflowScaffoldForModel("wan-video-rapid-aio");
    assert.equal(result.category, "video");
    assert.match(result.json, /EmptyHunyuanLatentVideo/);
    assert.match(result.json, /CheckpointLoaderSimple/);
    assert.doesNotMatch(result.json, /LoraLoaderModelOnly/);
    assert.doesNotMatch(result.json, /\{\{LORA_LIGHTNING\}\}/);
  });

  it("builds the same T2V-by-default scaffold shape for hunyuan-video", () => {
    const result = buildWorkflowScaffoldForModel("hunyuan-video");
    assert.equal(result.category, "video");
    assert.match(result.json, /EmptyHunyuanLatentVideo/);
    assert.match(result.json, /"900"/);
  });

  it("builds lightning edit scaffold with EmptyLatent + LoRA (not VAEEncode)", () => {
    const result = buildWorkflowScaffoldForModel("qwen-image-edit-2511-lightning-8");
    assert.match(result.json, /TextEncodeQwenImageEditPlus/);
    assert.match(result.json, /EmptySD3LatentImage/);
    assert.match(result.json, /LoraLoaderModelOnly/);
    assert.match(result.json, /\{\{LORA_LIGHTNING\}\}/);
    assert.match(result.json, /ModelSamplingAuraFlow/);
    assert.doesNotMatch(result.json, /VAEEncode/);
    assert.match(result.json, /"title": "Figure 1"/);
    assert.match(result.json, /"title": "Figure 2"/);
    assert.match(result.json, /"title": "Figure 4"/);
    assert.match(result.json, /\{\{INPUT_IMAGE\}\}/);
    assert.match(result.json, /\{\{INPUT_IMAGE_2\}\}/);
    assert.match(result.json, /\{\{INPUT_IMAGE_4\}\}/);
    // Encode slots stay disconnected in the template.
    assert.doesNotMatch(result.json, /"image1"\s*:/);
  });

  it("strips unused Figure LoadImages on Lightning edit txt2img disconnect", async () => {
    const { disconnectQwenEditReferenceImagesForTxt2Img } = await import(
      "./workflow-lightning-queue.ts"
    );
    const scaffold = buildWorkflowScaffoldForModel("qwen-image-edit-2511-lightning-8");
    const parsed = JSON.parse(scaffold.json) as Record<string, unknown>;
    const { workflow } = disconnectQwenEditReferenceImagesForTxt2Img(parsed, {
      hasInputImage: false,
      model: "qwen-image-edit-2511-lightning-8",
    });
    const loadImages = Object.values(workflow).filter(
      (node) =>
        node &&
        typeof node === "object" &&
        (node as { class_type?: string }).class_type === "LoadImage",
    );
    assert.equal(loadImages.length, 0);
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
