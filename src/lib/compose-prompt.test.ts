import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isComposeCapableModel, isEditQueueTool } from "./model-denoise-defaults.ts";
import {
  buildComposeInstruction,
  COMPOSE_DEFAULT_MODEL,
  multiInputImageCustomTokens,
  normalizeInputImageFilenames,
} from "./compose-prompt.ts";
import {
  DEFAULT_INPUT_IMAGE_TOKEN,
  DEFAULT_INPUT_IMAGE_2_TOKEN,
  DEFAULT_INPUT_IMAGE_3_TOKEN,
  DEFAULT_INPUT_IMAGE_4_TOKEN,
} from "./comfyui-config.ts";
import { filterModelsForQueueTool } from "./queue-tool-model.ts";
import {
  inferLoadImageBinding,
  inputImageBindingForFigureIndex,
} from "./workflow-load-image-bindings.ts";
import { applyWorkflowNodeBindings } from "./workflow-apply-bindings.ts";
import { patchLoadImageNodesInWorkflow } from "./workflow-direct-patch.ts";
import { ensureQwenEditReferenceImagesForImg2Img } from "./workflow-lightning-queue.ts";
import { suggestWorkflowNodeMappings } from "./workflow-node-mapper.ts";

describe("compose tool defaults", () => {
  it("registers compose as an edit queue tool", () => {
    assert.equal(isEditQueueTool("compose"), true);
  });

  it("defaults model id is Lightning 8 edit", () => {
    assert.equal(COMPOSE_DEFAULT_MODEL, "qwen-image-edit-2511-lightning-8");
  });

  it("filters compose picker to Qwen edit models (not flux-inpaint)", () => {
    const filtered = filterModelsForQueueTool(
      [
        "qwen-image-2512",
        "qwen-image-edit-2511-lightning-8",
        "flux-inpaint",
        "flux-dev",
      ],
      "compose",
    );
    assert.deepEqual(filtered, ["qwen-image-edit-2511-lightning-8"]);
  });

  it("rejects flux-inpaint as compose-capable", () => {
    assert.equal(isComposeCapableModel("flux-inpaint"), false);
    assert.equal(isComposeCapableModel("qwen-image-edit-2511-lightning-8"), true);
  });
});

describe("compose input image filenames + tokens", () => {
  it("normalizes array with primary override", () => {
    assert.deepEqual(
      normalizeInputImageFilenames("fig1.png", ["a.png", "b.png", "c.png"]),
      ["fig1.png", "b.png", "c.png"],
    );
  });

  it("fills INPUT_IMAGE_2..4 custom tokens", () => {
    const tokens = multiInputImageCustomTokens([
      "a.png",
      "b.png",
      "c.png",
      "d.png",
    ]);
    assert.deepEqual(tokens, [
      { token: DEFAULT_INPUT_IMAGE_TOKEN, value: "a.png" },
      { token: DEFAULT_INPUT_IMAGE_2_TOKEN, value: "b.png" },
      { token: DEFAULT_INPUT_IMAGE_3_TOKEN, value: "c.png" },
      { token: DEFAULT_INPUT_IMAGE_4_TOKEN, value: "d.png" },
    ]);
  });
});

describe("compose LoadImage bindings", () => {
  it("maps Figure 1–4 titles to inputImageN kinds", () => {
    assert.equal(inferLoadImageBinding("LoadImage", "Figure 1"), "inputImage");
    assert.equal(inferLoadImageBinding("LoadImage", "Image 2"), "inputImage2");
    assert.equal(inferLoadImageBinding("LoadImage", "Ref 3 donor"), "inputImage3");
    assert.equal(inferLoadImageBinding("LoadImage", "Photo 4"), "inputImage4");
    assert.equal(inputImageBindingForFigureIndex(2), "inputImage2");
  });

  it("binds sequential untitled LoadImages to Figure slots (not control)", () => {
    assert.equal(
      inferLoadImageBinding("LoadImage", "Untitled", {
        loadImageIndex: 0,
        loadImageCount: 3,
      }),
      "inputImage",
    );
    assert.equal(
      inferLoadImageBinding("LoadImage", "Untitled", {
        loadImageIndex: 1,
        loadImageCount: 3,
      }),
      "inputImage2",
    );
    assert.equal(
      inferLoadImageBinding("LoadImage", "Untitled", {
        loadImageIndex: 2,
        loadImageCount: 3,
      }),
      "inputImage3",
    );
  });

  it("keeps control-titled LoadImage as controlImage", () => {
    assert.equal(
      inferLoadImageBinding("LoadImage", "Control Image depth"),
      "controlImage",
    );
  });

  it("applies {{INPUT_IMAGE_2}} bindings from mapper", () => {
    const json = JSON.stringify({
      "1": {
        class_type: "LoadImage",
        inputs: { image: "old.png" },
        _meta: { title: "Figure 1" },
      },
      "2": {
        class_type: "LoadImage",
        inputs: { image: "old2.png" },
        _meta: { title: "Figure 2" },
      },
    });
    const mappings = suggestWorkflowNodeMappings(json);
    const applied = applyWorkflowNodeBindings(json, mappings, {
      positive: "{{POSITIVE}}",
      negative: "{{NEGATIVE}}",
    });
    const parsed = JSON.parse(applied.json) as Record<
      string,
      { inputs: { image: string } }
    >;
    assert.equal(parsed["1"]!.inputs.image, DEFAULT_INPUT_IMAGE_TOKEN);
    assert.equal(parsed["2"]!.inputs.image, DEFAULT_INPUT_IMAGE_2_TOKEN);
  });

  it("patches multi LoadImage filenames by figure title", () => {
    const workflow = {
      "1": {
        class_type: "LoadImage",
        inputs: { image: "{{INPUT_IMAGE}}" },
        _meta: { title: "Figure 1" },
      },
      "2": {
        class_type: "LoadImage",
        inputs: { image: "{{INPUT_IMAGE_2}}" },
        _meta: { title: "Figure 2" },
      },
      "3": {
        class_type: "LoadImage",
        inputs: { image: "{{INPUT_IMAGE_3}}" },
        _meta: { title: "Figure 3" },
      },
    };
    const { workflow: patched, patched: counts } = patchLoadImageNodesInWorkflow(
      workflow,
      "a.png",
      ["a.png", "b.png", "c.png"],
    );
    const nodes = patched as typeof workflow;
    assert.equal(nodes["1"]!.inputs.image, "a.png");
    assert.equal(nodes["2"]!.inputs.image, "b.png");
    assert.equal(nodes["3"]!.inputs.image, "c.png");
    assert.equal(counts.inputImage, 3);
  });

  it("wires multi LoadImage into Qwen EditPlus encode slots", () => {
    const workflow = {
      "4": {
        class_type: "TextEncodeQwenImageEditPlus",
        inputs: {
          prompt: "edit",
          clip: ["2", 0],
          vae: ["3", 0],
        },
      },
    };
    const { workflow: next, wiredNodeIds } = ensureQwenEditReferenceImagesForImg2Img(
      workflow,
      {
        hasInputImage: true,
        inputImageFilename: "fig1.png",
        inputImageFilenames: ["fig1.png", "fig2.png", "fig3.png"],
      },
    );
    assert.ok(wiredNodeIds.includes("4"));
    const encode = next["4"] as {
      inputs: Record<string, [string, number] | string>;
    };
    const loaders = Object.entries(next).filter(
      ([, node]) =>
        (node as { class_type?: string })?.class_type === "LoadImage",
    );
    assert.equal(loaders.length, 3);
    assert.ok(Array.isArray(encode.inputs.image1));
    assert.ok(Array.isArray(encode.inputs.image2));
    assert.ok(Array.isArray(encode.inputs.image3));
    assert.equal(
      (next[encode.inputs.image1[0]] as { _meta?: { title?: string } })._meta
        ?.title,
      "Figure 1",
    );
    assert.equal(
      (next[encode.inputs.image2[0]] as { _meta?: { title?: string } })._meta
        ?.title,
      "Figure 2",
    );
  });
});

describe("compose instruction builder", () => {
  it("prefixes transfer instructions without Figure labels", () => {
    assert.equal(
      buildComposeInstruction({
        mode: "transfer",
        instruction: "swap the jacket",
        figureCount: 2,
      }),
      "Using Figure 1, Figure 2: swap the jacket",
    );
  });

  it("leaves labeled transfer instructions alone", () => {
    const text = "Keep pose from Figure 1. Use jacket from Figure 2.";
    assert.equal(
      buildComposeInstruction({
        mode: "transfer",
        instruction: text,
        figureCount: 2,
      }),
      text,
    );
  });

  it("expands keep/replace modify segments", () => {
    const built = buildComposeInstruction({
      mode: "modify",
      instruction: "keep: face\nreplace: rainy alley",
      figureCount: 1,
    });
    assert.match(built, /Keep unchanged: face/);
    assert.match(built, /Replace with: rainy alley/);
  });
});
