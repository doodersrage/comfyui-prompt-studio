import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterModelsForQueueTool,
  isSceneGenerationModel,
  resolveModelForQueueTool,
  stripEditInstructionLead,
} from "./queue-tool-model";

describe("queue-tool-model", () => {
  it("maps edit lightning model to txt2img counterpart on generate", () => {
    assert.equal(
      resolveModelForQueueTool("qwen-image-edit-2511-lightning-8", "generate"),
      "qwen-image-2512-lightning-8",
    );
  });

  it("keeps edit model on refine tool", () => {
    assert.equal(
      resolveModelForQueueTool("qwen-image-edit-2511-lightning-8", "refine"),
      "qwen-image-edit-2511-lightning-8",
    );
  });

  it("filters edit models from generate picker list", () => {
    const filtered = filterModelsForQueueTool(
      ["qwen-image-2512", "qwen-image-edit-2511-lightning-8"],
      "generate",
    );
    assert.deepEqual(filtered, ["qwen-image-2512"]);
  });

  it("recognizes txt2img models as scene generation models", () => {
    assert.equal(isSceneGenerationModel("qwen-image-2512"), true);
    assert.equal(isSceneGenerationModel("qwen-image-edit-2511"), false);
  });

  it("strips edit instruction preambles for generate tool", () => {
    const raw =
      "Keep the person unchanged in pose and lighting from Qwen-Image-Edit-2511 Lightning (8-step) format. Arrange cobalt blue ceramic vases filled with cream roses.";
    assert.equal(
      stripEditInstructionLead(raw, "generate"),
      "Arrange cobalt blue ceramic vases filled with cream roses.",
    );
  });
});
