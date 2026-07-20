import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildGalleryRefineWorkflow,
  galleryRefineDenoiseForProfile,
} from "./gallery-output-refine.ts";

describe("gallery-output-refine", () => {
  it("uses lower denoise for final than max", () => {
    assert.ok(galleryRefineDenoiseForProfile("final") < galleryRefineDenoiseForProfile("max"));
    assert.equal(galleryRefineDenoiseForProfile(undefined), galleryRefineDenoiseForProfile("final"));
  });

  it("builds qwen img2img refine workflow with VAEEncode", () => {
    const workflow = buildGalleryRefineWorkflow("qwen-image-2512");
    const classTypes = Object.values(workflow).map((node) => node.class_type);
    assert.equal(classTypes.includes("LoadImage"), true);
    assert.equal(classTypes.includes("VAEEncode"), true);
    assert.equal(classTypes.includes("KSampler"), true);
    assert.equal(classTypes.includes("EmptyLatentImage"), false);
  });

  it("builds checkpoint img2img refine workflow for SD-family models", () => {
    const workflow = buildGalleryRefineWorkflow("sdxl");
    assert.equal(Object.values(workflow).some((node) => node.class_type === "CheckpointLoaderSimple"), true);
    assert.equal(Object.values(workflow).some((node) => node.class_type === "VAEEncode"), true);
  });
});
