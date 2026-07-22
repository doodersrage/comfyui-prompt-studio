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

  it("normalizeLoraLibrary maps over the whole array", () => {
    const normalized = normalizeLoraLibrary([makeEntry(), makeEntry({ id: "style" })]);
    assert.equal(normalized.length, 2);
    assert.ok(normalized.every((entry) => entry.enabled === true));
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

  it("is a no-op when the stack is empty", () => {
    const workflow = {
      "1": {
        class_type: "LoraLoader",
        inputs: { lora_name: "{{LORA_PORTRAIT}}", strength_model: 1, strength_clip: 1 },
      },
    };
    const result = applyLoraStackToWorkflow(workflow, []);
    assert.deepEqual(result.patched, {});
    assert.equal(result.workflow, workflow);
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
