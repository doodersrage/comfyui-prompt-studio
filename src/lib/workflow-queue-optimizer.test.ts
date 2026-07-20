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

  it("suggests optimized workflow names", () => {
    assert.equal(suggestedOptimizedWorkflowName("FLUX portrait"), "FLUX portrait (optimized)");
    assert.equal(
      suggestedOptimizedWorkflowName("FLUX portrait (optimized)"),
      "FLUX portrait (optimized)",
    );
  });
});
