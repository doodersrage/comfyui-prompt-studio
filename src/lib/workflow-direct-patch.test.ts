import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  forceResolveLoaderPlaceholders,
  patchIpAdapterInWorkflow,
  patchLatentSizeInWorkflow,
  patchLoadImageNodesInWorkflow,
  patchLoadImageMaskNodesInWorkflow,
  patchLoaderNodesInWorkflow,
  patchUpscaleModelNodesInWorkflow,
  patchVideoImageToVideoWiringInWorkflow,
  patchWorkflowDirectParams,
} from "./workflow-direct-patch.ts";
import { DEFAULT_UNET_TOKEN, DEFAULT_VAE_TOKEN } from "./model-checkpoint-map.ts";
import { DEFAULT_IPADAPTER_IMAGE_TOKEN, DEFAULT_IPADAPTER_STRENGTH_TOKEN } from "./ipadapter-workflow-patch.ts";
import { buildWorkflowScaffoldForModel } from "./workflow-scaffold.ts";

describe("workflow direct patch", () => {
  it("does not swap Qwen T2I UNET to Edit under fp8→bf16 precision align", () => {
    const workflow = {
      "1": {
        class_type: "UNETLoader",
        inputs: {
          unet_name: "qwen_image_2512_fp8_e4m3fn.safetensors",
          weight_dtype: "fp8_e4m3fn",
        },
      },
    };

    const result = patchLoaderNodesInWorkflow(workflow, {
      unet: "qwen_image_edit_2511_bf16.safetensors",
    });
    const node = result.workflow["1"] as {
      inputs?: { unet_name?: string; weight_dtype?: string };
    };
    // Family mismatch — leave the concrete T2I UNET alone (Lightning prep rewrites
    // fp8→bf16 within-family separately).
    assert.equal(node.inputs?.unet_name, "qwen_image_2512_fp8_e4m3fn.safetensors");
    assert.equal(result.patched.unet, undefined);
  });

  it("aligns fp8 weight_dtype to default when UNET filename is bf16", () => {
    const workflow = {
      "1": {
        class_type: "UNETLoader",
        inputs: {
          unet_name: "qwen_image_2512_fp8_e4m3fn.safetensors",
          weight_dtype: "fp8_e4m3fn",
        },
      },
    };

    const result = patchLoaderNodesInWorkflow(workflow, {
      unet: "qwen_image_2512_bf16.safetensors",
    });
    const node = result.workflow["1"] as {
      inputs?: { unet_name?: string; weight_dtype?: string };
    };
    assert.equal(node.inputs?.unet_name, "qwen_image_2512_bf16.safetensors");
    assert.equal(node.inputs?.weight_dtype, "default");
    assert.equal(result.patched.unet, 1);
    assert.equal(result.patched.unetWeightDtype, 1);
  });

  it("clears stale fp8 weight_dtype when filename already bf16", () => {
    const workflow = {
      "1": {
        class_type: "UNETLoader",
        inputs: {
          unet_name: "qwen_image_2512_bf16.safetensors",
          weight_dtype: "fp8_e4m3fn",
        },
      },
    };

    const result = patchLoaderNodesInWorkflow(workflow, {
      unet: "qwen_image_2512_bf16.safetensors",
    });
    const node = result.workflow["1"] as { inputs?: { weight_dtype?: string } };
    assert.equal(node.inputs?.weight_dtype, "default");
    assert.equal(result.patched.unetWeightDtype, 1);
  });

  it("sync mode overwrites hardcoded loader filenames", () => {
    const workflow = {
      "1": {
        class_type: "UNETLoader",
        inputs: { unet_name: "qwen_image_2512_bf16.safetensors", weight_dtype: "default" },
      },
      "2": {
        class_type: "DualCLIPLoader",
        inputs: {
          clip_name1: "flux2-klein-9b-uncensored.safetensors",
          clip_name2: "flux2-klein-9b-uncensored.safetensors",
        },
      },
    };

    const conservative = patchLoaderNodesInWorkflow(workflow, {
      unet: "flux-2-klein-9b.safetensors",
      dualClip: "qwen_2.5_vl_7b.safetensors",
    });
    const synced = patchLoaderNodesInWorkflow(
      workflow,
      {
        unet: "flux-2-klein-9b.safetensors",
        dualClip: "qwen_2.5_vl_7b.safetensors",
      },
      { syncLoadersToModel: true },
    );

    const conservativeUnet = conservative.workflow["1"] as {
      inputs?: { unet_name?: string };
    };
    const syncedUnet = synced.workflow["1"] as { inputs?: { unet_name?: string } };
    const syncedClip = synced.workflow["2"] as {
      inputs?: { clip_name1?: string; clip_name2?: string };
    };

    assert.equal(
      conservativeUnet.inputs?.unet_name,
      "qwen_image_2512_bf16.safetensors",
    );
    assert.equal(syncedUnet.inputs?.unet_name, "flux-2-klein-9b.safetensors");
    assert.equal(syncedClip.inputs?.clip_name1, "qwen_2.5_vl_7b.safetensors");
    assert.equal(synced.patched.unet, 1);
    assert.equal(synced.patched.dualClip, 2);
  });

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

  it("converts EmptyLatentImage to EmptySD3LatentImage for Qwen models", () => {
    const workflow = {
      "5": {
        class_type: "EmptyLatentImage",
        inputs: { width: 512, height: 512, batch_size: 1 },
      },
    };
    const result = patchWorkflowDirectParams(workflow, {
      model: "qwen-image-2512",
      params: { width: 1328, height: 1328 },
    });
    const node = result.workflow["5"] as { class_type: string; inputs: { width: number } };
    assert.equal(node.class_type, "EmptySD3LatentImage");
    assert.equal(node.inputs.width, 1328);
    assert.equal(result.patched.emptySd3Latent, 1);
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

  it("aligns concrete fp8 clip loaders to resolved bf16 queue loaders", () => {
    const workflow = {
      "1": {
        class_type: "UNETLoader",
        inputs: { unet_name: "qwen_image_2512_bf16.safetensors" },
      },
      "2": {
        class_type: "CLIPLoader",
        inputs: {
          clip_name: "qwen_2.5_vl_7b_fp8_scaled.safetensors",
          type: "qwen_image",
        },
      },
    };

    const result = patchLoaderNodesInWorkflow(workflow, {
      unet: "qwen_image_2512_bf16.safetensors",
      dualClip: "qwen_2.5_vl_7b.safetensors",
    });
    const clip = result.workflow["2"] as { inputs?: { clip_name?: string } };
    assert.equal(clip.inputs?.clip_name, "qwen_2.5_vl_7b.safetensors");
    assert.equal(result.patched.dualClip, 1);
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

  it("patches IP-Adapter image/strength tokens via patchIpAdapterInWorkflow", () => {
    const workflow = {
      "1": { class_type: "LoadImage", inputs: { image: DEFAULT_IPADAPTER_IMAGE_TOKEN } },
      "2": {
        class_type: "IPAdapterAdvanced",
        inputs: { weight: DEFAULT_IPADAPTER_STRENGTH_TOKEN },
      },
    };

    const result = patchIpAdapterInWorkflow(workflow, {
      ipAdapterImageFilename: "identity-ref.png",
      ipAdapterStrength: 0.5,
    });

    const image = result.workflow["1"] as { inputs: Record<string, unknown> };
    const adapter = result.workflow["2"] as { inputs: Record<string, unknown> };
    assert.equal(image.inputs.image, "identity-ref.png");
    assert.equal(adapter.inputs.weight, 0.5);
    assert.equal(result.patched.ipAdapterImage, 1);
    assert.equal(result.patched.ipAdapterStrength, 1);
  });

  it("wires IP-Adapter tokens through patchWorkflowDirectParams", () => {
    const workflow = {
      "1": { class_type: "LoadImage", inputs: { image: DEFAULT_IPADAPTER_IMAGE_TOKEN } },
      "2": {
        class_type: "IPAdapterModelLoader",
        inputs: { ipadapter_file: "{{IPADAPTER_MODEL}}" },
      },
    };

    const result = patchWorkflowDirectParams(workflow, {
      ipAdapterImageFilename: "identity-ref.png",
      ipAdapterModelFilename: "ip-adapter-plus_sdxl.safetensors",
    });

    const image = result.workflow["1"] as { inputs: Record<string, unknown> };
    const loader = result.workflow["2"] as { inputs: Record<string, unknown> };
    assert.equal(image.inputs.image, "identity-ref.png");
    assert.equal(loader.inputs.ipadapter_file, "ip-adapter-plus_sdxl.safetensors");
    assert.equal(result.patched.ipAdapterImage, 1);
    assert.equal(result.patched.ipAdapterModel, 1);
  });

  it("inserts and resolves a minimal IP-Adapter chain when the workflow has none, via patchWorkflowDirectParams", () => {
    const workflow = {
      "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "sdxl.safetensors" } },
      "5": {
        class_type: "KSampler",
        inputs: { seed: 1, steps: 20, cfg: 7, model: ["1", 0] },
      },
    };

    const result = patchWorkflowDirectParams(workflow, {
      ipAdapterImageFilename: "identity-ref.png",
      ipAdapterStrength: 0.55,
      ipAdapterModelFilename: "ip-adapter-plus_sdxl.safetensors",
    });

    assert.ok((result.patched.ipAdapterInserted ?? 0) > 0);
    const sampler = result.workflow["5"] as { inputs: { model: [string, number] } };
    const applyNode = result.workflow[sampler.inputs.model[0]] as {
      class_type: string;
      inputs: Record<string, unknown>;
    };
    assert.equal(applyNode.class_type, "IPAdapterAdvanced");
    assert.equal(applyNode.inputs.weight, 0.55);
    // Original checkpoint stays the model source feeding into the new apply node.
    assert.deepEqual(applyNode.inputs.model, ["1", 0]);

    const loaderNode = result.workflow[(applyNode.inputs.ipadapter as [string, number])[0]] as {
      inputs: Record<string, unknown>;
    };
    assert.equal(loaderNode.inputs.ipadapter_file, "ip-adapter-plus_sdxl.safetensors");
    const loadImageNode = result.workflow[(applyNode.inputs.image as [string, number])[0]] as {
      inputs: Record<string, unknown>;
    };
    assert.equal(loadImageNode.inputs.image, "identity-ref.png");
  });

  it("does not insert an IP-Adapter chain when no reference image is configured", () => {
    const workflow = {
      "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "sdxl.safetensors" } },
      "5": {
        class_type: "KSampler",
        inputs: { seed: 1, steps: 20, cfg: 7, model: ["1", 0] },
      },
    };

    const result = patchWorkflowDirectParams(workflow, {});

    assert.equal(result.patched.ipAdapterInserted, undefined);
    assert.equal(
      Object.values(result.workflow).some(
        (node) => (node as { class_type?: string }).class_type === "IPAdapterAdvanced",
      ),
      false,
    );
  });
});

describe("video I2V auto-wiring (patchVideoImageToVideoWiringInWorkflow)", () => {
  type AnyNode = { class_type?: string; inputs?: Record<string, unknown> };

  it("splices a WanImageToVideo node into the WAN video scaffold when an init image is queued", () => {
    const scaffold = buildWorkflowScaffoldForModel("wan-video");
    const workflow = JSON.parse(scaffold.json) as Record<string, unknown>;

    const result = patchVideoImageToVideoWiringInWorkflow(workflow, {
      model: "wan-video",
      inputImageFilename: "start-frame.png",
      params: { width: 832, height: 480, videoFrames: 81 },
    });

    assert.equal(result.patched.videoImageToVideoWired, 1);

    const sampler = result.workflow["5"] as AnyNode;
    const wireNodeId = (sampler.inputs?.latent_image as [string, number])[0];
    const wireNode = result.workflow[wireNodeId] as AnyNode;
    assert.equal(wireNode.class_type, "WanImageToVideo");
    assert.deepEqual(wireNode.inputs?.start_image, ["900", 0]);
    assert.deepEqual(wireNode.inputs?.positive, ["2", 0]);
    assert.deepEqual(wireNode.inputs?.negative, ["3", 0]);
    assert.equal(wireNode.inputs?.width, 832);
    assert.equal(wireNode.inputs?.height, 480);
    assert.equal(wireNode.inputs?.length, 81);

    // Sampler now reads positive/negative/latent from the new I2V node.
    assert.deepEqual(sampler.inputs?.positive, [wireNodeId, 0]);
    assert.deepEqual(sampler.inputs?.negative, [wireNodeId, 1]);
    assert.deepEqual(sampler.inputs?.latent_image, [wireNodeId, 2]);
  });

  it("splices a HunyuanImageToVideo node into the Hunyuan video scaffold when an init image is queued", () => {
    const scaffold = buildWorkflowScaffoldForModel("hunyuan-video");
    const workflow = JSON.parse(scaffold.json) as Record<string, unknown>;

    const result = patchVideoImageToVideoWiringInWorkflow(workflow, {
      model: "hunyuan-video",
      inputImageFilename: "start-frame.png",
      params: { width: 960, height: 544, videoFrames: 53 },
    });

    assert.equal(result.patched.videoImageToVideoWired, 1);

    const sampler = result.workflow["5"] as AnyNode;
    const wireNodeId = (sampler.inputs?.latent_image as [string, number])[0];
    const wireNode = result.workflow[wireNodeId] as AnyNode;
    assert.equal(wireNode.class_type, "HunyuanImageToVideo");
    assert.deepEqual(wireNode.inputs?.start_image, ["900", 0]);
    assert.deepEqual(wireNode.inputs?.positive, ["2", 0]);
    assert.equal(wireNode.inputs?.width, 960);
    assert.equal(wireNode.inputs?.height, 544);
    assert.equal(wireNode.inputs?.length, 53);

    assert.deepEqual(sampler.inputs?.positive, [wireNodeId, 0]);
    assert.deepEqual(sampler.inputs?.latent_image, [wireNodeId, 1]);
  });

  it("leaves the video scaffold as plain T2V when no init image is queued", () => {
    const scaffold = buildWorkflowScaffoldForModel("wan-video");
    const workflow = JSON.parse(scaffold.json) as Record<string, unknown>;

    const result = patchVideoImageToVideoWiringInWorkflow(workflow, {
      model: "wan-video",
      inputImageFilename: undefined,
      params: { width: 832, height: 480, videoFrames: 81 },
    });

    assert.equal(result.patched.videoImageToVideoWired, undefined);
    const sampler = result.workflow["5"] as AnyNode;
    assert.deepEqual(sampler.inputs?.latent_image, ["4", 0]);
    assert.equal(
      Object.values(result.workflow).some(
        (node) => (node as AnyNode).class_type === "WanImageToVideo",
      ),
      false,
    );
  });

  it("is a no-op for non-video models even when an init image is queued", () => {
    const workflow = {
      "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "sdxl.safetensors" } },
      "900": { class_type: "LoadImage", inputs: { image: "{{INIT_IMAGE}}" }, _meta: { title: "Init Image" } },
      "4": { class_type: "EmptyHunyuanLatentVideo", inputs: { width: 832, height: 480, length: 81 } },
      "5": {
        class_type: "KSampler",
        inputs: { positive: ["2", 0], negative: ["3", 0], latent_image: ["4", 0] },
      },
    };

    const result = patchVideoImageToVideoWiringInWorkflow(workflow, {
      model: "qwen-image-2512",
      inputImageFilename: "start-frame.png",
    });

    assert.equal(result.patched.videoImageToVideoWired, undefined);
    assert.equal(result.error, undefined);
    assert.deepEqual(
      (result.workflow["5"] as AnyNode).inputs?.latent_image,
      ["4", 0],
    );
  });

  it("hard-fails when a video model has an init image but the graph cannot be I2V-wired", () => {
    const workflow = {
      "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "wan.safetensors" } },
      // Missing LoadImage + latent video + VAEDecode chain
      "2": { class_type: "CLIPTextEncode", inputs: { text: "pos", clip: ["1", 1] } },
    };

    const result = patchVideoImageToVideoWiringInWorkflow(workflow, {
      model: "wan-video",
      inputImageFilename: "start-frame.png",
    });

    assert.equal(result.patched.videoImageToVideoWired, undefined);
    assert.match(result.error ?? "", /I2V could not be wired/i);
  });

  it("respects an already-wired custom WanImageToVideo graph instead of double-wiring", () => {
    const workflow = {
      "900": { class_type: "LoadImage", inputs: { image: "{{INIT_IMAGE}}" }, _meta: { title: "Init Image" } },
      "10": {
        class_type: "WanImageToVideo",
        inputs: { positive: ["2", 0], negative: ["3", 0], start_image: ["900", 0] },
      },
      "5": {
        class_type: "KSampler",
        inputs: { positive: ["10", 0], negative: ["10", 1], latent_image: ["10", 2] },
      },
    };

    const result = patchVideoImageToVideoWiringInWorkflow(workflow, {
      model: "wan-video",
      inputImageFilename: "start-frame.png",
    });

    assert.equal(result.patched.videoImageToVideoWired, undefined);
    const nodeIds = Object.keys(result.workflow);
    assert.equal(nodeIds.length, 3);
  });

  it("wires I2V end-to-end through patchWorkflowDirectParams when queueing an init image", () => {
    const scaffold = buildWorkflowScaffoldForModel("wan-video");
    const workflow = JSON.parse(scaffold.json) as Record<string, unknown>;

    const result = patchWorkflowDirectParams(workflow, {
      model: "wan-video",
      params: {
        inputImageFilename: "start-frame.png",
        width: 832,
        height: 480,
        videoFrames: 81,
      },
    });

    assert.equal(result.patched.videoImageToVideoWired, 1);
    const loadImageNode = result.workflow["900"] as AnyNode;
    assert.equal(loadImageNode.inputs?.image, "start-frame.png");
    assert.equal(
      Object.values(result.workflow).some(
        (node) => (node as AnyNode).class_type === "WanImageToVideo",
      ),
      true,
    );
  });
});
