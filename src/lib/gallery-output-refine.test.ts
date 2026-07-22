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

  it("uses portrait-specific lower denoise", () => {
    assert.ok(
      galleryRefineDenoiseForProfile("final", "portrait close-up, natural skin") <
        galleryRefineDenoiseForProfile("final", "landscape mountains"),
    );
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

  it("builds Flux Klein refine with UNET + CLIPLoader + ModelSamplingFlux", () => {
    const workflow = buildGalleryRefineWorkflow("flux-2-klein-9b");
    const classTypes = Object.values(workflow).map((node) => node.class_type);
    assert.equal(classTypes.includes("UNETLoader"), true);
    assert.equal(classTypes.includes("CLIPLoader"), true);
    assert.equal(classTypes.includes("DualCLIPLoader"), false);
    assert.equal(classTypes.includes("ModelSamplingFlux"), true);
    assert.equal(classTypes.includes("CheckpointLoaderSimple"), false);
    assert.equal(classTypes.includes("ModelSamplingAuraFlow"), false);
  });
});
