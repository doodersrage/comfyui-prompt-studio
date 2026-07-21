import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildGalleryMoireCleanWorkflow,
  buildGalleryUpscaleWorkflow,
  resolveGalleryOutputImageUrl,
} from "./gallery-output-upscale.ts";

describe("gallery-output-upscale", () => {
  it("builds a Lanczos-only Final upscale workflow when no neural model is set", () => {
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

  it("builds neural upscale chain for Final when an upscale model is set", () => {
    const workflow = buildGalleryUpscaleWorkflow({
      qualityProfile: "final",
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
    const scaleNode = Object.values(workflow).find(
      (node) => node.class_type === "ImageScaleBy",
    );
    assert.equal(scaleNode?.inputs.scale_by, 0.3125);
    assert.equal(scaleNode?.inputs.upscale_method, "area");
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
      "ImageScaleBy",
      "SaveImage",
    ]);
    const scaleNodes = Object.values(workflow).filter(
      (node) => node.class_type === "ImageScaleBy",
    );
    // 1.5 / 4 / 1.05 — polish baked into target so net Max size stays 1.5×.
    assert.equal(scaleNodes[0]?.inputs.scale_by, 0.3571);
    assert.equal(scaleNodes[0]?.inputs.upscale_method, "area");
    assert.equal(scaleNodes[1]?.inputs.scale_by, 1.05);
    assert.equal(scaleNodes[1]?.inputs.upscale_method, "lanczos");
  });

  it("falls back to Lanczos Max when neural model is not installed", () => {
    const workflow = buildGalleryUpscaleWorkflow({
      qualityProfile: "max",
      upscaleModelFilename: "4x-UltraSharp.pth",
      availableUpscaleModels: ["RealESRGAN_x4plus.pth"],
    });
    const classTypes = Object.values(workflow).map((node) => node.class_type);
    assert.equal(classTypes.includes("UpscaleModelLoader"), false);
    assert.equal(classTypes.includes("ImageScaleBy"), true);
  });

  it("builds Lightning pass-through without reprocess", () => {
    const workflow = buildGalleryUpscaleWorkflow({
      qualityProfile: "final",
      model: "qwen-image-2512-lightning-8",
      upscaleModelFilename: "4x-UltraSharp.pth",
    });
    const classTypes = Object.values(workflow).map((node) => node.class_type);
    assert.deepEqual(classTypes, ["LoadImage", "SaveImage"]);
  });

  it("builds gallery moiré clean as blur-only on Final", () => {
    const workflow = buildGalleryMoireCleanWorkflow("final");
    const classTypes = Object.values(workflow).map((node) => node.class_type);
    assert.deepEqual(classTypes, ["LoadImage", "ImageBlur", "SaveImage"]);
  });

  it("builds gallery moiré clean with mild resample on Max", () => {
    const workflow = buildGalleryMoireCleanWorkflow("max");
    const classTypes = Object.values(workflow).map((node) => node.class_type);
    assert.deepEqual(classTypes, [
      "LoadImage",
      "ImageBlur",
      "ImageScaleBy",
      "ImageScaleBy",
      "ImageSharpen",
      "SaveImage",
    ]);
    const down = Object.values(workflow).find(
      (node) =>
        node.class_type === "ImageScaleBy" &&
        node.inputs.upscale_method === "bicubic",
    );
    assert.equal(down?.inputs.scale_by, 0.9);
  });

  it("resolves gallery output view URL", () => {
    const url = resolveGalleryOutputImageUrl({
      comfyUrl: "http://127.0.0.1:8188",
      images: [{ filename: "out.png", subfolder: "", type: "output" }],
    });
    assert.match(url ?? "", /out\.png/);
  });

  it("falls back to sourceImageUrl when images array is empty", () => {
    const url = resolveGalleryOutputImageUrl({
      comfyUrl: "http://127.0.0.1:8188",
      images: [],
      sourceImageUrl: "http://127.0.0.1:8188/view?filename=sidecar.png",
    });
    assert.equal(url, "http://127.0.0.1:8188/view?filename=sidecar.png");
  });
});
