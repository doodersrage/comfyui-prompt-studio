import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildLightningLoraFilenameMap,
  buildLoraFilenameMapFromCustomTokens,
  loraNameImpliesLightning,
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

  it("infers {{LORA_LIGHTNING}} from lightning custom tokens", () => {
    const map = buildLightningLoraFilenameMap(
      [{ token: "{{LORA_LIGHTNING_8}}", value: "qwen_lightning_8steps.safetensors" }],
      "qwen-image-2512-lightning-8",
    );
    assert.equal(map["{{LORA_LIGHTNING}}"], "qwen_lightning_8steps.safetensors");
  });

  it("infers {{LORA_LIGHTNING}} from ComfyUI loras inventory when library is empty", () => {
    const map = buildLightningLoraFilenameMap(
      [],
      "qwen-image-2512-lightning-8",
      [
        "style_portrait.safetensors",
        "Qwen-Image-Lightning-8steps-V2.0.safetensors",
        "Qwen-Image-Lightning-4steps-V2.0.safetensors",
      ],
    );
    assert.equal(
      map["{{LORA_LIGHTNING}}"],
      "Qwen-Image-Lightning-8steps-V2.0.safetensors",
    );
  });

  it("treats {{LORA_LIGHTNING}} placeholder as lightning", () => {
    assert.equal(loraNameImpliesLightning("{{LORA_LIGHTNING}}", {}), true);
  });
});
