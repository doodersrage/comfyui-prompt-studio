import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterModelsForQueueTool,
  isSceneGenerationModel,
  resolveModelForPromptGeneration,
  resolveModelForQueueTool,
  stripEditInstructionLead,
} from "./queue-tool-model";

describe("queue-tool-model", () => {
  it("keeps the selected Lightning edit model on generate (no silent remap)", () => {
    assert.equal(
      resolveModelForQueueTool("qwen-image-edit-2511-lightning-8", "generate"),
      "qwen-image-edit-2511-lightning-8",
    );
  });

  it("maps edit Lightning to T2I counterpart for prompt writing on generate", () => {
    assert.equal(
      resolveModelForPromptGeneration(
        "qwen-image-edit-2511-lightning-8",
        "generate",
      ),
      "qwen-image-2512-lightning-8",
    );
  });

  it("keeps edit model for prompt writing on refine", () => {
    assert.equal(
      resolveModelForPromptGeneration(
        "qwen-image-edit-2511-lightning-8",
        "refine",
      ),
      "qwen-image-edit-2511-lightning-8",
    );
  });

  it("keeps edit model on refine tool", () => {
    assert.equal(
      resolveModelForQueueTool("qwen-image-edit-2511-lightning-8", "refine"),
      "qwen-image-edit-2511-lightning-8",
    );
  });

  it("filters edit models from full generate catalog", () => {
    const filtered = filterModelsForQueueTool(
      ["qwen-image-2512", "qwen-image-edit-2511-lightning-8"],
      "generate",
    );
    assert.deepEqual(filtered, ["qwen-image-2512"]);
  });

  it("keeps workflow-backed edit models on generate", () => {
    const filtered = filterModelsForQueueTool(
      ["qwen-image-2512", "qwen-image-edit-2511-lightning-8"],
      "generate",
      { workflowBacked: true },
    );
    assert.deepEqual(filtered, [
      "qwen-image-2512",
      "qwen-image-edit-2511-lightning-8",
    ]);
  });

  it("recognizes txt2img models as scene generation models", () => {
    assert.equal(isSceneGenerationModel("qwen-image-2512"), true);
    assert.equal(isSceneGenerationModel("qwen-image-edit-2511"), false);
  });

  it("keeps Rapid AIO SFW/NSFW in generate picker as dual-purpose T2I", () => {
    assert.equal(isSceneGenerationModel("qwen-rapid-aio-nsfw"), true);
    assert.equal(isSceneGenerationModel("qwen-rapid-aio-sfw"), true);
    assert.equal(isSceneGenerationModel("qwen-rapid-aio-edit"), false);
    const filtered = filterModelsForQueueTool(
      [
        "qwen-image-2512",
        "qwen-rapid-aio-nsfw",
        "qwen-rapid-aio-edit",
        "qwen-image-edit-2511",
      ],
      "generate",
    );
    assert.deepEqual(filtered, ["qwen-image-2512", "qwen-rapid-aio-nsfw"]);
  });

  it("does not remap Rapid AIO NSFW away on generate", () => {
    assert.equal(
      resolveModelForQueueTool("qwen-rapid-aio-nsfw", "generate"),
      "qwen-rapid-aio-nsfw",
    );
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
