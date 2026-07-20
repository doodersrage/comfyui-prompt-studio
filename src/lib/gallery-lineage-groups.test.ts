import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ComfyGalleryEntry } from "./comfyui-gallery.ts";
import {
  buildGalleryLineageGroups,
  galleryLineageGroupingEnabled,
} from "./gallery-lineage-groups.ts";

function entry(
  id: string,
  overrides: Partial<ComfyGalleryEntry> = {},
): ComfyGalleryEntry {
  return {
    id,
    promptId: id,
    prompt: "test",
    tool: "qwen-image",
    model: "qwen-image-2512",
    comfyUrl: "http://127.0.0.1:8188",
    status: "completed",
    queuedAt: 1,
    images: [],
    ...overrides,
  };
}

describe("gallery-lineage-groups", () => {
  it("groups parent entries with their derivatives", () => {
    const groups = buildGalleryLineageGroups([
      entry("root", { queuedAt: 1 }),
      entry("upscale", {
        queuedAt: 2,
        parentGalleryEntryId: "root",
        derivedKind: "upscale",
      }),
      entry("refine", {
        queuedAt: 3,
        parentGalleryEntryId: "root",
        derivedKind: "refine",
      }),
    ]);

    assert.equal(groups.length, 1);
    assert.equal(groups[0]?.root.id, "root");
    assert.deepEqual(
      groups[0]?.derivatives.map((derivative) => derivative.id),
      ["upscale", "refine"],
    );
  });

  it("skips lineage grouping when derivative filter is active", () => {
    assert.equal(
      galleryLineageGroupingEnabled({ derivativeOfEntryId: "root", focusEntryId: "" }),
      false,
    );
    assert.equal(
      galleryLineageGroupingEnabled({ derivativeOfEntryId: "", focusEntryId: "" }),
      true,
    );
  });
});
