import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_WILDCARDS,
  expandWildcardText,
  mergeWildcardMaps,
  parseWildcardListFile,
} from "./wildcard-expand.ts";

describe("wildcard list settings round-trip", () => {
  it("parses pasted list files and merges over defaults", () => {
    const custom = {
      outfit: parseWildcardListFile("# comment\nred jacket\nblue coat\n"),
    };
    assert.deepEqual(custom.outfit, ["red jacket", "blue coat"]);

    const merged = mergeWildcardMaps(DEFAULT_WILDCARDS, custom);
    assert.ok(merged.outfit?.includes("red jacket"));
    assert.ok(merged.color?.length);

    const expanded = expandWildcardText("wearing a __outfit__", {
      wildcards: custom,
      seed: "fixed",
    });
    assert.match(expanded, /wearing a (red jacket|blue coat)/);
  });
});
