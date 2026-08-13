import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LoraLibraryEntry } from "./lora-stack";
import {
  classifyLoraEntryFamily,
  filterLorasForSelectedModel,
  isLoraCompatibleWithModel,
  resolveLoraFilterFamily,
} from "./lora-model-compat";

function entry(partial: Partial<LoraLibraryEntry> & Pick<LoraLibraryEntry, "id">): LoraLibraryEntry {
  return {
    label: partial.label ?? partial.id,
    triggerPhrase: "",
    tokenValue: partial.tokenValue ?? `${partial.id}.safetensors`,
    ...partial,
  };
}

describe("lora model compatibility", () => {
  it("classifies Klein, Flux, Qwen, and Wan LoRAs from ids and filenames", () => {
    assert.equal(
      classifyLoraEntryFamily(entry({ id: "klein-realistic-detail" })),
      "flux-klein",
    );
    assert.equal(
      classifyLoraEntryFamily(
        entry({ id: "skin", tokenValue: "flux2_klein_style.safetensors" }),
      ),
      "flux-klein",
    );
    assert.equal(
      classifyLoraEntryFamily(entry({ id: "ultrareal-amplifier" })),
      "flux",
    );
    assert.equal(
      classifyLoraEntryFamily(entry({ id: "detail", tokenValue: "flux1-dev-style.safetensors" })),
      "flux",
    );
    assert.equal(
      classifyLoraEntryFamily(entry({ id: "qwen-skin", tokenValue: "qwen_image_skin.safetensors" })),
      "qwen-t2i",
    );
    assert.equal(
      classifyLoraEntryFamily(entry({ id: "motion", tokenValue: "wan2.2_i2v_motion.safetensors" })),
      "wan",
    );
    assert.equal(
      classifyLoraEntryFamily(entry({ id: "character", tokenValue: "my_character.safetensors" })),
      "other",
    );
  });

  it("resolves model filter families including video/Wan", () => {
    assert.equal(resolveLoraFilterFamily("flux-2-klein-9b"), "flux-klein");
    assert.equal(resolveLoraFilterFamily("flux-dev"), "flux");
    assert.equal(resolveLoraFilterFamily("qwen-image-2512"), "qwen-t2i");
    assert.equal(resolveLoraFilterFamily("wan-video"), "wan");
    assert.equal(resolveLoraFilterFamily("not-a-real-model"), "unknown");
  });

  it("hides architecture-specific LoRAs on the wrong model and keeps unlabeled ones", () => {
    const kleinDetail = entry({ id: "klein-realistic-detail" });
    const fluxStyle = entry({ id: "flux-style", tokenValue: "flux_dev_style.safetensors" });
    const character = entry({ id: "character", tokenValue: "my_character.safetensors" });
    const wanMotion = entry({ id: "motion", tokenValue: "wan2.1_motion.safetensors" });

    assert.equal(isLoraCompatibleWithModel(kleinDetail, "flux-2-klein-9b"), true);
    assert.equal(isLoraCompatibleWithModel(fluxStyle, "flux-2-klein-9b"), false);
    assert.equal(isLoraCompatibleWithModel(character, "flux-2-klein-9b"), true);

    assert.equal(isLoraCompatibleWithModel(kleinDetail, "flux-dev"), false);
    assert.equal(isLoraCompatibleWithModel(fluxStyle, "flux-dev"), true);

    assert.equal(isLoraCompatibleWithModel(wanMotion, "wan-video"), true);
    assert.equal(isLoraCompatibleWithModel(wanMotion, "flux-dev"), false);
    assert.equal(isLoraCompatibleWithModel(fluxStyle, "wan-video"), false);
  });

  it("keeps currently selected incompatible LoRAs visible unless showAll is on", () => {
    const fluxStyle = entry({ id: "flux-style", tokenValue: "flux_dev_style.safetensors" });
    const character = entry({ id: "character", tokenValue: "my_character.safetensors" });
    const filtered = filterLorasForSelectedModel(
      [fluxStyle, character],
      "flux-2-klein-9b",
      { alwaysIncludeIds: ["flux-style"] },
    );
    assert.deepEqual(
      filtered.map(item => item.id),
      ["flux-style", "character"],
    );

    const hidden = filterLorasForSelectedModel([fluxStyle, character], "flux-2-klein-9b");
    assert.deepEqual(
      hidden.map(item => item.id),
      ["character"],
    );
  });
});
