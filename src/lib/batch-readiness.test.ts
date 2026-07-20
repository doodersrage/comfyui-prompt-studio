import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterBatchByReadiness,
  scoreBatchReadiness,
} from "./batch-readiness";
import {
  applyWorkflowNodeBindings,
  summarizeBindingChanges,
} from "./workflow-apply-bindings";
import { recommendModels } from "./model-recommender";

describe("batch readiness", () => {
  it("scores rows and filters blocked indexes", () => {
    const rows = scoreBatchReadiness({
      rows: [
        { prompt: "A detailed forest trail with cyclists at golden hour.", label: "A" },
        { prompt: "", label: "empty" },
      ],
      model: "flux-dev",
      detail: "balanced",
    });
    assert.equal(rows.length, 1);
    assert.ok(rows[0]!.score > 0);
    const filtered = filterBatchByReadiness(["prompt-a", "prompt-b"], [
      { ...rows[0]!, index: 0, queueAllowed: false },
    ]);
    assert.deepEqual(filtered, ["prompt-b"]);
  });
});

describe("workflow apply bindings", () => {
  it("injects positive and negative placeholders", () => {
    const workflow = JSON.stringify({
      "3": {
        class_type: "CLIPTextEncode",
        inputs: { text: "old positive" },
        _meta: { title: "positive prompt" },
      },
      "4": {
        class_type: "CLIPTextEncode",
        inputs: { text: "old negative" },
        _meta: { title: "negative prompt" },
      },
    });
    const applied = applyWorkflowNodeBindings(workflow, [
      {
        nodeId: "3",
        classType: "CLIPTextEncode",
        suggestedBinding: "positive",
        reason: "test",
      },
      {
        nodeId: "4",
        classType: "CLIPTextEncode",
        suggestedBinding: "negative",
        reason: "test",
      },
    ]);
    assert.ok(applied.json.includes("{{POSITIVE}}"));
    assert.ok(applied.json.includes("{{NEGATIVE}}"));
    assert.ok(summarizeBindingChanges(applied.changes).includes("3.text"));
  });
});

describe("model recommender", () => {
  it("recommends models from descriptive text", () => {
    const results = recommendModels("cyberpunk neon alley portrait cinematic", 2);
    assert.ok(results.length > 0);
    assert.ok(results[0]?.model);
  });
});
