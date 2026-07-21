import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  rankWorkflowFilesForModel,
  suggestWorkflowDefaultsByCategory,
  workflowRequiresInputImage,
} from "./workflow-category-defaults.ts";
import { resolveWorkflowForModelSelection } from "./model-workflow-map.ts";

describe("workflow-category-defaults", () => {
  it("detects edit/inpaint workflows from json markers", () => {
    assert.equal(
      workflowRequiresInputImage('{"900":{"inputs":{"image":"{{INPUT_IMAGE}}"}}}'),
      true,
    );
    assert.equal(
      workflowRequiresInputImage('{"1":{"class_type":"EmptyLatentImage"}}'),
      false,
    );
  });

  it("prefers txt2img workflow for qwen-image-2512 over edit scaffold", () => {
    const files = [
      {
        id: "wf-edit",
        name: "Qwen Edit img2img optimized",
        filename: "qwen-edit.json",
        workflowJson:
          '{"900":{"class_type":"LoadImage","inputs":{"image":"{{INPUT_IMAGE}}"}},"2":{"class_type":"DualCLIPLoader"}}',
      },
      {
        id: "wf-t2i",
        name: "Qwen 2512 txt2img",
        filename: "qwen-t2i.json",
        workflowJson:
          '{"6":{"class_type":"EmptyLatentImage","inputs":{"width":1024,"height":1024}}}',
      },
    ];

    const suggested = suggestWorkflowDefaultsByCategory(files);
    assert.equal(suggested["qwen-image-2512"], "wf-t2i");

    const forGenerate = resolveWorkflowForModelSelection("qwen-image-2512", {
      workflowFiles: files,
      tool: "generate",
    });
    assert.equal(forGenerate, "wf-t2i");
  });

  it("still allows edit workflow when tool is inpaint", () => {
    const files = [
      {
        id: "wf-edit",
        name: "Qwen Edit img2img",
        filename: "qwen-edit.json",
        workflowJson: '{"900":{"inputs":{"image":"{{INPUT_IMAGE}}"}}}',
      },
    ];

    const picked = resolveWorkflowForModelSelection("qwen-image-edit-2511", {
      workflowFiles: files,
      tool: "inpaint",
    });
    assert.equal(picked, "wf-edit");
  });

  it("ranks txt2img above edit for generate model", () => {
    const files = [
      {
        id: "wf-edit",
        name: "Qwen edit",
        filename: "edit.json",
        workflowJson: '{"image":"{{INPUT_IMAGE}}"}',
      },
      {
        id: "wf-t2i",
        name: "Qwen 2512",
        filename: "t2i.json",
        workflowJson: '{"class_type":"EmptyLatentImage"}',
      },
    ];
    const ranked = rankWorkflowFilesForModel("qwen-image-2512", files);
    assert.equal(ranked[0]?.file.id, "wf-t2i");
  });
});
