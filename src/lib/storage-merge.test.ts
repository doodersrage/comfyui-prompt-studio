import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
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

describe("suggestMergeChoice", () => {
  it("prefers server when local is empty", () => {
    assert.equal(
      suggestMergeChoice({
        namespace: "comfy-gallery",
        localCount: 0,
        serverCount: 4,
      }),
      "server",
    );
  });

  it("prefers local when server is empty", () => {
    assert.equal(
      suggestMergeChoice({
        namespace: "prompt-history",
        localCount: 2,
        serverCount: 0,
      }),
      "local",
    );
  });

  it("merges when both sides have data", () => {
    assert.equal(
      suggestMergeChoice({
        namespace: "comfy-gallery",
        localCount: 3,
        serverCount: 5,
      }),
      "merge",
    );
  });
});
