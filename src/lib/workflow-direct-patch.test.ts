import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  forceResolveLoaderPlaceholders,
  patchLatentSizeInWorkflow,
  patchLoadImageNodesInWorkflow,
  patchLoadImageMaskNodesInWorkflow,
  patchLoaderNodesInWorkflow,
  patchUpscaleModelNodesInWorkflow,
  patchWorkflowDirectParams,
} from "./workflow-direct-patch.ts";
import { DEFAULT_UNET_TOKEN, DEFAULT_VAE_TOKEN } from "./model-checkpoint-map.ts";

describe("workflow direct patch", () => {
  it("patches EmptyLatentImage width and height", () => {
    const workflow = {
      "5": {
        class_type: "EmptyLatentImage",
        inputs: { width: 512, height: 512, batch_size: 1 },
      },
    };

    const result = patchLatentSizeInWorkflow(workflow, { width: 1024, height: 1024 });
    const node = result.workflow["5"] as { inputs?: { width?: number; height?: number } };

    assert.equal(node.inputs?.width, 1024);
    assert.equal(node.inputs?.height, 1024);
    assert.equal(result.patched.width, 1);
    assert.equal(result.patched.height, 1);
  });

  it("patches checkpoint and unet loader placeholders without clobbering concrete filenames", () => {
    const workflow = {
      "1": {
        class_type: "CheckpointLoaderSimple",
        inputs: { ckpt_name: "{{CHECKPOINT}}" },
      },
      "2": {
        class_type: "UNETLoader",
        inputs: { unet_name: "{{UNET}}", weight_dtype: "default" },
      },
      "3": {
        class_type: "UNETLoader",
        inputs: { unet_name: "qwen_image_2512_bf16.safetensors", weight_dtype: "default" },
      },
    };

    const result = patchLoaderNodesInWorkflow(workflow, {
      checkpoint: "flux-2-klein-9b.safetensors",
      unet: "qwen_image_2512_fp8_e4m3fn.safetensors",
    });

    const checkpoint = result.workflow["1"] as { inputs?: { ckpt_name?: string } };
    const unetPlaceholder = result.workflow["2"] as { inputs?: { unet_name?: string } };
    const unetConcrete = result.workflow["3"] as { inputs?: { unet_name?: string } };
    assert.equal(checkpoint.inputs?.ckpt_name, "flux-2-klein-9b.safetensors");
    assert.equal(unetPlaceholder.inputs?.unet_name, "qwen_image_2512_fp8_e4m3fn.safetensors");
    assert.equal(unetConcrete.inputs?.unet_name, "qwen_image_2512_bf16.safetensors");
  });

  it("patches deprecated qwen dual clip filenames", () => {
    const workflow = {
      "2": {
        class_type: "DualCLIPLoader",
        inputs: {
          clip_name1: "qwen_2.5_vl_7b_bf16.safetensors",
          clip_name2: "qwen_2.5_vl_7b_bf16.safetensors",
          type: "qwen_image",
        },
      },
    };

    const result = patchLoaderNodesInWorkflow(workflow, {
      dualClip: "qwen_2.5_vl_7b.safetensors",
    });
    const node = result.workflow["2"] as {
      inputs?: { clip_name1?: string; clip_name2?: string };
    };
    assert.equal(node.inputs?.clip_name1, "qwen_2.5_vl_7b.safetensors");
    assert.equal(node.inputs?.clip_name2, "qwen_2.5_vl_7b.safetensors");
    assert.equal(result.patched.dualClip, 2);
  });

  it("patches unresolved latent placeholders", () => {
    const workflow = {
      "5": {
        class_type: "EmptyLatentImage",
        inputs: { width: "{{WIDTH}}", height: "{{HEIGHT}}", batch_size: 1 },
      },
    };

    const result = patchWorkflowDirectParams(workflow, {
      params: { width: 928, height: 1664 },
    });
    const node = result.workflow["5"] as { inputs?: { width?: number; height?: number } };
    assert.equal(node.inputs?.width, 928);
    assert.equal(node.inputs?.height, 1664);
  });

  it("patches LoadImage nodes with input filename", () => {
    const workflow = {
      "10": {
        class_type: "LoadImage",
        inputs: { image: "placeholder.png" },
      },
    };
    const result = patchLoadImageNodesInWorkflow(workflow, "uploaded-ref.png");
    const node = result.workflow["10"] as { inputs?: { image?: string } };
    assert.equal(node.inputs?.image, "uploaded-ref.png");
    assert.equal(result.patched.inputImage, 1);
  });

  it("patches LoadImageMask nodes separately from LoadImage", () => {
    const workflow = {
      "10": {
        class_type: "LoadImage",
        inputs: { image: "source.png" },
      },
      "11": {
        class_type: "LoadImageMask",
        inputs: { image: "mask.png" },
      },
    };
    const result = patchWorkflowDirectParams(workflow, {
      params: {
        inputImageFilename: "uploaded-ref.png",
        maskImageFilename: "uploaded-mask.png",
      },
    });
    const source = result.workflow["10"] as { inputs?: { image?: string } };
    const mask = result.workflow["11"] as { inputs?: { image?: string } };
    assert.equal(source.inputs?.image, "uploaded-ref.png");
    assert.equal(mask.inputs?.image, "uploaded-mask.png");
    assert.equal(result.patched.inputImage, 1);
    assert.equal(result.patched.maskImage, 1);

    const maskOnly = patchLoadImageMaskNodesInWorkflow(workflow, "mask-only.png");
    const maskNode = maskOnly.workflow["11"] as { inputs?: { image?: string } };
    const sourceNode = maskOnly.workflow["10"] as { inputs?: { image?: string } };
    assert.equal(maskNode.inputs?.image, "mask-only.png");
    assert.equal(sourceNode.inputs?.image, "source.png");
  });

  it("patches UpscaleModel loader filenames", () => {
    const workflow = {
      "20": {
        class_type: "UpscaleModelLoader",
        inputs: { model_name: "{{UPSCALE_MODEL}}" },
      },
    };
    const result = patchUpscaleModelNodesInWorkflow(workflow, "4x-UltraSharp.pth");
    const node = result.workflow["20"] as { inputs?: { model_name?: string } };
    assert.equal(node.inputs?.model_name, "4x-UltraSharp.pth");
    assert.equal(result.patched.upscaleModel, 1);
  });

  it("skips direct patching when disabled via inject options", async () => {
    const { injectPromptsWithFallbacks, DEFAULT_WIDTH_TOKEN, DEFAULT_HEIGHT_TOKEN } =
      await import("./comfyui-config.ts");
    const workflow = {
      "5": {
        class_type: "EmptyLatentImage",
        inputs: { width: 512, height: 512, batch_size: 1 },
      },
    };
    const result = injectPromptsWithFallbacks(
      workflow,
      { positive: "test", params: { width: 1024, height: 1024 } },
      {
        positive: "{{POSITIVE}}",
        negative: "{{NEGATIVE}}",
        seed: "{{SEED}}",
        width: DEFAULT_WIDTH_TOKEN,
        height: DEFAULT_HEIGHT_TOKEN,
        cfg: "{{CFG}}",
        steps: "{{STEPS}}",
        sampler: "{{SAMPLER}}",
        scheduler: "{{SCHEDULER}}",
        shift: "{{SHIFT}}",
        fluxMaxShift: "{{FLUX_MAX_SHIFT}}",
        fluxBaseShift: "{{FLUX_BASE_SHIFT}}",
        denoise: "{{DENOISE}}",
        inputImage: "{{INPUT_IMAGE}}",
        maskImage: "{{MASK_IMAGE}}",
      },
      { directWorkflowPatching: false },
    );
    const node = result.workflow["5"] as { inputs?: { width?: number; height?: number } };
    assert.equal(node.inputs?.width, 512);
    assert.equal(node.inputs?.height, 512);
  });

  it("force-resolves loader placeholders even when direct patching is disabled", () => {
    const workflow = {
      "228": {
        class_type: "UNETLoader",
        inputs: { unet_name: DEFAULT_UNET_TOKEN, weight_dtype: "default" },
      },
      "230": {
        class_type: "VAELoader",
        inputs: { vae_name: DEFAULT_VAE_TOKEN },
      },
    };

    const result = forceResolveLoaderPlaceholders(workflow, {
      unet: "flux-2-klein-9b.safetensors",
      vae: "flux2-vae.safetensors",
    });

    const unet = result["228"] as { inputs?: { unet_name?: string } };
    const vae = result["230"] as { inputs?: { vae_name?: string } };
    assert.equal(unet.inputs?.unet_name, "flux-2-klein-9b.safetensors");
    assert.equal(vae.inputs?.vae_name, "flux2-vae.safetensors");
  });

  it("replaces loader tokens anywhere in loader node inputs via json fallback", () => {
    const workflow = {
      "228": {
        class_type: "UNETLoader",
        inputs: { model: "{{UNET}}", weight_dtype: "default" },
      },
    };

    const result = forceResolveLoaderPlaceholders(workflow, {
      unet: "flux-2-klein-9b.safetensors",
    });

    const unet = result["228"] as { inputs?: { model?: string } };
    assert.equal(unet.inputs?.model, "flux-2-klein-9b.safetensors");
  });
});
