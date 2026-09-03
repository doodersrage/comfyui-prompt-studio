import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  variationsHistoryTool,
  variationEndpoint,
  buildVariationRequestBody,
  type VariationTarget,
} from "./variation-request-body";

// avoidedTokensRequestBody() (spread into every branch as `...avoidance`) reads
// browser-storage-backed avoided tokens, which is empty under node:test (no
// `window`) — loadAvoidedTokens() short-circuits to an empty Set, so
// avoidedTokensRequestBody() always returns {} here. Confirmed via probe
// before writing these assertions, so every expected body below omits it.

const ALL_TARGETS: VariationTarget[] = [
  "character",
  "duo",
  "pet",
  "fantasy",
  "background",
  "generate",
];

const shared = {
  model: "my-model",
  detail: "high" as never,
  alwaysIncludeClothing: true,
  seedLlmWithIngredients: true,
  lockedWardrobeId: "wardrobe-1",
  lockedLocation: "shared-location",
};

const toolSettings = {
  variationStrength: 70,
  sportPresetId: "sport-1",
  portraitStyle: "full-body" as never,
} as never;

const recentClothing = () => ["shirt", "pants"];
const recentLocations = () => ["park", "beach"];
const blocklist = () => ["blocked1"];

describe("variationsHistoryTool", () => {
  it("maps each explicit target to its history-seed tool name", () => {
    assert.equal(variationsHistoryTool("character"), "character");
    assert.equal(variationsHistoryTool("duo"), "duo");
    assert.equal(variationsHistoryTool("pet"), "pet");
    assert.equal(variationsHistoryTool("fantasy"), "fantasy");
    assert.equal(variationsHistoryTool("background"), "background");
  });

  it("falls back to 'generate' for the 'generate' target via the default case", () => {
    assert.equal(variationsHistoryTool("generate"), "generate");
  });

  it("every VariationTarget produces a defined result", () => {
    for (const target of ALL_TARGETS) {
      assert.ok(variationsHistoryTool(target));
    }
  });
});

describe("variationEndpoint", () => {
  it("maps each explicit target to its API route", () => {
    assert.equal(variationEndpoint("character"), "/api/character");
    assert.equal(variationEndpoint("duo"), "/api/duo");
    assert.equal(variationEndpoint("pet"), "/api/pet");
    assert.equal(variationEndpoint("fantasy"), "/api/fantasy");
    assert.equal(variationEndpoint("background"), "/api/background");
  });

  it("falls back to '/api/generate' for the 'generate' target via the default case", () => {
    assert.equal(variationEndpoint("generate"), "/api/generate");
  });
});

describe("buildVariationRequestBody", () => {
  it("'generate' target builds the positive-mode variation body", () => {
    const body = buildVariationRequestBody(
      "generate",
      "some hints",
      shared,
      toolSettings,
      recentClothing,
      recentLocations,
      blocklist
    );
    assert.deepEqual(body, {
      input: "some hints",
      mode: "positive",
      model: "my-model",
      detail: "high",
      variation: { enabled: true, strength: 70 },
      alwaysIncludeClothing: true,
      seedLlmWithIngredients: true,
      recentClothing: ["shirt", "pants"],
      lockedWardrobeId: "wardrobe-1",
      lockedLocation: "shared-location",
    });
  });

  it("'background' target builds a settingType string and has no separate lockedLocation field", () => {
    const body = buildVariationRequestBody(
      "background",
      "loc hints",
      shared,
      toolSettings,
      recentClothing,
      recentLocations,
      blocklist
    );
    assert.deepEqual(body, {
      model: "my-model",
      detail: "high",
      settingType: "loc hints",
      recentLocations: ["park", "beach"],
      blockedLocations: ["blocked1"],
    });
    assert.ok(!("lockedLocation" in body));
  });

  it("'background' target appends overrides.lockedLocation onto the hints, comma-separated", () => {
    const body = buildVariationRequestBody(
      "background",
      "loc hints",
      shared,
      toolSettings,
      recentClothing,
      recentLocations,
      blocklist,
      { lockedLocation: "override-loc" }
    );
    assert.equal((body as { settingType: string }).settingType, "loc hints, override-loc");
  });

  it("'pet' target has no recentClothing field", () => {
    const body = buildVariationRequestBody(
      "pet",
      "pet hints",
      shared,
      toolSettings,
      recentClothing,
      recentLocations,
      blocklist
    );
    assert.deepEqual(body, {
      hints: "pet hints",
      model: "my-model",
      detail: "high",
      portraitStyle: "full-body",
      variationStrength: 70,
      recentLocations: ["park", "beach"],
      blockedLocations: ["blocked1"],
      lockedLocation: "shared-location",
    });
  });

  it("'fantasy' target includes a fixed wildness plus both recentClothing and recentLocations", () => {
    const body = buildVariationRequestBody(
      "fantasy",
      "fantasy hints",
      shared,
      toolSettings,
      recentClothing,
      recentLocations,
      blocklist
    );
    assert.deepEqual(body, {
      hints: "fantasy hints",
      model: "my-model",
      detail: "high",
      portraitStyle: "full-body",
      wildness: 65,
      variationStrength: 70,
      recentLocations: ["park", "beach"],
      recentClothing: ["shirt", "pants"],
      blockedLocations: ["blocked1"],
      lockedLocation: "shared-location",
      lockedWardrobeId: "wardrobe-1",
      alwaysIncludeClothing: true,
      seedLlmWithIngredients: true,
    });
  });

  it("'character' target has no wildness or recentLocations fields", () => {
    const body = buildVariationRequestBody(
      "character",
      "char hints",
      shared,
      toolSettings,
      recentClothing,
      recentLocations,
      blocklist
    );
    assert.deepEqual(body, {
      hints: "char hints",
      model: "my-model",
      detail: "high",
      portraitStyle: "full-body",
      variationStrength: 70,
      alwaysIncludeClothing: true,
      seedLlmWithIngredients: true,
      recentClothing: ["shirt", "pants"],
      lockedWardrobeId: "wardrobe-1",
      lockedLocation: "shared-location",
      blockedLocations: ["blocked1"],
    });
    assert.ok(!("wildness" in body));
    assert.ok(!("recentLocations" in body));
  });

  it("'duo' target falls through to the sport-preset default body (only target with no explicit branch)", () => {
    const body = buildVariationRequestBody(
      "duo",
      "duo hints",
      shared,
      toolSettings,
      recentClothing,
      recentLocations,
      blocklist
    );
    assert.deepEqual(body, {
      hints: "duo hints",
      model: "my-model",
      detail: "high",
      portraitStyle: "full-body",
      variationStrength: 70,
      sportPresetId: "sport-1",
      teamKit: false,
      alwaysIncludeClothing: true,
      seedLlmWithIngredients: true,
      recentClothing: ["shirt", "pants"],
      lockedWardrobeId: "wardrobe-1",
      lockedLocation: "shared-location",
      blockedLocations: ["blocked1"],
    });
  });

  it("variationStrength defaults to 65 when neither an override nor toolSettings provide one", () => {
    const body = buildVariationRequestBody(
      "character",
      "hints",
      shared,
      {} as never,
      recentClothing,
      recentLocations,
      blocklist
    );
    assert.equal((body as { variationStrength: number }).variationStrength, 65);
  });

  it("overrides.variationStrength and overrides.lockedLocation take precedence over toolSettings/shared", () => {
    const body = buildVariationRequestBody(
      "character",
      "hints",
      shared,
      toolSettings,
      recentClothing,
      recentLocations,
      blocklist,
      { variationStrength: 99, lockedLocation: "override-loc" }
    );
    assert.equal((body as { variationStrength: number }).variationStrength, 99);
    assert.equal((body as { lockedLocation: string }).lockedLocation, "override-loc");
  });

  it("shared.alwaysIncludeClothing/seedLlmWithIngredients default true unless explicitly false", () => {
    const body = buildVariationRequestBody(
      "character",
      "hints",
      { ...shared, alwaysIncludeClothing: false, seedLlmWithIngredients: false },
      toolSettings,
      recentClothing,
      recentLocations,
      blocklist
    );
    assert.equal((body as { alwaysIncludeClothing: boolean }).alwaysIncludeClothing, false);
    assert.equal((body as { seedLlmWithIngredients: boolean }).seedLlmWithIngredients, false);
  });
});
