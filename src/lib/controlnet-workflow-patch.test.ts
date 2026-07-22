import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_CONTROLNET_MODEL_TOKEN,
  DEFAULT_CONTROL_IMAGE_TOKEN,
} from "./model-controlnet-map.ts";
import {
  findUnresolvedControlNetTokens,
  insertControlNetChainIfMissing,
} from "./controlnet-workflow-patch.ts";
import { patchControlNetInWorkflow } from "./workflow-direct-patch.ts";

describe("insertControlNetChainIfMissing", () => {
  it("inserts LoadImage → loader → apply and rewires sampler conditioning", () => {
    const workflow = {
      "1": {
        class_type: "CLIPTextEncode",
        inputs: { text: "pos", clip: ["0", 1] },
      },
      "2": {
        class_type: "CLIPTextEncode",
        inputs: { text: "neg", clip: ["0", 1] },
      },
      "3": {
        class_type: "KSampler",
        inputs: {
          seed: 1,
          steps: 20,
          cfg: 7,
          model: ["0", 0],
          positive: ["1", 0],
          negative: ["2", 0],
          latent_image: ["4", 0],
        },
      },
    };
    const result = insertControlNetChainIfMissing(workflow, {
      controlImageFilename: "pose.png",
      availableNodeTypes: ["ControlNetApply", "ControlNetLoader", "LoadImage"],
    });
    assert.equal(result.inserted, true);
    assert.equal(result.insertedNodeIds.length, 3);
    const sampler = result.workflow["3"] as { inputs: Record<string, unknown> };
    assert.ok(Array.isArray(sampler.inputs.positive));
    assert.ok(Array.isArray(sampler.inputs.negative));
    assert.deepEqual(
      findUnresolvedControlNetTokens(result.workflow).sort(),
      [DEFAULT_CONTROL_IMAGE_TOKEN, DEFAULT_CONTROLNET_MODEL_TOKEN].sort(),
    );
  });

  it("inserts a preprocessor when the class is available for the mode", () => {
    const workflow = {
      "1": {
        class_type: "CLIPTextEncode",
        inputs: { text: "pos", clip: ["0", 1] },
      },
      "2": {
        class_type: "CLIPTextEncode",
        inputs: { text: "neg", clip: ["0", 1] },
      },
      "3": {
        class_type: "KSampler",
        inputs: {
          seed: 1,
          steps: 20,
          cfg: 7,
          model: ["0", 0],
          positive: ["1", 0],
          negative: ["2", 0],
          latent_image: ["4", 0],
        },
      },
    };
    const result = insertControlNetChainIfMissing(workflow, {
      controlImageFilename: "pose.png",
      controlNetMode: "canny",
      availableNodeTypes: [
        "ControlNetApply",
        "ControlNetLoader",
        "LoadImage",
        "CannyEdgePreprocessor",
      ],
    });
    assert.equal(result.inserted, true);
    assert.equal(result.preprocessorClass, "CannyEdgePreprocessor");
    assert.ok(result.insertedNodeIds.length >= 4);
    const json = JSON.stringify(result.workflow);
    assert.match(json, /CannyEdgePreprocessor/);
  });

  it("is a no-op when ControlNet nodes already exist", () => {
    const workflow = {
      "1": {
        class_type: "ControlNetLoader",
        inputs: { control_net_name: "x.pth" },
      },
      "2": {
        class_type: "KSampler",
        inputs: {
          seed: 1,
          steps: 10,
          positive: ["1", 0],
          negative: ["1", 1],
          model: ["0", 0],
        },
      },
    };
    const result = insertControlNetChainIfMissing(workflow, {
      controlImageFilename: "pose.png",
    });
    assert.equal(result.inserted, false);
  });
});

describe("patchControlNetInWorkflow", () => {
  it("inserts then patches tokens from queue filenames", () => {
    const workflow = {
      "1": {
        class_type: "CLIPTextEncode",
        inputs: { text: "pos", clip: ["0", 1] },
      },
      "2": {
        class_type: "CLIPTextEncode",
        inputs: { text: "neg", clip: ["0", 1] },
      },
      "3": {
        class_type: "KSampler",
        inputs: {
          seed: 1,
          steps: 20,
          cfg: 7,
          model: ["0", 0],
          positive: ["1", 0],
          negative: ["2", 0],
          latent_image: ["4", 0],
        },
      },
    };
    const result = patchControlNetInWorkflow(workflow, {
      controlImageFilename: "canny.png",
      controlNetModelFilename: "control_canny.pth",
      availableNodeTypes: ["ControlNetApply", "ControlNetLoader", "LoadImage"],
    });
    assert.ok((result.patched.controlNetInserted ?? 0) >= 3);
    assert.ok((result.patched.controlImage ?? 0) >= 1);
    assert.ok((result.patched.controlNet ?? 0) >= 1);
    const json = JSON.stringify(result.workflow);
    assert.ok(json.includes("canny.png"));
    assert.ok(json.includes("control_canny.pth"));
    assert.ok(!json.includes(DEFAULT_CONTROL_IMAGE_TOKEN));
  });
});
