import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildLoaderMapDiffSamples,
  detectLoaderMapDivergence,
  detectStorageConflicts,
  suggestMergeChoice,
} from "./storage-merge";

describe("detectStorageConflicts", () => {
  it("ignores small timestamp skew", () => {
    const conflicts = detectStorageConflicts({
      namespaces: [
        {
          namespace: "comfy-gallery",
          local: { updatedAt: 1_000_000, count: 3 },
          server: { updatedAt: 1_000_500, count: 3 },
        },
      ],
    });
    assert.equal(conflicts.length, 0);
  });

  it("flags large divergences when both sides have data", () => {
    const conflicts = detectStorageConflicts({
      namespaces: [
        {
          namespace: "comfy-gallery",
          local: { updatedAt: 1_000_000, count: 5 },
          server: { updatedAt: 2_000_000, count: 4 },
        },
      ],
    });
    assert.equal(conflicts.length, 1);
  });
});

describe("detectLoaderMapDivergence", () => {
  it("flags maps with different keys or values", () => {
    const diffs = detectLoaderMapDivergence(
      {
        modelCheckpointMap: { "flux-dev": "a.safetensors" },
        modelLoraMap: { "flux-dev": ["skin"] },
      },
      {
        modelCheckpointMap: { "flux-dev": "b.safetensors" },
        modelLoraMap: { "flux-dev": ["skin"] },
      },
    );
    assert.deepEqual(diffs, ["modelCheckpointMap"]);
  });

  it("builds short before/after samples", () => {
    const samples = buildLoaderMapDiffSamples(
      { modelCheckpointMap: { "flux-dev": "a.safetensors" } },
      { modelCheckpointMap: { "flux-dev": "b.safetensors" } },
      ["modelCheckpointMap"],
    );
    assert.equal(samples.length, 1);
    assert.equal(samples[0]?.entryKey, "flux-dev");
    assert.match(samples[0]?.localValue ?? "", /a\.safetensors/);
    assert.match(samples[0]?.serverValue ?? "", /b\.safetensors/);
  });
});

describe("suggestMergeChoice", () => {
  it("prefers server when local is empty", () => {
    assert.equal(
      suggestMergeChoice({
        localCount: 0,
        serverCount: 4,
      } as const),
      "server",
    );
  });

  it("prefers local when server is empty", () => {
    assert.equal(
      suggestMergeChoice({
        localCount: 2,
        serverCount: 0,
      } as const),
      "local",
    );
  });

  it("merges when both sides have data", () => {
    assert.equal(
      suggestMergeChoice({
        localCount: 3,
        serverCount: 5,
      } as const),
      "merge",
    );
  });
});
