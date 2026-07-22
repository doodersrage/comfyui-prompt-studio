import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeHistoryImportItems } from "./comfyui-gallery-client.ts";
import type { ComfyHistoryImportItem } from "./comfyui-status.ts";
import type { ComfyGalleryEntry } from "./comfyui-gallery.ts";

describe("mergeHistoryImportItems", () => {
  it("imports new jobs and upgrades thin duplicates with queueParams", () => {
    const existing: ComfyGalleryEntry[] = [
      {
        id: "existing",
        promptId: "abc-1",
        prompt: "first",
        tool: "comfyui-import",
        comfyUrl: "http://127.0.0.1:8188",
        status: "completed",
        queuedAt: 1,
        images: [{ filename: "a.png", type: "output", subfolder: "" }],
      },
    ];
    const items: ComfyHistoryImportItem[] = [
      {
        promptId: "abc-1",
        prompt: "first",
        comfyUrl: "http://127.0.0.1:8188",
        images: [{ filename: "a.png", type: "output", subfolder: "" }],
        queueParams: { seed: "1", steps: "20" },
        model: "flux1-dev.safetensors",
      },
      {
        promptId: "abc-2",
        prompt: "second",
        comfyUrl: "http://127.0.0.1:8188",
        images: [{ filename: "b.png", type: "output", subfolder: "" }],
        queueParams: { seed: "2" },
      },
    ];

    let id = 0;
    const result = mergeHistoryImportItems(
      existing,
      items,
      () => `id-${++id}`,
      () => 100,
    );
    assert.equal(result.imported, 1);
    assert.equal(result.upgraded, 1);
    assert.equal(result.skipped, 0);
    const upgraded = result.entries.find((entry) => entry.promptId === "abc-1");
    assert.deepEqual(upgraded?.queueParams, { seed: "1", steps: "20" });
    assert.equal(upgraded?.model, "flux1-dev.safetensors");
    assert.ok(result.entries.some((entry) => entry.promptId === "abc-2"));
  });
});
