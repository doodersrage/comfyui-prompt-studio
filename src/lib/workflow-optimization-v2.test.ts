import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyWorkflowNodeBindings } from "./workflow-apply-bindings.ts";
import { patchSamplerParamsInWorkflow } from "./comfyui-config.ts";
import { shouldSkipGlobalSamplerPatch } from "./workflow-enrich-markers.ts";
import { inferLoadImageBinding } from "./workflow-load-image-bindings.ts";
import { auditWorkflowNodeTypes } from "./workflow-node-type-audit.ts";
import { runWorkflowPreflightSync } from "./workflow-preflight-sync.ts";
import { diffWorkflowNodes } from "./workflow-diff.ts";
import { enrichWorkflowGraph } from "./workflow-graph-enrich.ts";
import { DEFAULT_POSITIVE_TOKEN, DEFAULT_NEGATIVE_TOKEN } from "./comfyui-config.ts";

describe("workflow optimization v2", () => {
  it("binds Qwen prompt-field encoders", () => {
    const workflow = {
      "1": {
        class_type: "TextEncodeQwenImageEditPlus",
        inputs: { prompt: "literal prompt", clip: ["2", 0] },
      },
    };

    const applied = applyWorkflowNodeBindings(
      JSON.stringify(workflow),
      [
        {
          nodeId: "1",
          classType: "TextEncodeQwenImageEditPlus",
          suggestedBinding: "positive",
          reason: "test",
        },
      ],
      { positive: DEFAULT_POSITIVE_TOKEN, negative: DEFAULT_NEGATIVE_TOKEN },
    );

    assert.match(applied.json, /"prompt": "{{POSITIVE}}"/);
  });

  it("skips protected refiner sampler params", () => {
    const workflow = {
      "1": {
        class_type: "KSampler",
        _meta: { title: "Prompt Studio — SDXL refiner pass" },
        inputs: { seed: 1, steps: 20, cfg: 5.5, denoise: 0.35 },
      },
      "2": {
        class_type: "KSampler",
        inputs: { seed: 1, steps: 20, cfg: 7, denoise: 1 },
      },
    };

    assert.equal(
      shouldSkipGlobalSamplerPatch(workflow["1"] as { class_type?: string; _meta?: { title?: string }; inputs?: Record<string, unknown> }),
      true,
    );

    const patched = patchSamplerParamsInWorkflow(workflow, {
      seed: 999,
      steps: 8,
      cfg: 3,
      denoise: 0.8,
    });
    const refiner = patched.workflow["1"] as { inputs?: { cfg?: number; denoise?: number } };
    const base = patched.workflow["2"] as { inputs?: { cfg?: number; denoise?: number } };
    assert.equal(refiner.inputs?.cfg, 5.5);
    assert.equal(refiner.inputs?.denoise, 0.35);
    assert.equal(base.inputs?.cfg, 3);
  });

  it("inserts model sampling through lora chains", () => {
    const workflow = {
      "1": { class_type: "UNETLoader", inputs: { unet_name: "flux-2-klein-9b.safetensors" } },
      "2": {
        class_type: "LoraLoader",
        inputs: { model: ["1", 0], lora_name: "test.safetensors" },
      },
      "3": {
        class_type: "KSampler",
        inputs: { model: ["2", 0], seed: 1, steps: 20, cfg: 1 },
      },
    };

    const enriched = enrichWorkflowGraph({
      workflow,
      tokens: {
        positive: "{{POSITIVE}}",
        negative: "{{NEGATIVE}}",
        seed: "{{SEED}}",
        width: "{{WIDTH}}",
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
      },
      model: "flux-2-klein-9b",
    });

    const sampler = enriched.workflow["3"] as { inputs?: { model?: unknown[] } };
    const patchId = sampler.inputs?.model?.[0];
    assert.ok(typeof patchId === "string");
    assert.ok(enriched.workflow[patchId]?.class_type?.includes("ModelSampling"));
  });

  it("maps third load image nodes for multi-ref edits", () => {
    assert.equal(
      inferLoadImageBinding("LoadImage", "Figure 2 reference", {
        loadImageIndex: 2,
        loadImageCount: 3,
      }),
      "inputImage2",
    );
  });

  it("flags missing custom node types", () => {
    const issues = auditWorkflowNodeTypes({
      workflowJson: JSON.stringify({
        "1": { class_type: "MissingCustomNode", inputs: {} },
      }),
      knownNodeTypes: new Set(["KSampler", "UNETLoader"]),
    });
    assert.equal(issues.length, 1);
    assert.match(issues[0]?.message ?? "", /MissingCustomNode/);
  });

  it("runs sync preflight for mixed stacks", () => {
    const workflow = JSON.stringify({
      "1": {
        class_type: "UNETLoader",
        inputs: { unet_name: "qwen_image_2512_bf16.safetensors" },
      },
      "2": {
        class_type: "DualCLIPLoader",
        inputs: {
          clip_name1: "flux2-klein-9b-uncensored.safetensors",
          clip_name2: "flux2-klein-9b-uncensored.safetensors",
        },
      },
    });

    const result = runWorkflowPreflightSync({
      workflowJson: workflow,
      model: "qwen-image-2512",
    });
    assert.equal(result.ok, false);
  });

  it("fails sync preflight when workflow loaders are missing from ComfyUI inventory", () => {
    const workflow = JSON.stringify({
      "1": {
        class_type: "UpscaleModelLoader",
        inputs: { model_name: "missing-upscaler.pth" },
      },
    });

    const result = runWorkflowPreflightSync({
      workflowJson: workflow,
      model: "qwen-image-2512",
      models: {
        checkpoints: [],
        unets: [],
        vaes: [],
        upscaleModels: ["4x-UltraSharp.pth"],
        clips: [],
        dualClipTypes: [],
        clipLoaderTypes: [],
        loras: [],
        controlNets: [],
      },
    });
    assert.equal(result.ok, false);
    assert.ok(
      result.issues.some((issue) => /missing-upscaler\.pth/i.test(issue.message)),
    );
  });

  it("warns when object_info is unavailable", () => {
    const result = runWorkflowPreflightSync({
      workflowJson: JSON.stringify({
        "1": { class_type: "EmptySD3LatentImage", inputs: { width: 1, height: 1 } },
      }),
      model: "qwen-image-2512",
      objectInfoUnavailable: true,
    });
    assert.equal(result.ok, true);
    assert.ok(
      result.issues.some((issue) => /object_info unavailable/i.test(issue.message)),
    );
  });

  it("fails Lightning preflight when object_info is unavailable", () => {
    const result = runWorkflowPreflightSync({
      workflowJson: JSON.stringify({
        "1": {
          class_type: "LoraLoader",
          inputs: { lora_name: "qwen_lightning_8steps.safetensors", strength_model: 1 },
        },
        "2": {
          class_type: "ModelSamplingAuraFlow",
          inputs: { model: ["1", 0], shift: 3.1 },
        },
        "3": {
          class_type: "KSampler",
          inputs: {
            model: ["2", 0],
            seed: 1,
            steps: 8,
            cfg: 1,
            sampler_name: "euler",
            scheduler: "simple",
            denoise: 1,
            positive: ["4", 0],
            negative: ["5", 0],
            latent_image: ["6", 0],
          },
        },
      }),
      model: "qwen-image-2512-lightning-8",
      objectInfoUnavailable: true,
    });
    assert.equal(result.ok, false);
    assert.ok(
      result.issues.some(
        (issue) =>
          issue.severity === "error" && /object_info unavailable/i.test(issue.message),
      ),
    );
  });

  it("diffs workflow nodes after optimize", () => {
    const left = JSON.stringify({ "1": { class_type: "KSampler", inputs: { seed: 1 } } });
    const right = JSON.stringify({
      "1": { class_type: "KSampler", inputs: { seed: "{{SEED}}" } },
      "2": { class_type: "ModelSamplingFlux", inputs: { model: ["1", 0] } },
    });
    const diff = diffWorkflowNodes(left, right);
    assert.ok(diff.some((entry) => entry.change === "added"));
    assert.ok(diff.some((entry) => entry.change === "modified"));
  });
});
