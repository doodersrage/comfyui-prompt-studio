import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_POSITIVE_TOKEN,
  DEFAULT_SEED_TOKEN,
  DEFAULT_WIDTH_TOKEN,
} from "./comfyui-config.ts";
import {
  auditWorkflowStructure,
  optimizeWorkflowForQueue,
  suggestedOptimizedWorkflowName,
} from "./workflow-queue-optimizer.ts";
import { buildWorkflowScaffoldForModel } from "./workflow-scaffold.ts";
import { workflowContentHash } from "./workflow-content-hash.ts";

const FULL_TOKENS = {
  positive: DEFAULT_POSITIVE_TOKEN,
  negative: "{{NEGATIVE}}",
  seed: DEFAULT_SEED_TOKEN,
  width: DEFAULT_WIDTH_TOKEN,
  height: "{{HEIGHT}}",
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
};

describe("workflow-queue-optimizer", () => {
  it("auto-binds positive and sampler fields on unbound workflows", () => {
    const workflow = {
      "3": {
        class_type: "KSampler",
        inputs: { seed: 1, steps: 20, cfg: 7, sampler_name: "euler", scheduler: "normal" },
      },
      "5": {
        class_type: "EmptyLatentImage",
        inputs: { width: 512, height: 512 },
      },
      "6": {
        class_type: "CLIPTextEncode",
        _meta: { title: "Positive Prompt" },
        inputs: { text: "a portrait photo", clip: ["4", 0] },
      },
    };

    const result = optimizeWorkflowForQueue({
      workflow,
      tokens: FULL_TOKENS,
    });

    assert.ok(result.bindingChanges.length > 0);
    assert.match(result.workflowJson, /\{\{POSITIVE\}\}/);
    assert.match(result.workflowJson, /\{\{SEED\}\}/);
    assert.match(result.workflowJson, /\{\{WIDTH\}\}/);
    assert.equal(result.audit.hasPositivePlaceholder, true);
    assert.equal(result.audit.hasLatentSizeBinding, true);
    assert.equal(result.audit.hasSamplerBinding, true);
  });

  it("leaves already-bound workflows unchanged", () => {
    const result = optimizeWorkflowForQueue({
      workflow: {
        "6": {
          class_type: "CLIPTextEncode",
          inputs: { text: DEFAULT_POSITIVE_TOKEN, clip: ["4", 0] },
        },
      },
      tokens: FULL_TOKENS,
    });

    assert.equal(result.bindingChanges.length, 0);
  });

  it("warns when checkpoint loader lacks token bindings", () => {
    const audit = auditWorkflowStructure(
      JSON.stringify({
        "4": {
          class_type: "CheckpointLoaderSimple",
          inputs: { ckpt_name: "model.safetensors" },
        },
      }),
      FULL_TOKENS,
    );

    assert.equal(audit.hasCheckpointBinding, false);
    assert.match(audit.warnings.join(" "), /CHECKPOINT|UNET/i);
  });

  it("does not overwrite an existing negative prompt token", () => {
    const result = optimizeWorkflowForQueue({
      workflow: {
        "6": {
          class_type: "CLIPTextEncode",
          inputs: { text: DEFAULT_POSITIVE_TOKEN, clip: ["4", 0] },
        },
        "7": {
          class_type: "CLIPTextEncode",
          inputs: { text: "{{NEGATIVE}}", clip: ["4", 0] },
        },
      },
      tokens: FULL_TOKENS,
    });

    assert.match(result.workflowJson, /\{\{NEGATIVE\}\}/);
    assert.doesNotMatch(result.workflowJson, /\{\{POSITIVE\}\}.*\{\{POSITIVE\}\}/);
  });

  it("resolves model-sampling shift placeholders during optimize", () => {
    const result = optimizeWorkflowForQueue({
      workflow: {
        "2": {
          class_type: "ModelSamplingAuraFlow",
          inputs: { model: ["1", 0], shift: "{{SHIFT}}" },
        },
      },
      tokens: FULL_TOKENS,
      model: "flux-2-klein-9b-distilled",
    });

    assert.equal(
      (result.workflow["2"] as { inputs: { shift: number } }).inputs.shift,
      1.73,
    );
    assert.doesNotMatch(result.workflowJson, /\{\{SHIFT\}\}/);
  });

  it("skips Final/Max enrich for Lightning even when skipIfUnchanged hash matches", () => {
    const scaffold = buildWorkflowScaffoldForModel("qwen-image-2512-lightning-8");
    const workflow = JSON.parse(scaffold.json) as Record<string, unknown>;
    const workflowJson = JSON.stringify(workflow, null, 2);
    const contentHash = workflowContentHash(workflowJson);

    const result = optimizeWorkflowForQueue({
      workflow,
      tokens: FULL_TOKENS,
      model: "qwen-image-2512-lightning-8",
      qualityProfile: "final",
      skipIfUnchanged: true,
      contentHash,
    });

    assert.doesNotMatch(result.workflowJson, /Prompt Studio — output upscale/);
    assert.match(
      result.changes.map((change) => change.message).join(" "),
      /skipped auto-bind\/enrich/i,
    );
  });

  it("does not insert Lightning Lanczos polish — keep native ComfyUI graph", () => {
    const scaffold = buildWorkflowScaffoldForModel("qwen-image-2512-lightning-8");
    const workflow = JSON.parse(scaffold.json) as Record<string, unknown>;

    const result = optimizeWorkflowForQueue({
      workflow,
      tokens: FULL_TOKENS,
      model: "qwen-image-2512-lightning-8",
      qualityProfile: "max",
    });

    assert.doesNotMatch(result.workflowJson, /Prompt Studio — output upscale/);
    assert.doesNotMatch(result.workflowJson, /Prompt Studio — Lightning upscale polish/);
    assert.match(result.workflowJson, /LoraLoaderModelOnly|LoraLoader/);
    assert.match(result.workflowJson, /ModelSamplingAuraFlow/);
  });

  it("does not insert Lightning upscale enrich on draft quality", async () => {
    const { enrichWorkflowGraph } = await import("./workflow-graph-enrich.ts");
    const workflow = {
      "7": {
        class_type: "KSampler",
        inputs: {
          seed: 1,
          steps: 8,
          cfg: 1,
          sampler_name: "euler",
          scheduler: "simple",
          denoise: 1,
          model: ["1", 0],
          positive: ["4", 0],
          negative: ["5", 0],
          latent_image: ["6", 0],
        },
      },
      "9": {
        class_type: "VAEDecode",
        inputs: { samples: ["7", 0], vae: ["3", 0] },
      },
      "10": {
        class_type: "SaveImage",
        inputs: { images: ["9", 0], filename_prefix: "x" },
      },
    };
    const result = enrichWorkflowGraph({
      workflow,
      tokens: FULL_TOKENS,
      model: "qwen-image-2512-lightning-8",
      qualityProfile: "draft",
    });
    assert.equal(result.changes.length, 0);
    assert.doesNotMatch(JSON.stringify(result.workflow), /output upscale/);
  });

  it("normalizes EmptyLatent for Lightning imports without Final enrich", () => {
    const workflow = {
      "1": {
        class_type: "UNETLoader",
        inputs: { unet_name: "qwen_image_2512_bf16.safetensors" },
      },
      "6": {
        class_type: "EmptyLatentImage",
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
          model: ["1", 0],
          positive: ["4", 0],
          negative: ["5", 0],
          latent_image: ["6", 0],
        },
      },
      "9": {
        class_type: "VAEDecode",
        inputs: { samples: ["8", 0], vae: ["3", 0] },
      },
      "10": {
        class_type: "SaveImage",
        inputs: { images: ["9", 0], filename_prefix: "ComfyUI" },
      },
    };

    const result = optimizeWorkflowForQueue({
      workflow,
      tokens: FULL_TOKENS,
      model: "qwen-image-2512-lightning-8",
      qualityProfile: "final",
    });

    assert.match(result.workflowJson, /EmptySD3LatentImage/);
    assert.doesNotMatch(result.workflowJson, /Prompt Studio — output upscale/);
  });

  it("inserts model sampling on imported vanilla Qwen graphs without placeholders", () => {
    const workflow = {
      "1": {
        class_type: "UNETLoader",
        inputs: { unet_name: "qwen_image_2512_bf16.safetensors" },
      },
      "8": {
        class_type: "KSampler",
        inputs: {
          seed: 1,
          steps: 20,
          cfg: 2.5,
          sampler_name: "euler",
          scheduler: "simple",
          denoise: 1,
          model: ["1", 0],
          positive: ["4", 0],
          negative: ["5", 0],
          latent_image: ["6", 0],
        },
      },
      "9": {
        class_type: "VAEDecode",
        inputs: { samples: ["8", 0], vae: ["3", 0] },
      },
      "10": {
        class_type: "SaveImage",
        inputs: { images: ["9", 0], filename_prefix: "ComfyUI" },
      },
    };

    const result = optimizeWorkflowForQueue({
      workflow,
      tokens: FULL_TOKENS,
      model: "qwen-image-2512",
      qualityProfile: "draft",
      enrichSdxlRefiner: false,
      enrichSharpen: false,
    });

    assert.match(result.workflowJson, /ModelSamplingAuraFlow/);
  });

  it("suggests optimized workflow names", () => {
    assert.equal(suggestedOptimizedWorkflowName("FLUX portrait"), "FLUX portrait (optimized)");
    assert.equal(
      suggestedOptimizedWorkflowName("FLUX portrait (optimized)"),
      "FLUX portrait (optimized)",
    );
  });
});
