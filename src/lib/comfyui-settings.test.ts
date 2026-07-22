import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mergeLoraLibraryIntoCustomTokens,
  migrateOrphanLoraTokensToLibrary,
} from "./comfyui-settings.ts";

describe("comfyui settings lora migration", () => {
  it("migrates legacy {{LORA_*}} custom tokens into loraLibrary", () => {
    const migrated = migrateOrphanLoraTokensToLibrary({
      useServerDefaults: false,
      customTokens: [
        { token: "{{LORA_realism}}", value: "realism_v2.safetensors" },
        { token: "{{CHECKPOINT}}", value: "qwen_image_2512_bf16.safetensors" },
      ],
    });

    assert.equal(migrated.loraLibrary?.length, 1);
    assert.equal(migrated.loraLibrary?.[0]?.id, "realism");
    assert.equal(migrated.loraLibrary?.[0]?.tokenValue, "realism_v2.safetensors");
    assert.deepEqual(migrated.customTokens, [
      { token: "{{CHECKPOINT}}", value: "qwen_image_2512_bf16.safetensors" },
    ]);
  });

  it("preserves loraLibrary entries when merging custom tokens for queue", () => {
    const merged = mergeLoraLibraryIntoCustomTokens({
      useServerDefaults: false,
      loraLibrary: [
        {
          id: "realism",
          label: "Realism",
          triggerPhrase: "photo realism",
          tokenValue: "realism_v2.safetensors",
        },
      ],
      customTokens: [{ token: "{{CHECKPOINT}}", value: "model.safetensors" }],
    });

    assert.equal(
      merged.customTokens?.some(
        (entry) => entry.token === "{{LORA_realism}}" && entry.value === "realism_v2.safetensors",
      ),
      true,
    );
  });

  it("ships LoRA library tokens in runtime even when useServerDefaults is on", async () => {
    const { comfyUiSettingsToRuntime } = await import("./comfyui-settings.ts");
    const runtime = comfyUiSettingsToRuntime({
      useServerDefaults: true,
      loraLibrary: [
        {
          id: "LIGHTNING",
          label: "Lightning",
          triggerPhrase: "",
          tokenValue: "qwen_lightning_8steps.safetensors",
        },
      ],
    });

    assert.ok(runtime);
    assert.equal(
      runtime?.customTokens?.some(
        (entry) =>
          entry.token === "{{LORA_LIGHTNING}}" &&
          entry.value === "qwen_lightning_8steps.safetensors",
      ),
      true,
    );
  });

  it("omits disabled LoRAs from activeOnly token merge but keeps Lightning", () => {
    const merged = mergeLoraLibraryIntoCustomTokens(
      {
        useServerDefaults: false,
        loraLibrary: [
          {
            id: "style",
            label: "Style",
            triggerPhrase: "",
            tokenValue: "style.safetensors",
            enabled: false,
          },
          {
            id: "LIGHTNING",
            label: "Lightning",
            triggerPhrase: "",
            tokenValue: "qwen_lightning_8steps.safetensors",
            enabled: false,
          },
        ],
      },
      { activeOnly: true },
    );

    assert.equal(
      merged.customTokens?.some((entry) => entry.token === "{{LORA_style}}"),
      false,
    );
    assert.equal(
      merged.customTokens?.some(
        (entry) =>
          entry.token === "{{LORA_LIGHTNING}}" &&
          entry.value === "qwen_lightning_8steps.safetensors",
      ),
      true,
    );
  });
});
