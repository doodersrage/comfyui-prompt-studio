import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ComfyWorkflowFile } from "./comfyui-workflow-files.ts";
import { DEFAULT_SHARED_SETTINGS } from "./settings-cache.ts";
import {
  applySystemWorkflowToRuntime,
  buildSystemWorkflowQueueParams,
  describeSystemWorkflowChoice,
  isSystemWorkflowSupportedModel,
  listSystemWorkflowSupportedModels,
  pickPackWorkflowForModel,
  resolveSystemLoaderMaps,
  resolveSystemWorkflowFallbackModel,
  resolveSystemWorkflowForModel,
  softBindScaffoldFromInventory,
  softRepairPackLoadersFromInventory,
} from "./system-workflow-runtime.ts";
import { buildWorkflowScaffoldForModel } from "./workflow-scaffold.ts";

function fakeWorkflow(
  partial: Partial<ComfyWorkflowFile> & Pick<ComfyWorkflowFile, "id" | "name">,
): ComfyWorkflowFile {
  return {
    id: partial.id,
    name: partial.name,
    filename: partial.filename,
    workflowJson: partial.workflowJson ?? "{}",
    createdAt: partial.createdAt ?? Date.now(),
  };
}

describe("system-workflow-runtime", () => {
  const emptyInventory = {
    checkpoints: [] as string[],
    unets: [] as string[],
    vaes: [] as string[],
    clips: [] as string[],
    dualClipTypes: [] as string[],
    clipLoaderTypes: [] as string[],
    loras: [] as string[],
    upscaleModels: [] as string[],
    controlNets: [] as string[],
  };

  it("prefers a pack graph with bound Qwen loaders over scaffold labels", () => {
    const scaffold = fakeWorkflow({
      id: "scaffold-1",
      name: "Qwen Image scaffold",
      workflowJson: buildWorkflowScaffoldForModel("qwen-image-2512").json,
    });
    const pack = fakeWorkflow({
      id: "pack-1",
      name: "qwen-image-2512 official t2i",
      filename: "qwen_2512_txt2img.json",
      workflowJson: JSON.stringify({
        "1": {
          class_type: "UNETLoader",
          inputs: { unet_name: "qwen_image_2512_bf16.safetensors" },
        },
        "2": {
          class_type: "CLIPLoader",
          inputs: {
            clip_name: "qwen_2.5_vl_7b.safetensors",
            type: "qwen_image",
          },
        },
        "3": {
          class_type: "VAELoader",
          inputs: { vae_name: "qwen_image_vae.safetensors" },
        },
      }),
    });

    const picked = pickPackWorkflowForModel("qwen-image-2512", [scaffold, pack], {
      ...emptyInventory,
      unets: ["qwen_image_2512_bf16.safetensors"],
      clips: ["qwen_2.5_vl_7b.safetensors"],
      vaes: ["qwen_image_vae.safetensors"],
    });
    assert.equal(picked?.file.id, "pack-1");
  });

  it("prefers a WAN pack graph with I2V nodes", () => {
    const scaffold = fakeWorkflow({
      id: "wan-scaffold",
      name: "WAN Video scaffold",
      workflowJson: buildWorkflowScaffoldForModel("wan-video").json,
    });
    const pack = fakeWorkflow({
      id: "wan-pack",
      name: "wan 2.1 t2v pack",
      filename: "wan_video_workflow.json",
      workflowJson: JSON.stringify({
        "1": {
          class_type: "CheckpointLoaderSimple",
          inputs: { ckpt_name: "wan2.1_t2v_1.3B_fp8_scaled.safetensors" },
        },
        "2": {
          class_type: "EmptyHunyuanLatentVideo",
          inputs: { width: 832, height: 480, length: 81 },
        },
        "3": {
          class_type: "WanImageToVideo",
          inputs: { start_image: ["4", 0] },
        },
      }),
    });

    const picked = pickPackWorkflowForModel("wan-video", [scaffold, pack], {
      ...emptyInventory,
      checkpoints: ["wan2.1_t2v_1.3B_fp8_scaled.safetensors"],
    });
    assert.equal(picked?.file.id, "wan-pack");
  });

  it("skips packs until inventory is available (cold start)", () => {
    const pack = fakeWorkflow({
      id: "pack-1",
      name: "qwen-image-2512 official t2i",
      filename: "qwen_2512_txt2img.json",
      workflowJson: JSON.stringify({
        "1": {
          class_type: "UNETLoader",
          inputs: { unet_name: "qwen_image_2512_bf16.safetensors" },
        },
      }),
    });
    assert.equal(pickPackWorkflowForModel("qwen-image-2512", [pack], null), null);
  });

  it("falls back to scaffold when library has no pack-worthy graph", () => {
    const unrelated = fakeWorkflow({
      id: "sdxl-only",
      name: "sdxl base",
      workflowJson: JSON.stringify({
        "1": {
          class_type: "CheckpointLoaderSimple",
          inputs: { ckpt_name: "sd_xl_base_1.0.safetensors" },
        },
      }),
    });
    const resolved = resolveSystemWorkflowForModel(
      "qwen-image-2512",
      DEFAULT_SHARED_SETTINGS,
      [unrelated],
      null,
    );
    assert.equal(resolved.source, "scaffold");
    assert.match(resolved.workflowJson, /UNETLoader/);
    assert.ok(resolved.queueParams.steps);
  });

  it("seeds family sampler presets into system queue params", () => {
    const params = buildSystemWorkflowQueueParams("wan-video", {
      ...DEFAULT_SHARED_SETTINGS,
      queueQualityProfile: "final",
    });
    assert.equal(params.samplerName, "uni_pc");
    assert.ok(Number(params.steps) >= 20);
  });

  it("uses full max sampler tier when queue quality is Max", () => {
    const draft = buildSystemWorkflowQueueParams("qwen-image-2512", {
      ...DEFAULT_SHARED_SETTINGS,
      queueQualityProfile: "draft",
      modelSamplerPreset: "base",
    });
    const max = buildSystemWorkflowQueueParams("qwen-image-2512", {
      ...DEFAULT_SHARED_SETTINGS,
      queueQualityProfile: "max",
      modelSamplerPreset: "base",
    });
    assert.equal(Number(draft.steps), 20);
    assert.equal(Number(max.steps), 50);
    assert.ok(Number(max.steps) > Number(draft.steps));
  });

  it("forces Max graph polish flags on system workflows", () => {
    const runtime = applySystemWorkflowToRuntime(
      "flux-dev",
      {
        ...DEFAULT_SHARED_SETTINGS,
        useSystemWorkflows: true,
        queueQualityProfile: "max",
        workflowSharpenAfterUpscale: true,
        workflowNeuralUpscalePolish: false,
      },
      [],
      {
        workflowGraphEnrich: true,
        workflowSdxlRefinerEnrich: false,
        workflowNeuralUpscalePolish: false,
        workflowSharpenAfterUpscale: false,
      },
    );
    assert.equal(runtime.workflowNeuralUpscalePolish, true);
    assert.equal(runtime.workflowSharpenAfterUpscale, true);
    assert.equal(runtime.workflowSdxlRefinerEnrich, true);
    assert.equal(runtime.queueQualityProfile, "max");
  });

  it("fills checkpoint map from inventory for the target model", () => {
    const loaders = resolveSystemLoaderMaps(
      "qwen-image-2512",
      { ...DEFAULT_SHARED_SETTINGS, modelCheckpointMap: {} },
      {
        checkpoints: [],
        unets: ["qwen_image_2512_bf16.safetensors"],
        vaes: ["qwen_image_vae.safetensors"],
        clips: [],
        dualClipTypes: [],
        clipLoaderTypes: [],
        loras: [],
        upscaleModels: [],
        controlNets: [],
      },
    );
    assert.equal(
      loaders.modelCheckpointMap["qwen-image-2512"],
      "qwen_image_2512_bf16.safetensors",
    );
    assert.equal(
      loaders.modelVaeMap["qwen-image-2512"],
      "qwen_image_vae.safetensors",
    );
  });

  it("limits system support to FLUX, Qwen, and video families", () => {
    assert.equal(isSystemWorkflowSupportedModel("qwen-image-2512"), true);
    assert.equal(isSystemWorkflowSupportedModel("flux-dev"), true);
    assert.equal(isSystemWorkflowSupportedModel("wan-video"), true);
    assert.equal(isSystemWorkflowSupportedModel("sdxl"), false);
    assert.equal(isSystemWorkflowSupportedModel("hunyuan-dit"), false);
    assert.equal(resolveSystemWorkflowFallbackModel("sdxl"), "qwen-image-2512");
    assert.ok(listSystemWorkflowSupportedModels().every(isSystemWorkflowSupportedModel));
  });

  it("rejects packs whose loaders are missing from inventory", () => {
    const pack = fakeWorkflow({
      id: "missing-loaders",
      name: "qwen-image-2512 official t2i",
      filename: "qwen_2512_txt2img.json",
      workflowJson: JSON.stringify({
        "1": {
          class_type: "UNETLoader",
          inputs: { unet_name: "qwen_image_2512_bf16.safetensors" },
        },
      }),
    });
    assert.equal(
      pickPackWorkflowForModel("qwen-image-2512", [pack], {
        checkpoints: [],
        unets: ["other_unet.safetensors"],
        vaes: [],
        clips: [],
        dualClipTypes: [],
        clipLoaderTypes: [],
        loras: [],
        upscaleModels: [],
        controlNets: [],
      }),
      null,
    );
  });

  it("soft-binds Qwen CLIP and Lightning LoRA from inventory", () => {
    const scaffold = buildWorkflowScaffoldForModel("qwen-image-2512-lightning-8");
    const bound = softBindScaffoldFromInventory(
      scaffold.json,
      "qwen-image-2512-lightning-8",
      {
        checkpoints: [],
        unets: [],
        vaes: ["qwen_image_vae.safetensors"],
        clips: ["qwen_2.5_vl_7b_bf16.safetensors"],
        dualClipTypes: [],
        clipLoaderTypes: [],
        loras: ["Qwen-Image-Lightning-8steps-V2.0.safetensors"],
        upscaleModels: [],
        controlNets: [],
      },
    );
    assert.match(bound.workflowJson, /qwen_2\.5_vl_7b_bf16\.safetensors/);
    assert.equal(
      bound.lightningLora,
      "Qwen-Image-Lightning-8steps-V2.0.safetensors",
    );
  });

  it("soft-binds Klein DualCLIP stem (not Dev clip_l/t5)", () => {
    const scaffold = buildWorkflowScaffoldForModel("flux-2-klein-9b");
    assert.match(scaffold.json, /flux2-klein-9b-uncensored/);
    assert.doesNotMatch(scaffold.json, /clip_l\.safetensors/);
    const bound = softBindScaffoldFromInventory(
      scaffold.json,
      "flux-2-klein-9b",
      {
        ...emptyInventory,
        unets: ["flux-2-klein-base-9b.safetensors"],
        clips: [
          "clip_l.safetensors",
          "t5xxl_fp16.safetensors",
          "flux2-klein-9b-uncensored.safetensors",
        ],
        vaes: ["flux2-vae.safetensors"],
      },
    );
    assert.match(bound.workflowJson, /flux2-klein-9b-uncensored/);
    assert.doesNotMatch(bound.workflowJson, /"clip_l\.safetensors"/);
  });

  it("switches scaffold to UnetLoaderGGUF and sets fp8 weight_dtype from inventory", () => {
    const scaffold = buildWorkflowScaffoldForModel("flux-dev");
    const gguf = softBindScaffoldFromInventory(scaffold.json, "flux-dev", {
      ...emptyInventory,
      unets: ["flux1-dev-Q4_K_S.gguf"],
      clips: ["clip_l.safetensors", "t5xxl_fp16.safetensors"],
      vaes: ["ae.safetensors"],
    });
    assert.match(gguf.workflowJson, /UnetLoaderGGUF/);
    assert.doesNotMatch(gguf.workflowJson, /"weight_dtype"/);

    const fp8 = softBindScaffoldFromInventory(
      buildWorkflowScaffoldForModel("qwen-image-2512").json,
      "qwen-image-2512",
      {
        ...emptyInventory,
        unets: ["qwen_image_2512_fp8_e4m3fn.safetensors"],
        clips: ["qwen_2.5_vl_7b_fp8_scaled.safetensors"],
        vaes: ["qwen_image_vae.safetensors"],
      },
    );
    assert.match(fp8.workflowJson, /"weight_dtype": "fp8_e4m3fn"/);
    assert.match(fp8.workflowJson, /qwen_2\.5_vl_7b_fp8_scaled/);
  });

  it("disables graph enrich on Draft system queues", () => {
    const runtime = applySystemWorkflowToRuntime(
      "flux-dev",
      {
        ...DEFAULT_SHARED_SETTINGS,
        useSystemWorkflows: true,
        queueQualityProfile: "draft",
      },
      [],
      { workflowGraphEnrich: true },
    );
    assert.equal(runtime.workflowGraphEnrich, false);
    assert.equal(runtime.systemWorkflowSource, "scaffold");
  });

  it("accepts near-miss packs and soft-repairs fp8↔bf16 loaders", () => {
    const pack = fakeWorkflow({
      id: "near-miss",
      name: "qwen-image-2512 official t2i",
      filename: "qwen_2512_txt2img.json",
      workflowJson: JSON.stringify({
        "1": {
          class_type: "UNETLoader",
          inputs: {
            unet_name: "qwen_image_2512_bf16.safetensors",
            weight_dtype: "default",
          },
        },
        "2": {
          class_type: "CLIPLoader",
          inputs: {
            clip_name: "qwen_2.5_vl_7b.safetensors",
            type: "qwen_image",
          },
        },
        "3": {
          class_type: "VAELoader",
          inputs: { vae_name: "qwen_image_vae.safetensors" },
        },
      }),
    });
    const inventory = {
      ...emptyInventory,
      unets: ["qwen_image_2512_fp8_e4m3fn.safetensors"],
      clips: ["qwen_2.5_vl_7b_fp8_scaled.safetensors"],
      vaes: ["qwen_image_vae.safetensors"],
    };
    assert.equal(
      pickPackWorkflowForModel("qwen-image-2512", [pack], inventory)?.file.id,
      "near-miss",
    );
    const repaired = softRepairPackLoadersFromInventory(
      pack.workflowJson!,
      "qwen-image-2512",
      inventory,
    );
    assert.ok(repaired.repaired >= 1);
    assert.match(repaired.workflowJson, /qwen_image_2512_fp8_e4m3fn/);
  });

  it("prefers I2V packs when preferI2v is set", () => {
    const t2v = fakeWorkflow({
      id: "wan-t2v",
      name: "wan 2.1 t2v pack",
      filename: "wan_video_t2v_workflow.json",
      workflowJson: JSON.stringify({
        "1": {
          class_type: "CheckpointLoaderSimple",
          inputs: { ckpt_name: "wan2.1_t2v_1.3B_fp8_scaled.safetensors" },
        },
        "2": {
          class_type: "EmptyHunyuanLatentVideo",
          inputs: { width: 832, height: 480, length: 81 },
        },
      }),
    });
    const i2v = fakeWorkflow({
      id: "wan-i2v",
      name: "wan 2.1 i2v pack",
      filename: "wan_video_i2v_workflow.json",
      workflowJson: JSON.stringify({
        "1": {
          class_type: "CheckpointLoaderSimple",
          inputs: { ckpt_name: "wan2.1_t2v_1.3B_fp8_scaled.safetensors" },
        },
        "2": {
          class_type: "EmptyHunyuanLatentVideo",
          inputs: { width: 832, height: 480, length: 81 },
        },
        "3": {
          class_type: "WanImageToVideo",
          inputs: { start_image: ["4", 0] },
        },
      }),
    });
    const inventory = {
      ...emptyInventory,
      checkpoints: ["wan2.1_t2v_1.3B_fp8_scaled.safetensors"],
    };
    assert.equal(
      pickPackWorkflowForModel("wan-video", [t2v, i2v], inventory, {
        preferI2v: true,
      })?.file.id,
      "wan-i2v",
    );
  });

  it("describes cold-start and missing-loader scaffold reasons", () => {
    const pack = fakeWorkflow({
      id: "blocked",
      name: "qwen-image-2512 official t2i",
      filename: "qwen_2512.json",
      workflowJson: JSON.stringify({
        "1": {
          class_type: "UNETLoader",
          inputs: { unet_name: "qwen_image_2512_bf16.safetensors" },
        },
      }),
    });
    const cold = describeSystemWorkflowChoice("qwen-image-2512", [pack], null);
    assert.equal(cold.reason, "cold-start");
    assert.match(cold.display, /waiting for Comfy inventory/i);

    const missing = describeSystemWorkflowChoice("qwen-image-2512", [pack], {
      ...emptyInventory,
      unets: ["totally_unrelated.safetensors"],
    });
    assert.equal(missing.reason, "missing-loaders");
    assert.match(missing.display, /pack loaders not installed/i);
  });

  it("soft-binds video CheckpointLoader from inventory", () => {
    const scaffold = buildWorkflowScaffoldForModel("wan-video");
    const bound = softBindScaffoldFromInventory(scaffold.json, "wan-video", {
      ...emptyInventory,
      checkpoints: ["wan2.1_t2v_1.3B_fp8_scaled.safetensors"],
    });
    assert.match(bound.workflowJson, /wan2\.1_t2v_1\.3B_fp8_scaled/);
    assert.doesNotMatch(bound.workflowJson, /\{\{CHECKPOINT\}\}/);
  });

  it("soft-repairs hardcoded Lightning LoRA filenames on packs", () => {
    const json = JSON.stringify({
      "1": {
        class_type: "UNETLoader",
        inputs: { unet_name: "qwen_image_2512_bf16.safetensors" },
      },
      "2": {
        class_type: "LoraLoaderModelOnly",
        inputs: {
          lora_name: "missing_lightning_8steps.safetensors",
          strength_model: 1,
        },
      },
    });
    const repaired = softRepairPackLoadersFromInventory(
      json,
      "qwen-image-2512-lightning-8",
      {
        ...emptyInventory,
        unets: ["qwen_image_2512_bf16.safetensors"],
        loras: ["Qwen-Image-Lightning-8steps-V2.0.safetensors"],
      },
    );
    assert.match(
      repaired.workflowJson,
      /Qwen-Image-Lightning-8steps-V2\.0\.safetensors/,
    );
    assert.ok(repaired.repaired >= 1);
  });
});
