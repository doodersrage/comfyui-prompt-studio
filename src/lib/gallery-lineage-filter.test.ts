import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ComfyGalleryEntry } from "./comfyui-gallery-entry.ts";
import { filterComfyGalleryEntries } from "./comfyui-gallery.ts";

const baseEntry = (patch: Partial<ComfyGalleryEntry>): ComfyGalleryEntry => ({
  id: patch.id ?? "a",
  promptId: "p1",
  prompt: "test",
  comfyUrl: "http://127.0.0.1:8188",
  status: "completed",
  queuedAt: 1,
  images: [],
  ...patch,
});

describe("gallery lineage filters", () => {
  it("filters derivatives of a parent entry", () => {
    const entries = [
      baseEntry({ id: "parent" }),
      baseEntry({ id: "child", parentGalleryEntryId: "parent", derivedKind: "upscale" }),
      baseEntry({ id: "other" }),
    ];

    const filtered = filterComfyGalleryEntries(entries, {
      derivativeOfEntryId: "parent",
    });

    assert.deepEqual(filtered.map((entry) => entry.id), ["child"]);
  });

  it("focuses a single entry by id", () => {
    const entries = [
      baseEntry({ id: "parent" }),
      baseEntry({ id: "child", parentGalleryEntryId: "parent" }),
    ];

    const filtered = filterComfyGalleryEntries(entries, {
      focusEntryId: "parent",
    });

    assert.deepEqual(filtered.map((entry) => entry.id), ["parent"]);
  });
});
