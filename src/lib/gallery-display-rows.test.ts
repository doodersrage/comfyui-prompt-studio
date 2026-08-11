import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ComfyGalleryEntry } from "./comfyui-gallery";
import {
  buildGalleryDisplayRows,
  countGalleryDisplayEntries,
} from "./gallery-display-rows";

function entry(id: string): ComfyGalleryEntry {
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
  };
}

describe("gallery-display-rows", () => {
  it("chunks flat entries into card rows by column count", () => {
    const rows = buildGalleryDisplayRows(null, [entry("a"), entry("b"), entry("c"), entry("d"), entry("e")], new Set(), 2);

    assert.equal(rows.length, 3);
    assert.equal(rows[0]?.kind, "cards");
    assert.equal(rows[1]?.kind, "cards");
    assert.equal(rows[2]?.kind, "cards");
    if (rows[0]?.kind === "cards" && rows[2]?.kind === "cards") {
      assert.deepEqual(rows[0].entries.map(item => item.id), ["a", "b"]);
      assert.deepEqual(rows[2].entries.map(item => item.id), ["e"]);
    }
  });

  it("inserts lineage rows and flushes pending cards", () => {
    const rows = buildGalleryDisplayRows(
      [
        { root: entry("solo"), derivatives: [] },
        {
          root: entry("root"),
          derivatives: [entry("child-a"), entry("child-b")],
        },
      ],
      [entry("solo"), entry("root"), entry("child-a"), entry("child-b")],
      new Set(),
      3,
    );

    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.kind, "cards");
    assert.equal(rows[1]?.kind, "lineage");
    if (rows[1]?.kind === "lineage") {
      assert.equal(rows[1].groupId, "root");
      assert.equal(rows[1].derivatives.length, 2);
    }
  });

  it("counts collapsed lineage derivatives only once", () => {
    const rows = buildGalleryDisplayRows(
      [{ root: entry("root"), derivatives: [entry("child-a"), entry("child-b")] }],
      [entry("root"), entry("child-a"), entry("child-b")],
      new Set(["root"]),
      2,
    );

    assert.equal(countGalleryDisplayEntries(rows), 1);
  });

  it("surfaces experiment clusters ahead of flat cards", () => {
    const a = { ...entry("a"), prompt: "same prompt here" };
    const b = { ...entry("b"), prompt: "same prompt here" };
    const c = entry("solo");
    const rows = buildGalleryDisplayRows(null, [a, b, c], new Set(), 2, {
      experimentGroups: [
        {
          id: "same-prompt",
          label: "same prompt here",
          parentPrompt: "same prompt here",
          entries: [a, b],
          variants: { seeds: ["1", "2"], cfgValues: [], stepValues: [] },
        },
      ],
      winners: { "same-prompt": { entryId: "a" } },
    });

    assert.equal(rows[0]?.kind, "experiment");
    if (rows[0]?.kind === "experiment") {
      assert.equal(rows[0].winnerEntryId, "a");
      assert.equal(rows[0].entries.length, 2);
    }
    assert.ok(rows.some(row => row.kind === "cards"));
  });
});
