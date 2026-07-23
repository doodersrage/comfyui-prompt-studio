import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyLoraStackToWorkflow,
  chainLoraStackInWorkflow,
  describeLoraStack,
  loraStackLintWarning,
  normalizeLoraLibrary,
  normalizeLoraLibraryEntry,
  resolveActiveLoraStack,
  type LoraLibraryEntry,
} from "./lora-stack.ts";

function makeEntry(overrides: Partial<LoraLibraryEntry> = {}): LoraLibraryEntry {
  return {
    id: "portrait",
    label: "Portrait",
    triggerPhrase: "",
    tokenValue: "portrait_v1.safetensors",
    ...overrides,
  };
}

describe("lora-stack normalization", () => {
  it("fills strength/enabled defaults on a bare entry", () => {
    const normalized = normalizeLoraLibraryEntry(makeEntry());
    assert.equal(normalized.strengthModel, 1);
    assert.equal(normalized.strengthClip, 1);
    assert.equal(normalized.enabled, true);
    assert.equal(normalized.autoFromPrompt, false);
  });

  it("clamps strengths into the 0–2 range", () => {
    const normalized = normalizeLoraLibraryEntry(
      makeEntry({ strengthModel: 5, strengthClip: -3 }),
    );
    assert.equal(normalized.strengthModel, 2);
    assert.equal(normalized.strengthClip, 0);
  });

  it("preserves explicit enabled:false and numeric strengths", () => {
    const normalized = normalizeLoraLibraryEntry(
      makeEntry({ enabled: false, strengthModel: 0.6, strengthClip: 0.8 }),
    );
    assert.equal(normalized.enabled, false);
    assert.equal(normalized.strengthModel, 0.6);
    assert.equal(normalized.strengthClip, 0.8);
  });

  it("normalizes autoFromPrompt to a strict boolean", () => {
    assert.equal(
      normalizeLoraLibraryEntry(makeEntry({ autoFromPrompt: true })).autoFromPrompt,
      true,
    );
    assert.equal(
      normalizeLoraLibraryEntry(makeEntry({ autoFromPrompt: false })).autoFromPrompt,
      false,
    );
  });

  it("normalizeLoraLibrary maps over the whole array", () => {
    const normalized = normalizeLoraLibrary([makeEntry(), makeEntry({ id: "style" })]);
    assert.equal(normalized.length, 2);
    assert.ok(normalized.every((entry) => entry.enabled === true));
  });
});

describe("lora filename suggestions", () => {
  it("suggests id and label from a style filename", async () => {
    const {
      suggestLoraIdFromFilename,
      suggestLoraLabelFromFilename,
      createLoraLibraryEntryFromFilename,
      uniqueLoraLibraryId,
    } = await import("./lora-stack.ts");
    assert.equal(
      suggestLoraIdFromFilename("styles/Portrait_Soft_v2.safetensors"),
      "portrait-soft-v2",
    );
    assert.equal(
      suggestLoraLabelFromFilename("styles/Portrait_Soft_v2.safetensors"),
      "Portrait Soft v2",
    );
    assert.equal(
      suggestLoraIdFromFilename("Qwen-Image-Lightning-8steps-V2.0.safetensors"),
      "LIGHTNING",
    );
    const entry = createLoraLibraryEntryFromFilename(
      "cyberpunk_neon.safetensors",
      [makeEntry({ id: "cyberpunk-neon" })],
    );
    assert.equal(entry.tokenValue, "cyberpunk_neon.safetensors");
    assert.equal(entry.id, "cyberpunk-neon-2");
    assert.equal(entry.label, "cyberpunk neon");
    assert.equal(uniqueLoraLibraryId("LIGHTNING", ["LIGHTNING"]), "LIGHTNING-2");
  });
});

describe("resolveActiveLoraStack", () => {
  it("excludes disabled entries, empty filenames, and Lightning slots", () => {
    const stack = resolveActiveLoraStack([
      makeEntry({ id: "a", tokenValue: "a.safetensors" }),
      makeEntry({ id: "b", tokenValue: "b.safetensors", enabled: false }),
      makeEntry({ id: "c", tokenValue: "" }),
      makeEntry({ id: "LIGHTNING", tokenValue: "qwen_lightning_8steps.safetensors" }),
    ]);
    assert.deepEqual(stack.map((entry) => entry.id), ["a"]);
  });

  it("sorts by explicit order, falling back to array index", () => {
    const stack = resolveActiveLoraStack([
      makeEntry({ id: "second", tokenValue: "second.safetensors", order: 2 }),
      makeEntry({ id: "first", tokenValue: "first.safetensors", order: 1 }),
      makeEntry({ id: "third", tokenValue: "third.safetensors" }),
    ]);
    assert.deepEqual(stack.map((entry) => entry.id), ["first", "second", "third"]);
  });

  it("keeps enabled LoRAs without requiring a prompt match", () => {
    const stack = resolveActiveLoraStack(
      [
        makeEntry({
          id: "always",
          tokenValue: "always.safetensors",
          triggerPhrase: "never-mentioned",
        }),
      ],
      { prompt: "a portrait in soft light" },
    );
    assert.deepEqual(stack.map((entry) => entry.id), ["always"]);
  });

  it("does not activate disabled LoRAs from prompt keywords", () => {
    const stack = resolveActiveLoraStack(
      [
        makeEntry({
          id: "cyber",
          tokenValue: "cyber.safetensors",
          enabled: false,
          autoFromPrompt: true,
          triggerPhrase: "cyberpunk",
        }),
      ],
      { prompt: "Neon Cyberpunk street at night" },
    );
    assert.deepEqual(stack.map((entry) => entry.id), []);
  });

  it("does not activate disabled LoRAs without autoFromPrompt either", () => {
    const stack = resolveActiveLoraStack(
      [
        makeEntry({
          id: "cyber",
          tokenValue: "cyber.safetensors",
          enabled: false,
          triggerPhrase: "cyberpunk",
        }),
      ],
      { prompt: "cyberpunk alley" },
    );
    assert.deepEqual(stack.map((entry) => entry.id), []);
  });

  it("never activates disabled Lightning library entries from keywords", () => {
    const stack = resolveActiveLoraStack(
      [
        makeEntry({
          id: "LIGHTNING",
          tokenValue: "Qwen-Image-Lightning-8steps-V2.0.safetensors",
          enabled: false,
          autoFromPrompt: true,
          triggerPhrase: "lightning",
        }),
        makeEntry({
          id: "style",
          tokenValue: "Qwen-Image-Edit-2511-Lightning-8steps.safetensors",
          enabled: false,
          autoFromPrompt: true,
          triggerPhrase: "edit style",
        }),
      ],
      { prompt: "lightning edit style scene" },
    );
    assert.deepEqual(stack.map((entry) => entry.id), []);
  });
});

describe("applySessionLoraSelection", () => {
  it("leaves library unchanged when session ids are undefined", async () => {
    const { applySessionLoraSelection } = await import("./lora-stack.ts");
    const library = [
      makeEntry({ id: "a", enabled: true }),
      makeEntry({ id: "b", enabled: false, tokenValue: "b.safetensors" }),
    ];
    assert.deepEqual(
      applySessionLoraSelection(library, undefined).map((entry) => entry.enabled),
      [true, false],
    );
  });

  it("enables only selected ids and disables auto-from-prompt", async () => {
    const { applySessionLoraSelection, resolveActiveLoraStack } = await import(
      "./lora-stack.ts"
    );
    const library = [
      makeEntry({
        id: "a",
        enabled: false,
        autoFromPrompt: true,
        triggerPhrase: "alpha",
        tokenValue: "a.safetensors",
      }),
      makeEntry({
        id: "b",
        enabled: true,
        tokenValue: "b.safetensors",
      }),
    ];
    const next = applySessionLoraSelection(library, ["a"]);
    assert.equal(next.find((entry) => entry.id === "a")?.enabled, true);
    assert.equal(next.find((entry) => entry.id === "a")?.autoFromPrompt, false);
    assert.equal(next.find((entry) => entry.id === "b")?.enabled, false);
    assert.deepEqual(
      resolveActiveLoraStack(next).map((entry) => entry.id),
      ["a"],
    );
  });
});

describe("describeLoraStack", () => {
  it("reports an empty stack", () => {
    assert.equal(describeLoraStack([]), "No LoRAs active.");
  });

  it("collapses matching model/clip strengths and separates mismatched ones", () => {
    const summary = describeLoraStack([
      { id: "a", label: "Portrait", filename: "a.safetensors", strengthModel: 1, strengthClip: 1 },
      { id: "b", label: "Style", filename: "b.safetensors", strengthModel: 0.8, strengthClip: 0.5 },
    ]);
    assert.equal(summary, "2 LoRAs active: Portrait (1), Style (0.8/0.5)");
  });
});

describe("chainLoraStackInWorkflow / applyLoraStackToWorkflow", () => {
  it("patches strengths on a single existing LoraLoader node", () => {
    const workflow = {
      "1": {
        class_type: "LoraLoader",
        inputs: {
          model: ["0", 0],
          clip: ["0", 1],
          lora_name: "{{LORA_PORTRAIT}}",
          strength_model: 1,
          strength_clip: 1,
        },
      },
    };
    const stack = resolveActiveLoraStack([
      makeEntry({ strengthModel: 0.7, strengthClip: 0.4 }),
    ]);
    const result = chainLoraStackInWorkflow(workflow, stack);
    assert.deepEqual(result.patchedNodeIds, ["1"]);
    assert.deepEqual(result.insertedNodeIds, []);
    const node = result.workflow["1"] as { inputs: Record<string, unknown> };
    assert.equal(node.inputs.lora_name, "portrait_v1.safetensors");
    assert.equal(node.inputs.strength_model, 0.7);
    assert.equal(node.inputs.strength_clip, 0.4);
  });

  it("chains extra enabled LoRAs after the last anchor and rewires downstream consumers", () => {
    const workflow = {
      "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "base.safetensors" } },
      "2": {
        class_type: "LoraLoader",
        inputs: {
          model: ["1", 0],
          clip: ["1", 1],
          lora_name: "{{LORA_PORTRAIT}}",
          strength_model: 1,
          strength_clip: 1,
        },
      },
      "3": { class_type: "KSampler", inputs: { model: ["2", 0], seed: 1 } },
      "4": { class_type: "CLIPTextEncode", inputs: { clip: ["2", 1], text: "hello" } },
    };
    const stack = resolveActiveLoraStack([
      makeEntry({ id: "portrait", tokenValue: "portrait_v1.safetensors", strengthModel: 0.8, strengthClip: 0.8 }),
      makeEntry({ id: "style", tokenValue: "style_v2.safetensors", strengthModel: 0.6, strengthClip: 0.5 }),
    ]);

    const result = chainLoraStackInWorkflow(workflow, stack);
    assert.deepEqual(result.patchedNodeIds, ["2"]);
    assert.equal(result.insertedNodeIds.length, 1);
    const newNodeId = result.insertedNodeIds[0]!;

    const anchor = result.workflow["2"] as { inputs: Record<string, unknown> };
    assert.equal(anchor.inputs.lora_name, "portrait_v1.safetensors");
    assert.equal(anchor.inputs.strength_model, 0.8);

    const chained = result.workflow[newNodeId] as {
      class_type: string;
      inputs: Record<string, unknown>;
    };
    assert.equal(chained.class_type, "LoraLoader");
    assert.deepEqual(chained.inputs.model, ["2", 0]);
    assert.deepEqual(chained.inputs.clip, ["2", 1]);
    assert.equal(chained.inputs.lora_name, "style_v2.safetensors");
    assert.equal(chained.inputs.strength_model, 0.6);
    assert.equal(chained.inputs.strength_clip, 0.5);

    const sampler = result.workflow["3"] as { inputs: Record<string, unknown> };
    const textEncode = result.workflow["4"] as { inputs: Record<string, unknown> };
    assert.deepEqual(sampler.inputs.model, [newNodeId, 0]);
    assert.deepEqual(textEncode.inputs.clip, [newNodeId, 1]);
  });

  it("chains through LoraLoaderModelOnly without inventing a clip input", () => {
    const workflow = {
      "1": { class_type: "UNETLoader", inputs: { unet_name: "unet.safetensors" } },
      "2": {
        class_type: "LoraLoaderModelOnly",
        inputs: { model: ["1", 0], lora_name: "a.safetensors", strength_model: 1 },
      },
      "3": { class_type: "KSampler", inputs: { model: ["2", 0], seed: 1 } },
    };
    const stack = resolveActiveLoraStack([
      makeEntry({ id: "a", tokenValue: "a.safetensors" }),
      makeEntry({ id: "b", tokenValue: "b.safetensors" }),
    ]);

    const result = chainLoraStackInWorkflow(workflow, stack);
    const newNodeId = result.insertedNodeIds[0]!;
    const chained = result.workflow[newNodeId] as {
      class_type: string;
      inputs: Record<string, unknown>;
    };
    assert.equal(chained.class_type, "LoraLoaderModelOnly");
    assert.equal("clip" in chained.inputs, false);
    assert.equal("strength_clip" in chained.inputs, false);

    const sampler = result.workflow["3"] as { inputs: Record<string, unknown> };
    assert.deepEqual(sampler.inputs.model, [newNodeId, 0]);
  });

  it("leaves the Lightning LoRA slot untouched and does not anchor onto it", () => {
    const workflow = {
      "1": {
        class_type: "LoraLoaderModelOnly",
        inputs: { model: ["0", 0], lora_name: "{{LORA_LIGHTNING}}", strength_model: 1 },
      },
    };
    const stack = resolveActiveLoraStack([makeEntry()]);
    const result = chainLoraStackInWorkflow(workflow, stack);
    assert.deepEqual(result.patchedNodeIds, []);
    assert.deepEqual(result.insertedNodeIds, []);
    const node = result.workflow["1"] as { inputs: Record<string, unknown> };
    assert.equal(node.inputs.lora_name, "{{LORA_LIGHTNING}}");
  });

  it("zeroes non-Lightning loader strengths when the stack is empty", () => {
    const workflow = {
      "1": {
        class_type: "LoraLoader",
        inputs: { lora_name: "{{LORA_PORTRAIT}}", strength_model: 1, strength_clip: 1 },
      },
    };
    const result = applyLoraStackToWorkflow(workflow, []);
    assert.equal(result.patched.loraStack, 1);
    const node = result.workflow["1"] as {
      inputs: { strength_model: number; strength_clip: number };
    };
    assert.equal(node.inputs.strength_model, 0);
    assert.equal(node.inputs.strength_clip, 0);
  });

  it("neutralizes leftover anchors beyond the active stack", () => {
    const workflow = {
      "1": {
        class_type: "LoraLoader",
        inputs: {
          model: ["0", 0],
          clip: ["0", 1],
          lora_name: "first.safetensors",
          strength_model: 0.9,
          strength_clip: 0.9,
        },
      },
      "2": {
        class_type: "LoraLoader",
        inputs: {
          model: ["1", 0],
          clip: ["1", 1],
          lora_name: "second.safetensors",
          strength_model: 0.8,
          strength_clip: 0.8,
        },
      },
    };
    const result = applyLoraStackToWorkflow(workflow, [
      makeEntry({
        id: "only",
        tokenValue: "only.safetensors",
        strengthModel: 0.5,
        strengthClip: 0.5,
      }),
    ]);
    const first = result.workflow["1"] as {
      inputs: { lora_name: string; strength_model: number };
    };
    const second = result.workflow["2"] as {
      inputs: { lora_name: string; strength_model: number };
    };
    assert.equal(first.inputs.lora_name, "only.safetensors");
    assert.equal(first.inputs.strength_model, 0.5);
    assert.equal(second.inputs.strength_model, 0);
  });

  it("chains selected style LoRAs after Lightning when no style anchors exist", () => {
    const workflow = {
      "3": {
        class_type: "KSampler",
        inputs: { model: ["66", 0], seed: 1, steps: 8, cfg: 1 },
      },
      "66": {
        class_type: "ModelSamplingAuraFlow",
        inputs: { model: ["7", 0], shift: 3 },
      },
      "7": {
        class_type: "LoraLoaderModelOnly",
        inputs: {
          model: ["1", 0],
          lora_name: "Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors",
          strength_model: 1,
        },
      },
      "1": {
        class_type: "UNETLoader",
        inputs: { unet_name: "qwen_image_edit_2511_bf16.safetensors" },
      },
    };
    const result = chainLoraStackInWorkflow(workflow, [
      {
        id: "skin",
        label: "Skin",
        filename: "qwen-edit-skin.safetensors",
        strengthModel: 0.8,
        strengthClip: 0.5,
      },
    ]);
    assert.equal(result.insertedNodeIds.length, 1);
    const inserted = result.workflow[result.insertedNodeIds[0]!] as {
      class_type: string;
      inputs: { model: [string, number]; lora_name: string; strength_model: number };
    };
    assert.equal(inserted.class_type, "LoraLoaderModelOnly");
    assert.equal(inserted.inputs.lora_name, "qwen-edit-skin.safetensors");
    assert.equal(inserted.inputs.strength_model, 0.8);
    assert.deepEqual(inserted.inputs.model, ["7", 0]);
    assert.deepEqual(
      (result.workflow["66"] as { inputs: { model: [string, number] } }).inputs.model,
      [result.insertedNodeIds[0]!, 0],
    );
  });

  it("breaks Lightning model self-cycles before chaining style LoRAs", () => {
    const workflow = {
      "1": {
        class_type: "UNETLoader",
        inputs: { unet_name: "qwen_image_2512_bf16.safetensors" },
      },
      "7": {
        class_type: "LoraLoaderModelOnly",
        inputs: {
          // Bad pack: Lightning model edge points at Aura (cycle with Aura→Lightning).
          model: ["8", 0],
          lora_name: "Qwen-Image-Lightning-8steps-V2.0-bf16.safetensors",
          strength_model: 1,
        },
      },
      "8": {
        class_type: "ModelSamplingAuraFlow",
        inputs: { model: ["7", 0], shift: 3 },
      },
      "9": {
        class_type: "KSampler",
        inputs: { model: ["8", 0], seed: 1, steps: 8, cfg: 1 },
      },
    };
    const result = chainLoraStackInWorkflow(workflow, [
      {
        id: "skin",
        label: "Skin",
        filename: "skin.safetensors",
        strengthModel: 0.7,
        strengthClip: 0.7,
      },
    ]);
    assert.equal(result.insertedNodeIds.length, 1);
    const lightning = result.workflow["7"] as {
      inputs: { model: [string, number] };
    };
    assert.deepEqual(lightning.inputs.model, ["1", 0]);
    const inserted = result.workflow[result.insertedNodeIds[0]!] as {
      inputs: { model: [string, number]; lora_name: string };
    };
    assert.equal(inserted.inputs.lora_name, "skin.safetensors");
    assert.deepEqual(inserted.inputs.model, ["7", 0]);
    assert.deepEqual(
      (result.workflow["8"] as { inputs: { model: [string, number] } }).inputs.model,
      [result.insertedNodeIds[0]!, 0],
    );
  });

  it("ignores orphaned off-chain style loaders and chains after Lightning instead", () => {
    const workflow = {
      "1": {
        class_type: "UNETLoader",
        inputs: { unet_name: "qwen_image_2512_bf16.safetensors" },
      },
      // Neutralized leftover — not on the sampler model chain.
      "2": {
        class_type: "LoraLoaderModelOnly",
        inputs: {
          model: ["1", 0],
          lora_name: "baked_style.safetensors",
          strength_model: 0,
        },
      },
      "3": {
        class_type: "LoraLoaderModelOnly",
        inputs: {
          model: ["1", 0],
          lora_name: "Qwen-Image-Lightning-8steps-V2.0-bf16.safetensors",
          strength_model: 1,
        },
      },
      "4": {
        class_type: "ModelSamplingAuraFlow",
        inputs: { model: ["3", 0], shift: 3 },
      },
      "5": {
        class_type: "KSampler",
        inputs: { model: ["4", 0], seed: 1, steps: 8, cfg: 1 },
      },
    };
    const result = applyLoraStackToWorkflow(workflow, [
      makeEntry({
        id: "skin",
        tokenValue: "skin_detail_v1.safetensors",
        strengthModel: 0.7,
        strengthClip: 0.7,
      }),
    ]);
    assert.ok((result.patched.loraStack ?? 0) >= 1);
    const orphan = result.workflow["2"] as {
      inputs: { lora_name: string; strength_model: number };
    };
    // Must not "apply" onto the dead branch.
    assert.equal(orphan.inputs.lora_name, "baked_style.safetensors");
    assert.equal(orphan.inputs.strength_model, 0);

    const insertedId = Object.keys(result.workflow).find((id) => {
      const node = result.workflow[id] as {
        class_type?: string;
        inputs?: { lora_name?: string };
      };
      return node?.inputs?.lora_name === "skin_detail_v1.safetensors";
    });
    assert.ok(insertedId);
    assert.deepEqual(
      (result.workflow[insertedId!] as { inputs: { model: [string, number] } }).inputs
        .model,
      ["3", 0],
    );
    assert.deepEqual(
      (result.workflow["4"] as { inputs: { model: [string, number] } }).inputs.model,
      [insertedId!, 0],
    );
  });

  it("applies stack onto neutralized LoraLoader|pysssss anchors", () => {
    const workflow = {
      "125": {
        class_type: "LoraLoaderModelOnly",
        inputs: {
          model: ["115", 0],
          lora_name: "Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors",
          strength_model: 1,
        },
      },
      "115": {
        class_type: "LoraLoader|pysssss",
        inputs: {
          model: ["110", 0],
          lora_name: "flymy_realism.safetensors",
          strength_model: 0,
          strength_clip: 0,
        },
      },
      "110": {
        class_type: "UNETLoader",
        inputs: { unet_name: "qwen_image_edit_2511_bf16.safetensors" },
      },
      // Sampler keeps 115 on-chain so it remains a valid stack anchor.
      "200": {
        class_type: "KSampler",
        inputs: { model: ["125", 0], seed: 1 },
      },
    };
    const result = applyLoraStackToWorkflow(workflow, [
      makeEntry({
        id: "skin",
        tokenValue: "qwen-edit-skin.safetensors",
        strengthModel: 0.8,
        strengthClip: 0.5,
      }),
    ]);
    const node = result.workflow["115"] as {
      inputs: { lora_name: string; strength_model: number; strength_clip: number };
    };
    assert.equal(node.inputs.lora_name, "qwen-edit-skin.safetensors");
    assert.equal(node.inputs.strength_model, 0.8);
    assert.equal(node.inputs.strength_clip, 0.5);
  });

  it("applyLoraStackToWorkflow reports a loraStack patch count", () => {
    const workflow = {
      "1": {
        class_type: "LoraLoader",
        inputs: { lora_name: "{{LORA_PORTRAIT}}", strength_model: 1, strength_clip: 1 },
      },
    };
    const result = applyLoraStackToWorkflow(workflow, [
      makeEntry({ strengthModel: 0.9, strengthClip: 0.9 }),
    ]);
    assert.equal(result.patched.loraStack, 1);
  });
});

describe("loraStackLintWarning", () => {
  it("warns when a placeholder is unresolved and the stack is empty", () => {
    const warning = loraStackLintWarning(
      { "1": { class_type: "CLIPTextEncode", inputs: { text: "{{LORA_STYLE}}" } } },
      [],
    );
    assert.ok(warning?.includes("LoRA stack is empty"));
  });

  it("warns when a LoraLoader node exists and the stack is empty", () => {
    const warning = loraStackLintWarning(
      { "1": { class_type: "LoraLoader", inputs: { lora_name: "a.safetensors" } } },
      [],
    );
    assert.ok(Boolean(warning));
  });

  it("does not warn for the Lightning placeholder", () => {
    const warning = loraStackLintWarning(
      { "1": { class_type: "LoraLoaderModelOnly", inputs: { lora_name: "{{LORA_LIGHTNING}}" } } },
      [],
    );
    assert.equal(warning, null);
  });

  it("does not warn when the stack has entries", () => {
    const warning = loraStackLintWarning(
      { "1": { class_type: "LoraLoader", inputs: { lora_name: "a.safetensors" } } },
      resolveActiveLoraStack([makeEntry()]),
    );
    assert.equal(warning, null);
  });
});
