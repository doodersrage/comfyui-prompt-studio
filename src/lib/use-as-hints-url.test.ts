import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PromptHistoryEntry } from "@/hooks/usePromptHistory";
import { buildUseAsHintsUrl } from "./use-as-hints-url";

function entry(
  partial: Partial<PromptHistoryEntry> & Pick<PromptHistoryEntry, "tool">,
): PromptHistoryEntry {
  return {
    id: "test-id",
    prompt: "full prompt text",
    model: "qwen-image-2512",
    timestamp: Date.now(),
    ...partial,
  };
}

describe("buildUseAsHintsUrl", () => {
  it("routes character duo entries to character with mode and hints", () => {
    const url = buildUseAsHintsUrl(
      entry({
        tool: "duo",
        hints: "gravel race at dusk",
      }),
    );
    assert.match(url, /\/character\?/);
    assert.match(url, /mode=duo/);
    assert.match(url, /hintSource=manual/);
    assert.match(url, /gravel\+race\+at\+dusk|gravel%20race%20at%20dusk/);
  });

  it("falls back to prompt slice when hints are missing", () => {
    const url = buildUseAsHintsUrl(
      entry({
        tool: "generate",
        prompt: "a".repeat(600),
      }),
    );
    assert.match(url, /^\/?\?/);
    assert.match(url, /hintSource=manual/);
    assert.match(url, /hints=/);
  });

  it("routes pet tool to /pet", () => {
    const url = buildUseAsHintsUrl(
      entry({
        tool: "pet",
        hints: "golden retriever, autumn leaves",
      }),
    );
    assert.match(url, /^\/pet\?/);
  });
});
