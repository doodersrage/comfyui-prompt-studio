import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applySessionLoraSelection,
  type LoraLibraryEntry,
} from "./lora-stack.ts";
import {
  formatModelLoraMap,
  parseModelLoraMap,
  resolveEffectiveSessionLoraIds,
  resolveLoraIdsForModelSelection,
  resolveModelDefaultLoraIds,
  setSessionLoraIdsForModel,
} from "./model-lora-map.ts";

describe("model lora map", () => {
  it("parses and formats modelId=id1,id2 lines including empty values", () => {
    const map = parseModelLoraMap(
      "# comment\nwan-video=skin,motion\nflux-dev=\nqwen-image-2512:detail",
    );
    assert.equal(map["wan-video"], "skin,motion");
    assert.equal(map["flux-dev"], "");
    assert.equal(map["qwen-image-2512"], "detail");

    const formatted = formatModelLoraMap(map);
    assert.match(formatted, /wan-video=skin,motion/);
    assert.match(formatted, /flux-dev=$/m);
    assert.match(formatted, /qwen-image-2512=detail/);
  });

  it("resolves mapped ids, empty stack, and missing keys", () => {
    const map = {
      "wan-video": "skin, motion",
      "flux-dev": "",
    };
    assert.deepEqual(resolveModelDefaultLoraIds("wan-video", map), [
      "skin",
      "motion",
    ]);
    assert.deepEqual(resolveModelDefaultLoraIds("flux-dev", map), []);
    assert.equal(resolveModelDefaultLoraIds("unknown", map), undefined);
    assert.equal(resolveModelDefaultLoraIds("wan-video", undefined), undefined);
  });

  it("prefers per-model session over map, and defaults to none selected", () => {
    const library: LoraLibraryEntry[] = [
      {
        id: "skin",
        label: "Skin",
        triggerPhrase: "",
        tokenValue: "skin.safetensors",
        enabled: false,
      },
      {
        id: "motion",
        label: "Motion",
        triggerPhrase: "",
        tokenValue: "motion.safetensors",
        enabled: true,
      },
      {
        id: "detail",
        label: "Detail",
        triggerPhrase: "",
        tokenValue: "detail.safetensors",
        enabled: true,
      },
    ];
    const map = { "wan-video": "skin,motion" };

    const sessionWins = resolveEffectiveSessionLoraIds(
      ["detail"],
      "wan-video",
      map,
      { "wan-video": ["detail"] },
    );
    assert.deepEqual(sessionWins, ["detail"]);
    assert.deepEqual(
      applySessionLoraSelection(library, sessionWins)
        .filter((entry) => entry.enabled)
        .map((entry) => entry.id),
      ["detail"],
    );

    const mapWins = resolveEffectiveSessionLoraIds(
      undefined,
      "wan-video",
      map,
    );
    assert.deepEqual(mapWins, ["skin", "motion"]);
    assert.deepEqual(
      applySessionLoraSelection(library, mapWins)
        .filter((entry) => entry.enabled)
        .map((entry) => entry.id),
      ["skin", "motion"],
    );

    const libraryEnabled = resolveEffectiveSessionLoraIds(
      undefined,
      "unknown-model",
      map,
    );
    assert.deepEqual(libraryEnabled, []);
    assert.deepEqual(
      applySessionLoraSelection(library, libraryEnabled)
        .filter((entry) => entry.enabled !== false)
        .map((entry) => entry.id),
      [],
    );
  });

  it("switches and stores LoRA picks per model without leaking across models", () => {
    const map = {
      "wan-video": "skin,motion",
      "flux-dev": "detail",
    };
    let byModel = setSessionLoraIdsForModel(undefined, "wan-video", ["skin"]);

    assert.deepEqual(
      resolveLoraIdsForModelSelection("wan-video", {
        sessionActiveLoraIdsByModel: byModel,
        modelLoraMap: map,
      }),
      ["skin"],
    );
    assert.deepEqual(
      resolveLoraIdsForModelSelection("flux-dev", {
        sessionActiveLoraIdsByModel: byModel,
        modelLoraMap: map,
      }),
      ["detail"],
    );

    byModel = setSessionLoraIdsForModel(byModel, "flux-dev", []);
    assert.deepEqual(
      resolveLoraIdsForModelSelection("flux-dev", {
        sessionActiveLoraIdsByModel: byModel,
        modelLoraMap: map,
      }),
      [],
    );
    // wan-video pick preserved
    assert.deepEqual(
      resolveLoraIdsForModelSelection("wan-video", {
        sessionActiveLoraIdsByModel: byModel,
        modelLoraMap: map,
      }),
      ["skin"],
    );

    // Clear flux override → fall back to map
    byModel = setSessionLoraIdsForModel(byModel, "flux-dev", undefined);
    assert.deepEqual(
      resolveLoraIdsForModelSelection("flux-dev", {
        sessionActiveLoraIdsByModel: byModel,
        modelLoraMap: map,
      }),
      ["detail"],
    );

    // Sticky global session must not override another model's map when byModel has entries
    assert.deepEqual(
      resolveEffectiveSessionLoraIds(
        ["skin"],
        "flux-dev",
        map,
        byModel,
      ),
      ["detail"],
    );

    // Untouched model with no map entry → empty system default
    assert.deepEqual(
      resolveLoraIdsForModelSelection("some-other-model", {
        sessionActiveLoraIdsByModel: byModel,
        modelLoraMap: map,
        sessionActiveLoraIds: ["skin"],
      }),
      [],
    );
  });
});
