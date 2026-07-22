import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_IPADAPTER_IMAGE_TOKEN,
  DEFAULT_IPADAPTER_MODEL_TOKEN,
  DEFAULT_IPADAPTER_STRENGTH_TOKEN,
  clampIpAdapterStrength,
  findUnresolvedIpAdapterTokens,
  patchIpAdapterNodesInWorkflow,
  patchIpAdapterTokensInWorkflow,
  replaceIpAdapterTokensInWorkflowJson,
} from "./ipadapter-workflow-patch.ts";

describe("clampIpAdapterStrength", () => {
  it("clamps into the 0-1 range", () => {
    assert.equal(clampIpAdapterStrength(1.5), 1);
    assert.equal(clampIpAdapterStrength(-0.4), 0);
    assert.equal(clampIpAdapterStrength(0.6), 0.6);
  });

  it("returns undefined for empty/non-numeric input", () => {
    assert.equal(clampIpAdapterStrength(undefined), undefined);
    assert.equal(clampIpAdapterStrength(""), undefined);
    assert.equal(clampIpAdapterStrength("not-a-number"), undefined);
  });

  it("coerces numeric strings", () => {
    assert.equal(clampIpAdapterStrength("0.8"), 0.8);
  });
});

describe("patchIpAdapterNodesInWorkflow", () => {
  it("patches the LoadImage filename token", () => {
    const workflow = {
      "1": { class_type: "LoadImage", inputs: { image: DEFAULT_IPADAPTER_IMAGE_TOKEN } },
    };
    const result = patchIpAdapterNodesInWorkflow(workflow, {
      imageFilename: "reference.png",
    });
    const node = result.workflow["1"] as { inputs: Record<string, unknown> };
    assert.equal(node.inputs.image, "reference.png");
    assert.equal(result.patched.image, 1);
  });

  it("patches weight/strength fields on IPAdapter-family nodes", () => {
    const workflow = {
      "1": {
        class_type: "IPAdapterAdvanced",
        inputs: { weight: DEFAULT_IPADAPTER_STRENGTH_TOKEN, weight_type: "linear" },
      },
    };
    const result = patchIpAdapterTokensInWorkflow(workflow, { strength: 0.75 });
    const node = result.workflow["1"] as { inputs: Record<string, unknown> };
    assert.equal(node.inputs.weight, 0.75);
    assert.equal(result.patched.strength, 1);
  });

  it("clamps out-of-range strength before patching", () => {
    const workflow = {
      "1": { class_type: "IPAdapter", inputs: { strength: DEFAULT_IPADAPTER_STRENGTH_TOKEN } },
    };
    const result = patchIpAdapterNodesInWorkflow(workflow, { strength: 3 });
    const node = result.workflow["1"] as { inputs: Record<string, unknown> };
    assert.equal(node.inputs.strength, 1);
  });

  it("patches the ipadapter_file model token on loader nodes", () => {
    const workflow = {
      "1": {
        class_type: "IPAdapterModelLoader",
        inputs: { ipadapter_file: DEFAULT_IPADAPTER_MODEL_TOKEN },
      },
    };
    const result = patchIpAdapterNodesInWorkflow(workflow, {
      modelFilename: "ip-adapter-plus_sdxl.safetensors",
    });
    const node = result.workflow["1"] as { inputs: Record<string, unknown> };
    assert.equal(node.inputs.ipadapter_file, "ip-adapter-plus_sdxl.safetensors");
    assert.equal(result.patched.model, 1);
  });

  it("does not touch non-IPAdapter nodes or unrelated LoadImage nodes", () => {
    const workflow = {
      "1": { class_type: "LoadImage", inputs: { image: "unrelated.png" } },
      "2": { class_type: "KSampler", inputs: { seed: 1 } },
    };
    const result = patchIpAdapterTokensInWorkflow(workflow, {
      imageFilename: "reference.png",
      strength: 0.5,
      modelFilename: "model.safetensors",
    });
    assert.deepEqual(result.patched, {});
    const image = result.workflow["1"] as { inputs: Record<string, unknown> };
    assert.equal(image.inputs.image, "unrelated.png");
  });

  it("is a no-op when no ref settings are provided", () => {
    const workflow = {
      "1": { class_type: "LoadImage", inputs: { image: DEFAULT_IPADAPTER_IMAGE_TOKEN } },
    };
    const result = patchIpAdapterTokensInWorkflow(workflow, {});
    assert.equal(result.workflow, workflow);
    assert.deepEqual(result.patched, {});
  });
});

describe("replaceIpAdapterTokensInWorkflowJson", () => {
  it("replaces tokens found on unrecognized custom node fields", () => {
    const workflow = {
      "1": {
        class_type: "SomeCommunityIPAdapterNode",
        inputs: {
          note: `ref=${DEFAULT_IPADAPTER_IMAGE_TOKEN}`,
          amount: DEFAULT_IPADAPTER_STRENGTH_TOKEN,
          checkpoint: DEFAULT_IPADAPTER_MODEL_TOKEN,
        },
      },
    };
    const next = replaceIpAdapterTokensInWorkflowJson(workflow, {
      imageFilename: "face.png",
      strength: 0.42,
      modelFilename: "custom-ipadapter.bin",
    });
    const node = next["1"] as { inputs: Record<string, unknown> };
    assert.equal(node.inputs.note, "ref=face.png");
    assert.equal(node.inputs.amount, "0.42");
    assert.equal(node.inputs.checkpoint, "custom-ipadapter.bin");
  });

  it("returns the original workflow reference when no tokens are present", () => {
    const workflow = { "1": { class_type: "KSampler", inputs: { seed: 1 } } };
    const next = replaceIpAdapterTokensInWorkflowJson(workflow, { imageFilename: "x.png" });
    assert.equal(next, workflow);
  });
});

describe("findUnresolvedIpAdapterTokens", () => {
  it("lists unresolved tokens remaining in a workflow", () => {
    const workflow = {
      "1": { class_type: "LoadImage", inputs: { image: DEFAULT_IPADAPTER_IMAGE_TOKEN } },
    };
    assert.deepEqual(findUnresolvedIpAdapterTokens(workflow), [DEFAULT_IPADAPTER_IMAGE_TOKEN]);
  });

  it("returns an empty array once resolved", () => {
    const workflow = { "1": { class_type: "LoadImage", inputs: { image: "resolved.png" } } };
    assert.deepEqual(findUnresolvedIpAdapterTokens(workflow), []);
  });
});
