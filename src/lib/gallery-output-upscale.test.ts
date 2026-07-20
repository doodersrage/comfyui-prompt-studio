import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildGalleryUpscaleWorkflow,
  resolveGalleryOutputImageUrl,
} from "./gallery-output-upscale.ts";

describe("gallery-output-upscale", () => {
  it("builds a Lanczos-only Final upscale workflow", () => {
    const workflow = buildGalleryUpscaleWorkflow({
      qualityProfile: "final",
    });

    const nodes = Object.values(workflow);
    assert.equal(nodes.some((node) => node.class_type === "LoadImage"), true);
    assert.equal(
      nodes.filter((node) => node.class_type === "ImageScaleBy").length,
      1,
    );
    assert.equal(nodes.some((node) => node.class_type === "SaveImage"), true);
    assert.equal(
      nodes.some((node) => node.class_type === "UpscaleModelLoader"),
      false,
    );

    const scaleNode = nodes.find((node) => node.class_type === "ImageScaleBy");
    assert.equal(scaleNode?.inputs.scale_by, 1.25);
  });

  it("builds Max Lanczos upscale when no neural model is configured", () => {
    const workflow = buildGalleryUpscaleWorkflow({
      qualityProfile: "max",
    });

    const scaleNode = Object.values(workflow).find(
      (node) => node.class_type === "ImageScaleBy",
    );
    assert.equal(scaleNode?.inputs.scale_by, 1.5);
  });

  it("builds neural upscale chain when Max has an upscale model", () => {
    const workflow = buildGalleryUpscaleWorkflow({
      qualityProfile: "max",
      upscaleModelFilename: "4x-UltraSharp.pth",
    });

    const classTypes = Object.values(workflow).map((node) => node.class_type);
    assert.deepEqual(classTypes, [
      "LoadImage",
      "UpscaleModelLoader",
      "ImageUpscaleWithModel",
      "ImageScaleBy",
      "SaveImage",
    ]);
  });

  it("resolves gallery output view URL", () => {
    const url = resolveGalleryOutputImageUrl({
      comfyUrl: "http://127.0.0.1:8188",
      images: [{ filename: "out.png", subfolder: "", type: "output" }],
    });
    assert.match(url ?? "", /out\.png/);
  });
});
