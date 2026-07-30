import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildWorkflowScaffoldForModel } from "./workflow-scaffold";
import { ensureKleinReferenceLatentWiringInWorkflow } from "./workflow-img2img-patch";

describe("ensureKleinReferenceLatentWiringInWorkflow", () => {
  it("builds Klein Compose scaffold with ReferenceLatent + EmptyFlux2Latent", () => {
    const scaffold = buildWorkflowScaffoldForModel(
      "flux-2-klein-9b-distilled",
      undefined,
      { tool: "compose" },
    );
    assert.match(scaffold.json, /ReferenceLatent/);
    assert.match(scaffold.json, /EmptyFlux2LatentImage/);
    assert.match(scaffold.notes.join(" "), /ReferenceLatent/i);
  });

  it("rewires Klein T2I EmptyLatent sampler to ReferenceLatent edit", () => {
    const scaffold = buildWorkflowScaffoldForModel("flux-2-klein-9b");
    const workflow = JSON.parse(scaffold.json) as Record<string, unknown>;
    assert.doesNotMatch(JSON.stringify(workflow), /ReferenceLatent/);

    const result = ensureKleinReferenceLatentWiringInWorkflow(workflow, {
      model: "flux-2-klein-9b",
      inputImageFilename: "canvas.png",
    });
    assert.equal(result.wired, true);

    const nodes = result.workflow as Record<
      string,
      { class_type?: string; inputs?: Record<string, unknown> }
    >;
    const sampler = Object.values(nodes).find(
      (node) => node.class_type === "KSampler",
    );
    assert.ok(sampler?.inputs);
    const latentRef = sampler!.inputs!.latent_image;
    assert.ok(Array.isArray(latentRef));
    assert.equal(nodes[String(latentRef[0])]?.class_type, "EmptyFlux2LatentImage");

    const positiveRef = sampler!.inputs!.positive;
    assert.ok(Array.isArray(positiveRef));
    assert.equal(nodes[String(positiveRef[0])]?.class_type, "ReferenceLatent");
  });

  it("chains ReferenceLatent for multiple figures", () => {
    const scaffold = buildWorkflowScaffoldForModel("flux-2-klein-9b");
    const result = ensureKleinReferenceLatentWiringInWorkflow(
      JSON.parse(scaffold.json) as Record<string, unknown>,
      {
        model: "flux-2-klein-9b",
        inputImageFilenames: ["a.png", "b.png"],
      },
    );
    assert.equal(result.wired, true);
    const refCount = Object.values(
      result.workflow as Record<string, { class_type?: string }>,
    ).filter((node) => node.class_type === "ReferenceLatent").length;
    assert.equal(refCount, 2);
  });

  it("ignores non-Klein models", () => {
    const scaffold = buildWorkflowScaffoldForModel("flux-dev");
    const result = ensureKleinReferenceLatentWiringInWorkflow(
      JSON.parse(scaffold.json) as Record<string, unknown>,
      {
        model: "flux-dev",
        inputImageFilename: "canvas.png",
      },
    );
    assert.equal(result.wired, false);
  });
});
