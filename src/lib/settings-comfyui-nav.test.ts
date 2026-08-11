import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COMFYUI_ESSENTIAL_SECTION_IDS,
  comfyUiSectionsForEssentials,
  filterComfyUiSettingsSections,
  normalizeComfyUiSettingsSection,
  settingsComfyUiSectionHref,
} from "./settings-comfyui-nav";

describe("settings-comfyui-nav", () => {
  it("normalizes known section ids", () => {
    assert.equal(normalizeComfyUiSettingsSection("vram-guard"), "vram-guard");
    assert.equal(normalizeComfyUiSettingsSection("nope"), null);
  });

  it("filters sections by keyword", () => {
    const hits = filterComfyUiSettingsSections("vram");
    assert.ok(hits.some((section) => section.id === "vram-guard"));
    assert.equal(filterComfyUiSettingsSections("zzzz").length, 0);
  });

  it("surfaces LoRA library from lora/trigger keywords", () => {
    const hits = filterComfyUiSettingsSections("lora");
    assert.ok(hits.some((section) => section.id === "lora-library"));
    assert.ok(hits.some((section) => section.id === "lora-train"));
    assert.ok(hits.some((section) => section.id === "model-assets"));
    assert.equal(
      settingsComfyUiSectionHref("lora-library"),
      "/settings?tab=comfyui&section=lora-library",
    );
  });

  it("surfaces model assets from download/checkpoint keywords", () => {
    const hits = filterComfyUiSettingsSections("download");
    assert.ok(hits.some((section) => section.id === "model-assets"));
    assert.equal(
      settingsComfyUiSectionHref("model-assets"),
      "/settings?tab=comfyui&section=model-assets",
    );
  });

  it("deep-links LoRA train section", () => {
    assert.equal(
      settingsComfyUiSectionHref("lora-train"),
      "/settings?tab=comfyui&section=lora-train",
    );
  });

  it("builds deep-link hrefs", () => {
    assert.equal(
      settingsComfyUiSectionHref("auto-improve"),
      "/settings?tab=comfyui&section=auto-improve",
    );
  });

  it("surfaces inference engine from diffusers keyword", () => {
    const hits = filterComfyUiSettingsSections("diffusers");
    assert.ok(hits.some((section) => section.id === "inference-engine"));
    assert.equal(
      settingsComfyUiSectionHref("inference-engine"),
      "/settings?tab=comfyui&section=inference-engine",
    );
  });

  it("limits jump-nav sections in essentials mode", () => {
    const essentials = comfyUiSectionsForEssentials(true);
    assert.equal(essentials.length, COMFYUI_ESSENTIAL_SECTION_IDS.length);
    assert.ok(essentials.every((section) => COMFYUI_ESSENTIAL_SECTION_IDS.includes(section.id)));
    assert.equal(
      filterComfyUiSettingsSections("kohya", { essentialsOnly: true }).length,
      0,
    );
    assert.ok(
      filterComfyUiSettingsSections("download", { essentialsOnly: true }).some(
        (section) => section.id === "model-assets",
      ),
    );
  });
});
