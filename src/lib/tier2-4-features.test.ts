import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeImagePromptParts, normalizeRefRole } from "./image-prompt-merge";
import { inspectPromptWeights } from "./prompt-weight-inspector";
import { suggestRatingMutations } from "./rating-prompt-mutations";
import { buildVideoPrompt } from "./video-prompt";
import { suggestWorkflowNodeMappings } from "./workflow-node-mapper";
import { scoreGalleryEntryHeuristic } from "./aesthetic-score";
import { buildProjectBundle } from "./project-bundle";
import type { ComfyGalleryEntry } from "./comfyui-gallery";

describe("image prompt merge", () => {
  it("merges roles with strength guidance", () => {
    const merged = mergeImagePromptParts([
      { role: "primary", prompt: "cyclist on gravel road", strength: 1 },
      { role: "style", prompt: "golden hour palette", strength: 0.5 },
    ]);
    assert.match(merged, /Primary subject reference \(influence 100%\)/);
    assert.match(merged, /Style reference.*50%/);
  });

  it("normalizes role aliases", () => {
    assert.equal(normalizeRefRole("Style ref", 1), "style");
    assert.equal(normalizeRefRole("", 0), "primary");
  });
});

describe("prompt weight inspector", () => {
  it("detects weighted tokens and limit warnings", () => {
    const inspection = inspectPromptWeights(
      "(helmet:1.4), gravel bike, race",
      "sd15",
    );
    assert.equal(inspection.weightedTokens.length, 1);
    assert.equal(inspection.weightedTokens[0]?.text, "helmet");
  });
});

describe("rating mutations", () => {
  it("suggests refine for low ratings only", () => {
    const entry = {
      id: "1",
      promptId: "p1",
      prompt: "test prompt",
      comfyUrl: "",
      status: "completed" as const,
      queuedAt: Date.now(),
      images: [],
    } satisfies ComfyGalleryEntry;

    assert.equal(suggestRatingMutations(entry, 5).length, 0);
    assert.ok(suggestRatingMutations(entry, 1).some((item) => item.kind === "refine"));
  });
});

describe("video prompt builder", () => {
  it("includes motion and continuity guidance", () => {
    const prompt = buildVideoPrompt({
      subject: "A fox runs through snow",
      motion: "bounding strides",
      durationSec: 6,
    });
    assert.match(prompt, /6s clip/);
    assert.match(prompt, /temporal continuity/i);
  });
});

describe("workflow node mapper", () => {
  it("suggests positive and negative encode nodes", () => {
    const mappings = suggestWorkflowNodeMappings(
      JSON.stringify({
        "3": { class_type: "CLIPTextEncode", _meta: { title: "Positive Prompt" } },
        "4": { class_type: "CLIPTextEncode", _meta: { title: "Negative Prompt" } },
      }),
    );
    assert.equal(mappings.length, 2);
    assert.ok(mappings.some((entry) => entry.suggestedBinding === "positive"));
    assert.ok(mappings.some((entry) => entry.suggestedBinding === "negative"));
  });
});

describe("aesthetic score", () => {
  it("weights review rating and favorites", () => {
    const entry = {
      id: "1",
      promptId: "p1",
      prompt: "a".repeat(120),
      comfyUrl: "",
      status: "completed" as const,
      queuedAt: Date.now(),
      images: [],
      reviewRating: 5 as const,
      favorite: true,
    } satisfies ComfyGalleryEntry;
    const score = scoreGalleryEntryHeuristic(entry);
    assert.ok(score.score >= 90);
  });
});

describe("project bundle", () => {
  it("filters history and gallery by project id", () => {
    const bundle = buildProjectBundle({
      project: {
        id: "proj-a",
        name: "A",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      history: [
        {
          id: "h1",
          tool: "generate",
          model: "sd15",
          prompt: "one",
          timestamp: Date.now(),
          metadata: { projectId: "proj-a" },
        },
        {
          id: "h2",
          tool: "generate",
          model: "sd15",
          prompt: "two",
          timestamp: Date.now(),
          metadata: { projectId: "proj-b" },
        },
      ],
      gallery: [
        {
          id: "g1",
          promptId: "p1",
          prompt: "one",
          projectId: "proj-a",
          comfyUrl: "",
          status: "completed",
          queuedAt: Date.now(),
          images: [],
        },
      ],
      scenePresets: [],
    });
    assert.equal(bundle.history.length, 1);
    assert.equal(bundle.gallery.length, 1);
    assert.equal(bundle.scenePresets.length, 0);
  });
});
