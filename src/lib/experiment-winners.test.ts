import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { experimentGroupIdForPrompt } from "./experiment-groups";
import type { ComfyGalleryEntry } from "./comfyui-gallery";

function entry(id: string, prompt: string): ComfyGalleryEntry {
  return {
    id,
    promptId: id,
    prompt,
    tool: "qwen-image",
    model: "qwen-image-2512",
    comfyUrl: "http://127.0.0.1:8188",
    status: "completed",
    queuedAt: 1,
    images: [],
  };
}

describe("experiment winners helpers", () => {
  it("builds a stable 32-char group id from prompt text", () => {
    const id = experimentGroupIdForPrompt("  Hello World Prompt  ");
    assert.equal(id, "hello world prompt".slice(0, 32));
    assert.equal(experimentGroupIdForPrompt("   "), null);
  });

  it("matches groupGalleryExperiments ids for the same prompt", async () => {
    const { groupGalleryExperiments } = await import("./experiment-groups");
    const groups = groupGalleryExperiments([
      entry("a", "shared prompt text"),
      entry("b", "shared prompt text"),
    ]);
    assert.equal(groups[0]?.id, experimentGroupIdForPrompt("shared prompt text"));
  });
});
