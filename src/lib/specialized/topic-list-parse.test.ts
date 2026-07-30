import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseTopicLines, splitTopicCandidates } from "./topic-list-parse";

describe("splitTopicCandidates", () => {
  it("preserves newline-separated topics", () => {
    assert.deepEqual(
      splitTopicCandidates("neon rooftop garden\nvertical farm at dusk\n"),
      ["neon rooftop garden", "vertical farm at dusk"],
    );
  });

  it("splits numbered lists on one line", () => {
    assert.deepEqual(
      splitTopicCandidates("1. sunlit plaza 2. moss-covered tram 3. crystal greenhouse"),
      ["sunlit plaza", "moss-covered tram", "crystal greenhouse"],
    );
  });

  it("strips markdown fences without joining lines", () => {
    assert.deepEqual(
      splitTopicCandidates("```\nfirst topic\nsecond topic\n```"),
      ["first topic", "second topic"],
    );
  });
});

describe("parseTopicLines", () => {
  it("dedupes and caps count", () => {
    const topics = parseTopicLines(
      "solarpunk market\nsolarpunk market\nbioluminescent alley",
      2,
    );
    assert.deepEqual(topics, ["solarpunk market", "bioluminescent alley"]);
  });

  it("parses numbered output after line collapse (regression)", () => {
    const collapsed =
      "sunbeams 2. greenerytiles 3. wildflowerscapes 4. crystallinecells";
    const topics = parseTopicLines(collapsed, 4);
    assert.equal(topics.length, 4);
    assert.equal(topics[0], "sunbeams");
    assert.equal(topics[1], "greenerytiles");
  });
});
