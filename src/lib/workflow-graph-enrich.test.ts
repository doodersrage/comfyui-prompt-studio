import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_SHIFT_TOKEN } from "./comfyui-config.ts";
import { enrichWorkflowGraph } from "./workflow-graph-enrich.ts";

const TOKENS = {
  positive: "{{POSITIVE}}",
  negative: "{{NEGATIVE}}",
  seed: "{{SEED}}",
  width: "{{WIDTH}}",
  height: "{{HEIGHT}}",
  cfg: "{{CFG}}",
  steps: "{{STEPS}}",
  sampler: "{{SAMPLER}}",
  scheduler: "{{SCHEDULER}}",
  shift: DEFAULT_SHIFT_TOKEN,
  fluxMaxShift: "{{FLUX_MAX_SHIFT}}",
  fluxBaseShift: "{{FLUX_BASE_SHIFT}}",
  denoise: "{{DENOISE}}",
  inputImage: "{{INPUT_IMAGE}}",
  maskImage: "{{MASK_IMAGE}}",
};

describe("workflow-graph-enrich", () => {
  it("inserts ModelSamplingFlux between FLUX loader and KSampler", () => {
    const workflow = {
      "1": {
        class_type: "UNETLoader",
        inputs: { unet_name: "{{UNET}}" },
      },
      "6": {
        class_type: "KSampler",
        inputs: {
          seed: "{{SEED}}",
          steps: "{{STEPS}}",
          cfg: "{{CFG}}",
          model: ["1", 0],
          positive: ["3", 0],
          negative: ["4", 0],
          latent_image: ["5", 0],
        },
      },
    };

    const result = enrichWorkflowGraph({
      workflow,
      tokens: TOKENS,
      model: "flux-dev",
    });

    assert.equal(result.changes.length, 1);
    const patched = result.workflow["6"] as { inputs: { model: [string, number] } };
    const patchNodeId = patched.inputs.model[0];
    const patchNode = result.workflow[patchNodeId] as {
      class_type: string;
      inputs: Record<string, unknown>;
    };
    assert.equal(patchNode.class_type, "ModelSamplingFlux");
    assert.deepEqual(patchNode.inputs.model, ["1", 0]);
    assert.equal(patchNode.inputs.max_shift, "{{FLUX_MAX_SHIFT}}");
  });

  it("skips workflows that already include a sampling patch node", () => {
    const workflow = {
      "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "{{CHECKPOINT}}" } },
      "2": {
        class_type: "ModelSamplingAuraFlow",
        inputs: { model: ["1", 0], shift: DEFAULT_SHIFT_TOKEN },
      },
      "6": {
        class_type: "KSampler",
        inputs: { model: ["2", 0], seed: 1, steps: 20, cfg: 3 },
      },
    };

    const result = enrichWorkflowGraph({
      workflow,
      tokens: TOKENS,
      model: "flux-dev",
    });

    assert.equal(result.changes.length, 0);
  });

  it("inserts ImageScale before SaveImage for final quality profiles", () => {
    const workflow = {
      "7": {
        class_type: "VAEDecode",
        inputs: { samples: ["6", 0], vae: ["1", 2] },
      },
      "8": {
        class_type: "SaveImage",
        inputs: { images: ["7", 0], filename_prefix: "PromptStudio" },
      },
    };

    const result = enrichWorkflowGraph({
      workflow,
      tokens: TOKENS,
      qualityProfile: "final",
      enrichSampling: false,
    });

    assert.equal(result.changes.length, 1);
    const saveNode = result.workflow["8"] as { inputs: { images: [string, number] } };
    const scaleId = saveNode.inputs.images[0];
    const scaleNode = result.workflow[scaleId] as {
      class_type: string;
      inputs: Record<string, unknown>;
    };
    assert.equal(scaleNode.class_type, "ImageScaleBy");
    assert.equal(scaleNode.inputs.scale_by, 1.25);
  });

  it("inserts UpscaleModel chain when upscale filename is configured", () => {
    const workflow = {
      "7": {
        class_type: "VAEDecode",
        inputs: { samples: ["6", 0], vae: ["1", 2] },
      },
      "8": {
        class_type: "SaveImage",
        inputs: { images: ["7", 0], filename_prefix: "PromptStudio" },
      },
    };

    const result = enrichWorkflowGraph({
      workflow,
      tokens: TOKENS,
      qualityProfile: "final",
      upscaleModelFilename: "4x-UltraSharp.pth",
      enrichSampling: false,
    });

    assert.equal(result.changes.length, 1);
    const saveNode = result.workflow["8"] as { inputs: { images: [string, number] } };
    const upscaleId = saveNode.inputs.images[0];
    const upscaleNode = result.workflow[upscaleId] as {
      class_type: string;
      inputs: Record<string, unknown>;
    };
    assert.equal(upscaleNode.class_type, "ImageUpscaleWithModel");
    const loaderId = (upscaleNode.inputs.upscale_model as [string, number])[0];
    const loaderNode = result.workflow[loaderId] as {
      class_type: string;
      inputs: { model_name?: string };
    };
    assert.equal(loaderNode.class_type, "UpscaleModelLoader");
    assert.equal(loaderNode.inputs.model_name, "4x-UltraSharp.pth");
  });

  it("chains Lanczos polish after neural upscale on max profile", () => {
    const workflow = {
      "7": {
        class_type: "VAEDecode",
        inputs: { samples: ["6", 0], vae: ["1", 2] },
      },
      "8": {
        class_type: "SaveImage",
        inputs: { images: ["7", 0], filename_prefix: "PromptStudio" },
      },
    };

    const result = enrichWorkflowGraph({
      workflow,
      tokens: TOKENS,
      qualityProfile: "max",
      upscaleModelFilename: "4x-UltraSharp.pth",
      enrichSampling: false,
    });

    assert.ok(result.changes.length >= 2);
    const saveNode = result.workflow["8"] as { inputs: { images: [string, number] } };
    const sharpenId = saveNode.inputs.images[0];
    const sharpenNode = result.workflow[sharpenId] as {
      class_type: string;
      inputs: Record<string, unknown>;
    };
    assert.equal(sharpenNode.class_type, "ImageSharpen");
    const polishId = (sharpenNode.inputs.image as [string, number])[0];
    const polishNode = result.workflow[polishId] as {
      class_type: string;
      inputs: Record<string, unknown>;
    };
    assert.equal(polishNode.class_type, "ImageScaleBy");
    assert.equal(polishNode.inputs.scale_by, 1.05);
  });

  it("sets tile_size on neural upscale for max profile", () => {
    const workflow = {
      "7": {
        class_type: "VAEDecode",
        inputs: { samples: ["6", 0], vae: ["1", 2] },
      },
      "8": {
        class_type: "SaveImage",
        inputs: { images: ["7", 0], filename_prefix: "PromptStudio" },
      },
    };

    const result = enrichWorkflowGraph({
      workflow,
      tokens: TOKENS,
      qualityProfile: "max",
      upscaleModelFilename: "4x-UltraSharp.pth",
      enrichSampling: false,
    });

    const saveNode = result.workflow["8"] as { inputs: { images: [string, number] } };
    let nodeId = saveNode.inputs.images[0];
    let node = result.workflow[nodeId] as {
      class_type: string;
      inputs: Record<string, unknown>;
    };
    while (node.class_type === "ImageScaleBy" || node.class_type === "ImageSharpen") {
      nodeId = (node.inputs.image as [string, number])[0];
      node = result.workflow[nodeId] as {
        class_type: string;
        inputs: Record<string, unknown>;
      };
    }
    assert.equal(node.class_type, "ImageUpscaleWithModel");
    assert.equal(node.inputs.tile_size, 512);
  });

  it("inserts ImageSharpen after upscale on max profile", () => {
    const workflow = {
      "7": {
        class_type: "VAEDecode",
        inputs: { samples: ["6", 0], vae: ["1", 2] },
      },
      "8": {
        class_type: "SaveImage",
        inputs: { images: ["7", 0], filename_prefix: "PromptStudio" },
      },
    };

    const result = enrichWorkflowGraph({
      workflow,
      tokens: TOKENS,
      qualityProfile: "max",
      upscaleModelFilename: "4x-UltraSharp.pth",
      enrichSampling: false,
    });

    const saveNode = result.workflow["8"] as { inputs: { images: [string, number] } };
    const sharpenId = saveNode.inputs.images[0];
    const sharpenNode = result.workflow[sharpenId] as {
      class_type: string;
      inputs: Record<string, unknown>;
    };
    assert.equal(sharpenNode.class_type, "ImageSharpen");
    assert.equal(sharpenNode.inputs.alpha, 0.1);
  });

  it("skips sharpen when enrichSharpen is false", () => {
    const workflow = {
      "7": {
        class_type: "VAEDecode",
        inputs: { samples: ["6", 0], vae: ["1", 2] },
      },
      "8": {
        class_type: "SaveImage",
        inputs: { images: ["7", 0], filename_prefix: "PromptStudio" },
      },
    };

    const result = enrichWorkflowGraph({
      workflow,
      tokens: TOKENS,
      qualityProfile: "max",
      upscaleModelFilename: "4x-UltraSharp.pth",
      enrichSampling: false,
      enrichSharpen: false,
    });

    const saveNode = result.workflow["8"] as { inputs: { images: [string, number] } };
    const outputId = saveNode.inputs.images[0];
    const outputNode = result.workflow[outputId] as { class_type: string };
    assert.notEqual(outputNode.class_type, "ImageSharpen");
  });

  it("inserts SDXL refiner pass before VAEDecode on final quality", () => {
    const workflow = {
      "1": {
        class_type: "CheckpointLoaderSimple",
        inputs: { ckpt_name: "sd_xl_base_1.0.safetensors" },
      },
      "2": {
        class_type: "CLIPTextEncode",
        inputs: { text: "{{POSITIVE}}", clip: ["1", 1] },
      },
      "3": {
        class_type: "CLIPTextEncode",
        inputs: { text: "{{NEGATIVE}}", clip: ["1", 1] },
      },
      "4": {
        class_type: "EmptyLatentImage",
        inputs: { width: 1024, height: 1024, batch_size: 1 },
      },
      "5": {
        class_type: "KSampler",
        inputs: {
          seed: "{{SEED}}",
          steps: "{{STEPS}}",
          cfg: "{{CFG}}",
          sampler_name: "euler",
          scheduler: "normal",
          denoise: 1,
          model: ["1", 0],
          positive: ["2", 0],
          negative: ["3", 0],
          latent_image: ["4", 0],
        },
      },
      "6": {
        class_type: "VAEDecode",
        inputs: { samples: ["5", 0], vae: ["1", 2] },
      },
      "7": {
        class_type: "SaveImage",
        inputs: { images: ["6", 0], filename_prefix: "PromptStudio" },
      },
    };

    const result = enrichWorkflowGraph({
      workflow,
      tokens: TOKENS,
      model: "sdxl",
      qualityProfile: "final",
      refinerCheckpointFilename: "sd_xl_refiner_1.0.safetensors",
      enrichUpscale: false,
    });

    assert.equal(result.changes.length, 1);
    const decodeNode = result.workflow["6"] as { inputs: { samples: [string, number] } };
    const refinerSamplerId = decodeNode.inputs.samples[0];
    const refinerSampler = result.workflow[refinerSamplerId] as {
      class_type: string;
      inputs: Record<string, unknown>;
    };
    assert.equal(refinerSampler.class_type, "KSampler");
    assert.equal(refinerSampler.inputs.denoise, 0.22);
  });
});
