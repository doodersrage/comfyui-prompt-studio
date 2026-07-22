import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatQueueSizeQualityExplain } from "./queue-quality-profile.ts";
import {
  applyToolQualityRecipe,
  mergeToolQualityRecipes,
  recipesForTool,
  SUGGESTED_TOOL_QUALITY_RECIPES,
} from "./tool-quality-recipes.ts";
import {
  applySessionRecipeShared,
  buildSessionRecipeFromShared,
  normalizeSessionRecipe,
} from "./session-recipes.ts";

describe("formatQueueSizeQualityExplain", () => {
  it("describes Edit Lightning Compose Final with light Lanczos", () => {
    const line = formatQueueSizeQualityExplain({
      model: "qwen-image-edit-2511-lightning-8",
      qualityProfile: "final",
      width: 1328,
      height: 1328,
      hasInputImage: true,
      latentConvertedFrom: "EmptyFlux2LatentImage",
      systemWorkflowSource: "pack",
    });
    assert.match(line, /EmptySD3/);
    assert.match(line, /EmptyFlux2/);
    assert.match(line, /1328×1328/);
    assert.match(line, /final/i);
    assert.match(line, /Lanczos 1\.05/);
    assert.match(line, /~1394/);
    assert.match(line, /pack/);
  });

  it("keeps native decode for Edit Lightning T2I Final", () => {
    const line = formatQueueSizeQualityExplain({
      model: "qwen-image-edit-2511-lightning-8",
      qualityProfile: "final",
      width: 1328,
      height: 1328,
      hasInputImage: false,
    });
    assert.match(line, /native decode/);
    assert.doesNotMatch(line, /Lanczos/);
  });
});

describe("tool quality recipes", () => {
  it("merges suggested seeds", () => {
    const merged = mergeToolQualityRecipes(undefined);
    assert.ok(merged.some((entry) => entry.id === "compose-keeper"));
    assert.equal(merged.length, SUGGESTED_TOOL_QUALITY_RECIPES.length);
  });

  it("filters recipes for compose", () => {
    const forCompose = recipesForTool(mergeToolQualityRecipes(undefined), "compose");
    assert.ok(forCompose.every((entry) => !entry.toolIds || entry.toolIds.includes("compose")));
    assert.ok(forCompose.some((entry) => entry.id === "compose-keeper"));
  });

  it("applies compose keeper onto shared settings", () => {
    const next = applyToolQualityRecipe(
      {
        model: "qwen-image-2512",
        queueQualityProfile: "draft",
        toolQueueQualityProfiles: {},
      },
      SUGGESTED_TOOL_QUALITY_RECIPES.find((entry) => entry.id === "compose-keeper")!,
      "compose",
    );
    assert.equal(next.model, "qwen-image-edit-2511-lightning-8");
    assert.equal(next.queueQualityProfile, "final");
    assert.equal(next.sessionQueueMode, "keeper");
    assert.equal(next.toolQueueQualityProfiles?.compose, "final");
  });
});

describe("session recipes", () => {
  it("round-trips a snapshot", () => {
    const recipe = buildSessionRecipeFromShared({
      shared: {
        model: "qwen-image-edit-2511-lightning-8",
        queueQualityProfile: "final",
        sessionActiveLoraIds: ["skin", "anypose"],
        modelSamplerPreset: "base",
        modelResolutionOrientation: "square",
        modelResolutionSizeTier: "medium",
      },
      toolId: "compose",
      label: "Test session",
    });
    const normalized = normalizeSessionRecipe(recipe);
    assert.ok(normalized);
    assert.equal(normalized?.label, "Test session");
    assert.equal(normalized?.toolId, "compose");
    assert.deepEqual(normalized?.shared.sessionActiveLoraIds, ["skin", "anypose"]);

    const applied = applySessionRecipeShared(
      {
        model: "qwen-image-2512",
        queueQualityProfile: "draft",
      },
      normalized!,
    );
    assert.equal(applied.model, "qwen-image-edit-2511-lightning-8");
    assert.equal(applied.queueQualityProfile, "final");
    assert.deepEqual(applied.sessionActiveLoraIds, ["skin", "anypose"]);
  });
});
