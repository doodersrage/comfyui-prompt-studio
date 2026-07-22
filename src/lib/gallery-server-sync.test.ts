import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeGalleryWithServer } from "./gallery-server-sync.ts";

function entry(id: string, queuedAt: number, completedAt?: number) {
  return { id, queuedAt, completedAt };
}

describe("mergeGalleryWithServer", () => {
  it("adds server-only entries to the merged list", () => {
    const local = [entry("a", 1)];
    const server = [entry("a", 1), entry("b", 2)];
    const result = mergeGalleryWithServer(local, server);
    assert.equal(result.addedFromServer, 1);
    assert.equal(result.updatedFromServer, 0);
    assert.equal(result.merged.length, 2);
    assert.equal(result.merged.some((e) => e.id === "b"), true);
  });

  it("keeps local-only entries untouched", () => {
    const local = [entry("local-only", 5)];
    const server: ReturnType<typeof entry>[] = [];
    const result = mergeGalleryWithServer(local, server);
    assert.equal(result.merged.length, 1);
    assert.equal(result.addedFromServer, 0);
    assert.equal(result.updatedFromServer, 0);
  });

  it("prefers the newer completedAt when both sides share an id", () => {
    const local = [entry("shared", 1, 10)];
    const server = [entry("shared", 1, 20)];
    const result = mergeGalleryWithServer(local, server);
    assert.equal(result.updatedFromServer, 1);
    assert.equal(result.merged[0]?.completedAt, 20);
  });

  it("keeps the local copy when it is newer than the server copy", () => {
    const local = [entry("shared", 1, 30)];
    const server = [entry("shared", 1, 20)];
    const result = mergeGalleryWithServer(local, server);
    assert.equal(result.updatedFromServer, 0);
    assert.equal(result.merged[0]?.completedAt, 30);
  });

  it("falls back to queuedAt when completedAt is missing on both sides", () => {
    const local = [entry("shared", 5)];
    const server = [entry("shared", 9)];
    const result = mergeGalleryWithServer(local, server);
    assert.equal(result.updatedFromServer, 1);
    assert.equal(result.merged[0]?.queuedAt, 9);
  });

  it("sorts the merged list newest-first", () => {
    const local = [entry("older", 1), entry("newer", 3)];
    const server = [entry("middle", 2)];
    const result = mergeGalleryWithServer(local, server);
    assert.deepEqual(result.merged.map((e) => e.id), ["newer", "middle", "older"]);
  });
});
