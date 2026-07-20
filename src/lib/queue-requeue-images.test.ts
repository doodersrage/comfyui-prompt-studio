import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assignWorkflowToInferredModels } from "./model-workflow-map.ts";
import {
  buildGalleryImageUrlsFromQueueParams,
  resolveRequeueImageUrlsFromEntry,
} from "./queue-requeue-images.ts";

describe("assignWorkflowToInferredModels", () => {
  it("assigns workflow id to models without overwriting by default", () => {
    const next = assignWorkflowToInferredModels(
      "wf-flux-inpaint",
      ["flux-inpaint", "flux-dev"],
      { "flux-dev": "existing-wf" },
    );
    assert.equal(next["flux-inpaint"], "wf-flux-inpaint");
    assert.equal(next["flux-dev"], "existing-wf");
  });

  it("overwrites existing mappings when requested", () => {
    const next = assignWorkflowToInferredModels(
      "wf-flux-inpaint",
      ["flux-dev"],
      { "flux-dev": "old-wf" },
      true,
    );
    assert.equal(next["flux-dev"], "wf-flux-inpaint");
  });
});

describe("resolveRequeueImageUrlsFromEntry", () => {
  it("prefers stored source and mask urls", () => {
    const urls = resolveRequeueImageUrlsFromEntry({
      comfyUrl: "http://127.0.0.1:8188",
      images: [],
      sourceImageUrl: "/api/source.png",
      maskImageUrl: "/api/mask.png",
    });
    assert.equal(urls.sourceImageUrl, "/api/source.png");
    assert.equal(urls.maskImageUrl, "/api/mask.png");
  });

  it("builds input urls from queue params before falling back to output", () => {
    const urls = resolveRequeueImageUrlsFromEntry({
      comfyUrl: "http://127.0.0.1:8188",
      tool: "inpaint",
      model: "flux-inpaint",
      queueParams: {
        inputImageFilename: "source.png",
        maskImageFilename: "mask.png",
      },
      images: [
        { filename: "result.png", subfolder: "", type: "output" },
      ],
    });
    assert.match(urls.sourceImageUrl ?? "", /source\.png/);
    assert.match(urls.maskImageUrl ?? "", /mask\.png/);
  });
});

describe("buildGalleryImageUrlsFromQueueParams", () => {
  it("builds view urls from uploaded filenames", () => {
    const urls = buildGalleryImageUrlsFromQueueParams({
      comfyUrl: "http://127.0.0.1:8188",
      queueParams: {
        inputImageFilename: "source.png",
        maskImageFilename: "mask.png",
      },
    });
    assert.match(urls.sourceImageUrl ?? "", /source\.png/);
    assert.match(urls.maskImageUrl ?? "", /mask\.png/);
  });
});

describe("auditRequeueImageReadiness", () => {
  it("warns when inpaint job lacks refreshable mask url", async () => {
    const { auditRequeueImageReadiness } = await import("./queue-requeue-images.ts");
    const issues = auditRequeueImageReadiness({
      model: "flux-inpaint",
      tool: "inpaint",
      queueParams: { maskImageFilename: "old-mask.png" },
    });
    assert.ok(issues.length >= 1);
    assert.ok(issues.some((issue) => /mask/i.test(issue.message)));
  });
});
