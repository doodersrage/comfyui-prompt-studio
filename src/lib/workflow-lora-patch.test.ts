import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildLoraFilenameMapFromCustomTokens,
  patchLoraNodesInWorkflow,
} from "./workflow-lora-patch.ts";

describe("workflow-lora-patch", () => {
  it("patches unresolved lora placeholders", () => {
    const workflow = {
      "1": {
        class_type: "LoraLoader",
        inputs: { lora_name: "{{LORA_PORTRAIT}}", strength_model: 0.8 },
      },
    };
    const result = patchLoraNodesInWorkflow(workflow, {
      "{{LORA_PORTRAIT}}": "portrait_v1.safetensors",
    });
    assert.equal(
      (result.workflow["1"] as { inputs: { lora_name: string } }).inputs.lora_name,
      "portrait_v1.safetensors",
    );
    assert.equal(result.patched.lora, 1);
  });

  it("builds lora map from custom tokens", () => {
    const map = buildLoraFilenameMapFromCustomTokens([
      { token: "{{LORA_SKIN}}", value: "skin.safetensors" },
      { token: "{{POSITIVE}}", value: "ignored" },
    ]);
    assert.deepEqual(map, { "{{LORA_SKIN}}": "skin.safetensors" });
  });
});
