import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  auditLightningWorkflowIssues,
  bypassModelSamplingAuraFlowForLightning,
  ensureLightningModelChainInWorkflow,
  neutralizeNonLightningLoras,
  prepareLightningWorkflowForQueue,
  stripLightningHiresPass,
  stripLightningOutputPostProcess,
  workflowHasLoraLoader,
} from "./workflow-lightning-queue.ts";
import { applyWorkflowNodeBindings } from "./workflow-apply-bindings.ts";
import { resolveLoaderPrecisionTier } from "./model-loader-precision.ts";
import { patchModelSamplingInWorkflow } from "./model-sampling-patch.ts";
import { patchSamplerParamsInWorkflow } from "./comfyui-config.ts";

describe("workflow-lightning-queue", () => {
  it("keeps ModelSamplingAuraFlow for lightning models", () => {
    const workflow = {
      "1": { class_type: "UNETLoader", inputs: { unet_name: "qwen.safetensors" } },
      "7": {
        class_type: "ModelSamplingAuraFlow",
        inputs: { model: ["1", 0], shift: 3.1 },
      },
      "8": {
        class_type: "KSampler",
        inputs: {
          model: ["7", 0],
          steps: 8,
          cfg: 1,
        },
      },
    };

    const result = bypassModelSamplingAuraFlowForLightning(
      workflow,
      "qwen-image-2512-lightning-8",
    );

    assert.deepEqual(
      (result.workflow["8"] as { inputs: { model: unknown } }).inputs.model,
      ["7", 0],
    );
    assert.deepEqual(result.bypassedNodeIds, []);
  });

  it("strips imported upscale and sharpen nodes before SaveImage", () => {
    const workflow = {
      "9": { class_type: "VAEDecode", inputs: { samples: ["8", 0], vae: ["3", 0] } },
      "11": {
        class_type: "ImageScaleBy",
        inputs: { image: ["9", 0], scale_by: 1.5, upscale_method: "lanczos" },
      },
      "12": {
        class_type: "ImageSharpen",
        inputs: { image: ["11", 0], sharpen_radius: 1, sigma: 0.4, alpha: 0.08 },
      },
      "10": {
        class_type: "SaveImage",
        inputs: { images: ["12", 0], filename_prefix: "ComfyUI" },
      },
    };

    const result = stripLightningOutputPostProcess(
      workflow,
      "qwen-image-2512-lightning-8",
    );

    assert.deepEqual(
      (result.workflow["10"] as { inputs: { images: unknown } }).inputs.images,
      ["9", 0],
    );
    assert.deepEqual(result.strippedNodeIds.sort(), ["11", "12"]);
  });

  it("keeps Prompt Studio quality-profile upscale nodes for lightning", () => {
    const workflow = {
      "9": { class_type: "VAEDecode", inputs: { samples: ["8", 0], vae: ["3", 0] } },
      "11": {
        class_type: "ImageScaleBy",
        inputs: { image: ["9", 0], scale_by: 1.25, upscale_method: "area" },
        _meta: { title: "Prompt Studio — output upscale" },
      },
      "10": {
        class_type: "SaveImage",
        inputs: { images: ["11", 0], filename_prefix: "ComfyUI" },
      },
    };

    const result = stripLightningOutputPostProcess(
      workflow,
      "qwen-image-2512-lightning-8",
    );

    assert.deepEqual(
      (result.workflow["10"] as { inputs: { images: unknown } }).inputs.images,
      ["11", 0],
    );
    assert.deepEqual(result.strippedNodeIds, []);
  });

  it("inserts Lightning LoRA + AuraFlow when the graph is missing them", () => {
    const workflow = {
      "1": { class_type: "UNETLoader", inputs: { unet_name: "qwen.safetensors" } },
      "2": { class_type: "CLIPLoader", inputs: { clip_name: "clip.safetensors", type: "qwen_image" } },
      "8": {
        class_type: "KSampler",
        inputs: {
          model: ["1", 0],
          seed: 1,
          steps: 8,
          cfg: 1,
          denoise: 1,
        },
      },
    };

    const result = ensureLightningModelChainInWorkflow(
      workflow,
      "qwen-image-2512-lightning-8",
      { "{{LORA_LIGHTNING}}": "qwen_lightning_8steps.safetensors" },
    );

    const sampler = result["8"] as { inputs: { model: [string, number] } };
    const auraId = sampler.inputs.model[0];
    const aura = result[auraId] as {
      class_type: string;
      inputs: { shift: number; model: [string, number] };
    };
    assert.equal(aura.class_type, "ModelSamplingAuraFlow");
    assert.equal(aura.inputs.shift, 3);
    const loraId = aura.inputs.model[0];
    const lora = result[loraId] as {
      class_type: string;
      inputs: { lora_name: string; model: [string, number]; strength_model: number };
    };
    assert.equal(lora.class_type, "LoraLoaderModelOnly");
    assert.equal(lora.inputs.lora_name, "qwen_lightning_8steps.safetensors");
    assert.equal(lora.inputs.strength_model, 1);
    assert.deepEqual(lora.inputs.model, ["1", 0]);
  });

  it("strips stale Lightning latent hires pass", () => {
    const workflow = {
      "7": {
        class_type: "KSampler",
        inputs: { denoise: 1, model: ["1", 0], seed: 1, steps: 8, cfg: 1 },
      },
      "11": {
        class_type: "LatentUpscale",
        inputs: { samples: ["7", 0], upscale_method: "bislerp", scale_by: 1.25 },
      },
      "12": {
        class_type: "KSampler",
        inputs: {
          denoise: 0.25,
          model: ["1", 0],
          latent_image: ["11", 0],
          seed: 1,
          steps: 8,
          cfg: 1,
        },
      },
      "9": {
        class_type: "VAEDecode",
        inputs: { samples: ["12", 0], vae: ["3", 0] },
      },
    };

    const result = stripLightningHiresPass(workflow, "qwen-image-2512-lightning-8");
    assert.deepEqual(
      (result.workflow["9"] as { inputs: { samples: unknown } }).inputs.samples,
      ["7", 0],
    );
    assert.deepEqual(result.strippedNodeIds.sort(), ["11", "12"]);
  });

  it("prepareLightningWorkflowForQueue is a no-op for non-lightning models", () => {
    const workflow = {
      "8": {
        class_type: "KSampler",
        inputs: { model: ["7", 0], steps: 28, cfg: 3.5 },
      },
    };
    assert.equal(
      prepareLightningWorkflowForQueue(workflow, "qwen-image-2512"),
      workflow,
    );
  });

  it("errors when lightning workflow lacks a LoraLoader", () => {
    const issues = auditLightningWorkflowIssues({
      model: "qwen-image-2512-lightning-8",
      // No loaders and no samplers — queue prep cannot insert a LoRA node.
      workflowJson: JSON.stringify({
        "9": { class_type: "SaveImage", inputs: { images: ["8", 0] } },
      }),
    });
    assert.equal(issues[0]?.severity, "error");
    assert.match(issues[0]?.message ?? "", /LoraLoader/i);
  });

  it("does not false-error when queue prep can insert Lightning LoRA onto UNET graphs", () => {
    const issues = auditLightningWorkflowIssues({
      model: "qwen-image-2512-lightning-8",
      workflowJson: JSON.stringify({
        "1": {
          class_type: "UNETLoader",
          inputs: { unet_name: "qwen_image_2512_bf16.safetensors" },
        },
        "8": {
          class_type: "KSampler",
          inputs: {
            model: ["1", 0],
            seed: 1,
            steps: 8,
            cfg: 1,
            denoise: 1,
          },
        },
      }),
      loraFilenames: {
        "{{LORA_LIGHTNING}}": "qwen_lightning_8steps.safetensors",
      },
    });
    assert.equal(
      issues.filter((issue) => /LoraLoader|Lightning LoRA mapped/i.test(issue.message))
        .length,
      0,
    );
  });

  it("inserts Lightning LoRA on SamplerCustom graphs via UNET consumers", () => {
    const workflow = {
      "1": { class_type: "UNETLoader", inputs: { unet_name: "qwen.safetensors" } },
      "2": { class_type: "CLIPLoader", inputs: { clip_name: "clip.safetensors", type: "qwen_image" } },
      "3": {
        class_type: "BasicGuider",
        inputs: { model: ["1", 0], conditioning: ["4", 0] },
      },
      "8": {
        class_type: "SamplerCustom",
        inputs: {
          guider: ["3", 0],
          noise: ["9", 0],
          sampler: ["10", 0],
          sigmas: ["11", 0],
          latent_image: ["6", 0],
        },
      },
    };

    const result = ensureLightningModelChainInWorkflow(
      workflow,
      "qwen-image-2512-lightning-8",
      { "{{LORA_LIGHTNING}}": "qwen_lightning_8steps.safetensors" },
    );

    const guider = result["3"] as { inputs: { model: [string, number] } };
    const auraId = guider.inputs.model[0];
    const aura = result[auraId] as {
      class_type: string;
      inputs: { model: [string, number]; shift: number };
    };
    assert.equal(aura.class_type, "ModelSamplingAuraFlow");
    const loraId = aura.inputs.model[0];
    const lora = result[loraId] as {
      class_type: string;
      inputs: { lora_name: string };
    };
    assert.match(lora.class_type, /LoraLoader/);
    assert.equal(lora.inputs.lora_name, "qwen_lightning_8steps.safetensors");
  });

  it("detects LoraLoader nodes", () => {
    assert.equal(
      workflowHasLoraLoader({
        "7": { class_type: "LoraLoader", inputs: { lora_name: "lightning.safetensors" } },
      }),
      true,
    );
  });

  it("disables non-lightning LoRA strengths at queue time", () => {
    const workflow = {
      "7": {
        class_type: "LoraLoader",
        inputs: {
          lora_name: "qwen_lightning_8steps.safetensors",
          strength_model: 1,
          strength_clip: 1,
        },
      },
      "8": {
        class_type: "LoraLoader",
        inputs: {
          lora_name: "nsfw_detail_v2.safetensors",
          strength_model: 0.8,
          strength_clip: 0.8,
        },
      },
    };
    const result = neutralizeNonLightningLoras(
      workflow,
      "qwen-image-2512-lightning-8",
    );
    assert.deepEqual(result.neutralizedNodeIds, ["8"]);
    assert.equal(
      (result.workflow["7"] as { inputs: { strength_model: number } }).inputs.strength_model,
      1,
    );
    assert.equal(
      (result.workflow["8"] as { inputs: { strength_model: number } }).inputs.strength_model,
      0,
    );
  });

  it("warns when non-lightning LoRAs are stacked in the workflow", () => {
    const issues = auditLightningWorkflowIssues({
      model: "qwen-image-2512-lightning-8",
      workflowJson: JSON.stringify({
        "7": {
          class_type: "LoraLoader",
          inputs: {
            lora_name: "qwen_lightning_8steps.safetensors",
            strength_model: 1,
          },
        },
        "8": {
          class_type: "LoraLoader",
          inputs: {
            lora_name: "nsfw_style.safetensors",
            strength_model: 0.7,
          },
        },
      }),
    });
    assert.ok(issues.some((issue) => /non-Lightning LoRAs/i.test(issue.message)));
  });
});

describe("lightning queue precision and sampling", () => {
  it("forces bf16 precision tier for lightning models", () => {
    const workflow = {
      "1": {
        class_type: "UNETLoader",
        inputs: { unet_name: "qwen_image_2512_fp8_e4m3fn.safetensors" },
      },
    };
    assert.equal(
      resolveLoaderPrecisionTier({
        workflow,
        model: "qwen-image-2512-lightning-8",
      }),
      "bf16",
    );
  });

  it("keeps official AuraFlow shift ~3 for lightning", () => {
    const kept = patchModelSamplingInWorkflow(
      {
        "7": {
          class_type: "ModelSamplingAuraFlow",
          inputs: { model: ["1", 0], shift: 3 },
        },
      },
      {},
      "qwen-image-2512-lightning-8",
    );
    assert.equal(
      (kept.workflow["7"] as { inputs: { shift: number } }).inputs.shift,
      3,
    );

    const recovered = patchModelSamplingInWorkflow(
      {
        "7": {
          class_type: "ModelSamplingAuraFlow",
          inputs: { model: ["1", 0], shift: 1 },
        },
      },
      {},
      "qwen-image-2512-lightning-8",
    );
    assert.equal(
      (recovered.workflow["7"] as { inputs: { shift: number } }).inputs.shift,
      3,
    );
  });

  it("applies lightning sampler defaults even when workflow has LoraLoader", () => {
    const workflow = {
      "7": { class_type: "LoraLoader", inputs: { lora_name: "lightning.safetensors" } },
      "8": {
        class_type: "KSampler",
        inputs: {
          seed: 42,
          steps: 28,
          cfg: 4,
          sampler_name: "dpmpp_2m",
          scheduler: "karras",
        },
      },
    };
    const result = patchSamplerParamsInWorkflow(
      workflow,
      { seed: 99, steps: 8, cfg: 1, samplerName: "euler", scheduler: "simple" },
      "qwen-image-2512-lightning-8",
    );
    const sampler = (result.workflow["8"] as { inputs: Record<string, unknown> }).inputs;
    assert.equal(sampler.seed, 99);
    assert.equal(sampler.steps, 8);
    assert.equal(sampler.cfg, 1);
    assert.equal(sampler.sampler_name, "euler");
    assert.equal(sampler.scheduler, "simple");
  });

  it("does not disable the only LoRA when no lightning LoRA is identified", () => {
    const workflow = {
      "8": {
        class_type: "LoraLoader",
        inputs: {
          lora_name: "mystery_style.safetensors",
          strength_model: 0.8,
        },
      },
    };
    const result = neutralizeNonLightningLoras(
      workflow,
      "qwen-image-2512-lightning-8",
    );
    assert.deepEqual(result.neutralizedNodeIds, []);
    assert.equal(
      (result.workflow["8"] as { inputs: { strength_model: number } }).inputs.strength_model,
      0.8,
    );
  });

  it("forces UNET bf16 at queue prep but leaves CLIP filenames alone", () => {
    const workflow = {
      "1": {
        class_type: "UNETLoader",
        inputs: {
          unet_name: "qwen_image_2512_fp8_e4m3fn.safetensors",
          weight_dtype: "fp8_e4m3fn",
        },
      },
      "2": {
        class_type: "CLIPLoader",
        inputs: {
          clip_name: "qwen_2.5_vl_7b_fp8_scaled.safetensors",
          type: "qwen_image",
        },
      },
      "6": {
        class_type: "EmptyLatentImage",
        inputs: { width: 1024, height: 1024, batch_size: 1 },
      },
      "7": {
        class_type: "LoraLoader",
        inputs: { lora_name: "qwen_lightning_8steps.safetensors", strength_model: 1 },
      },
    };
    const result = prepareLightningWorkflowForQueue(
      workflow,
      "qwen-image-2512-lightning-8",
      {},
      {
        params: { width: 1328, height: 1328 },
        loaders: {
          unet: "qwen_image_2512_bf16.safetensors",
          dualClip: "qwen_2.5_vl_7b_fp8_scaled.safetensors",
        },
      },
    );
    assert.equal(
      (result["1"] as { inputs: { unet_name: string; weight_dtype: string } }).inputs.unet_name,
      "qwen_image_2512_bf16.safetensors",
    );
    assert.equal(
      (result["1"] as { inputs: { weight_dtype: string } }).inputs.weight_dtype,
      "default",
    );
    assert.equal(
      (result["2"] as { inputs: { clip_name: string } }).inputs.clip_name,
      "qwen_2.5_vl_7b_fp8_scaled.safetensors",
    );
    // Lightning LoRA present — still apply queue latent size (avoids mosaic from stale 1024).
    assert.deepEqual(
      (result["6"] as { inputs: { width: number; height: number } }).inputs,
      { width: 1328, height: 1328, batch_size: 1 },
    );
  });

  it("does not rewrite T2I fp8 UNET to Edit when model id is edit-lightning", () => {
    const workflow = {
      "1": {
        class_type: "UNETLoader",
        inputs: {
          unet_name: "qwen_image_2512_fp8_e4m3fn.safetensors",
          weight_dtype: "fp8_e4m3fn",
        },
      },
      "7": {
        class_type: "LoraLoader",
        inputs: { lora_name: "qwen_lightning_8steps.safetensors", strength_model: 1 },
      },
    };
    const result = prepareLightningWorkflowForQueue(
      workflow,
      "qwen-image-edit-2511-lightning-8",
      {},
      {
        params: { width: 1328, height: 1328 },
        loaders: { unet: "qwen_image_edit_2511_bf16.safetensors" },
      },
    );
    assert.equal(
      (result["1"] as { inputs: { unet_name: string } }).inputs.unet_name,
      "qwen_image_2512_bf16.safetensors",
    );
  });

  it("realigns T2I Lightning LoRA to Edit LoRA for edit-2511 Lightning models", () => {
    const workflow = {
      "7": {
        class_type: "LoraLoaderModelOnly",
        inputs: {
          model: ["1", 0],
          lora_name: "Qwen-Image-Lightning-8steps-V2.0.safetensors",
          strength_model: 1,
        },
      },
      "11": {
        class_type: "ModelSamplingAuraFlow",
        inputs: { model: ["7", 0], shift: 3 },
      },
      "8": {
        class_type: "KSampler",
        inputs: {
          seed: 1,
          steps: 8,
          cfg: 1,
          denoise: 1,
          model: ["11", 0],
        },
      },
    };
    const result = prepareLightningWorkflowForQueue(
      workflow,
      "qwen-image-edit-2511-lightning-8",
      {
        "{{LORA_LIGHTNING}}":
          "Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors",
      },
    );
    assert.equal(
      (result["7"] as { inputs: { lora_name: string } }).inputs.lora_name,
      "Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors",
    );
  });

  it("passthrough still force-resizes latent on native-complete Lightning graphs", () => {
    const workflow = {
      "1": {
        class_type: "UNETLoader",
        inputs: {
          unet_name: "qwen_image_edit_2511_bf16.safetensors",
          weight_dtype: "default",
        },
      },
      "7": {
        class_type: "LoraLoader",
        inputs: {
          model: ["1", 0],
          lora_name: "Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors",
          strength_model: 1,
        },
      },
      "11": {
        class_type: "ModelSamplingAuraFlow",
        inputs: { model: ["7", 0], shift: 3.1 },
      },
      "6": {
        class_type: "EmptySD3LatentImage",
        inputs: { width: 1024, height: 1024, batch_size: 1 },
      },
      "8": {
        class_type: "KSampler",
        inputs: {
          seed: 1,
          steps: 8,
          cfg: 1,
          sampler_name: "euler",
          scheduler: "simple",
          denoise: 1,
          model: ["11", 0],
          latent_image: ["6", 0],
        },
      },
    };
    const result = prepareLightningWorkflowForQueue(
      workflow,
      "qwen-image-edit-2511-lightning-8",
      {},
      {
        params: { width: 1328, height: 1328 },
        loaders: { unet: "qwen_image_2512_bf16.safetensors" },
      },
    );
    assert.deepEqual(
      (result["6"] as { inputs: { width: number; height: number } }).inputs,
      { width: 1328, height: 1328, batch_size: 1 },
    );
    assert.equal(
      (result["1"] as { inputs: { unet_name: string } }).inputs.unet_name,
      "qwen_image_edit_2511_bf16.safetensors",
    );
    assert.equal(
      (result["11"] as { inputs: { model: [string, number] } }).inputs.model[0],
      "7",
    );
  });

  it("disconnects EditPlus reference images for Lightning txt2img queues", () => {
    const workflow = {
      "900": {
        class_type: "LoadImage",
        inputs: { image: "baked-ref.png" },
      },
      "4": {
        class_type: "TextEncodeQwenImageEditPlus",
        inputs: {
          prompt: "a scene",
          clip: ["2", 0],
          vae: ["3", 0],
          image1: ["900", 0],
        },
      },
      "5": {
        class_type: "TextEncodeQwenImageEditPlus",
        inputs: {
          prompt: "bad",
          clip: ["2", 0],
          vae: ["3", 0],
          image1: ["900", 0],
        },
      },
      "7": {
        class_type: "LoraLoaderModelOnly",
        inputs: {
          model: ["1", 0],
          lora_name: "Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors",
          strength_model: 1,
        },
      },
    };
    const result = prepareLightningWorkflowForQueue(
      workflow,
      "qwen-image-edit-2511-lightning-8",
      {
        "{{LORA_LIGHTNING}}":
          "Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors",
      },
      { params: { width: 1328, height: 1328 } },
    );
    assert.equal(
      "image1" in (result["4"] as { inputs: Record<string, unknown> }).inputs,
      false,
    );
    assert.equal(
      "image1" in (result["5"] as { inputs: Record<string, unknown> }).inputs,
      false,
    );
    assert.equal(result["900"], undefined);
  });

  it("forces Lightning LoRA model strength to 1 without changing CLIP strength", () => {
    const workflow = {
      "7": {
        class_type: "LoraLoader",
        inputs: {
          lora_name: "qwen_lightning_8steps.safetensors",
          strength_model: 0.65,
          strength_clip: 0.65,
        },
      },
    };
    const result = prepareLightningWorkflowForQueue(
      workflow,
      "qwen-image-2512-lightning-8",
    );
    const lora = (result["7"] as { inputs: Record<string, number> }).inputs;
    assert.equal(lora.strength_model, 1);
    assert.equal(lora.strength_clip, 0.65);
  });

  it("resolves {{LORA_LIGHTNING}} from custom tokens at queue prep", () => {
    const workflow = {
      "7": {
        class_type: "LoraLoader",
        inputs: { lora_name: "{{LORA_LIGHTNING}}", strength_model: 1 },
      },
    };
    const result = prepareLightningWorkflowForQueue(workflow, "qwen-image-2512-lightning-8", {
      "{{LORA_LIGHTNING}}": "qwen_lightning_8steps.safetensors",
    });
    assert.equal(
      (result["7"] as { inputs: { lora_name: string } }).inputs.lora_name,
      "qwen_lightning_8steps.safetensors",
    );
  });

  it("does not replace concrete LoRA filenames during auto-bind", () => {
    const workflowJson = JSON.stringify({
      "7": {
        class_type: "LoraLoader",
        inputs: { lora_name: "qwen_lightning_8steps.safetensors", strength_model: 1 },
      },
      "8": {
        class_type: "LoraLoader",
        inputs: { lora_name: "nsfw_style.safetensors", strength_model: 0.6 },
      },
    });
    const result = applyWorkflowNodeBindings(
      workflowJson,
      [],
      { positive: "{{POSITIVE}}", negative: "{{NEGATIVE}}" },
      { loraBindTokens: ["{{LORA_NSFW}}", "{{LORA_PORTRAIT}}"] },
    );
    const parsed = JSON.parse(result.json) as Record<
      string,
      { inputs: { lora_name: string } }
    >;
    assert.equal(parsed["7"].inputs.lora_name, "qwen_lightning_8steps.safetensors");
    assert.equal(parsed["8"].inputs.lora_name, "nsfw_style.safetensors");
  });
});
