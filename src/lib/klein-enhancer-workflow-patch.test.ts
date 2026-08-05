import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildWorkflowScaffoldForModel } from "./workflow-scaffold";
import { ensureKleinReferenceLatentWiringInWorkflow } from "./workflow-img2img-patch";
import {
  ensureKleinEnhancerPackWiringInWorkflow,
  KLEIN_IDENTITY_FINAL_NODE,
  KLEIN_MULTI_REF_NODE,
  resolveKleinEnhancerIdentityPreset,
} from "./klein-enhancer-workflow-patch";

const ENHANCER_NODES = new Set([
  KLEIN_MULTI_REF_NODE,
  KLEIN_IDENTITY_FINAL_NODE,
]);

describe("klein enhancer workflow patch", () => {
  it("maps identity lock strength to presets", () => {
    assert.equal(resolveKleinEnhancerIdentityPreset({ identityLockStrength: 0.8 }), "HARD_LOCK");
    assert.equal(resolveKleinEnhancerIdentityPreset({ identityLockStrength: 0.5 }), "MID_LOCK");
    assert.equal(resolveKleinEnhancerIdentityPreset({ identityLockStrength: 0.2 }), "SOFT_LOCK");
  });

  it("upgrades ReferenceLatent chain to Multi ReferenceLatent + Identity Final", () => {
    const scaffold = buildWorkflowScaffoldForModel("flux-2-klein-9b");
    const wired = ensureKleinReferenceLatentWiringInWorkflow(
      JSON.parse(scaffold.json) as Record<string, unknown>,
      {
        model: "flux-2-klein-9b",
        inputImageFilenames: ["a.png", "b.png"],
      },
    );
    assert.equal(wired.wired, true);

    const result = ensureKleinEnhancerPackWiringInWorkflow(wired.workflow, {
      model: "flux-2-klein-9b",
      inputImageFilenames: ["a.png", "b.png"],
      availableNodeTypes: ENHANCER_NODES,
    });
    assert.equal(result.usedEnhancer, true);

    const nodes = result.workflow as Record<
      string,
      { class_type?: string; inputs?: Record<string, unknown> }
    >;
    assert.ok(Object.values(nodes).some(node => node.class_type === KLEIN_MULTI_REF_NODE));
    assert.ok(Object.values(nodes).some(node => node.class_type === KLEIN_IDENTITY_FINAL_NODE));
    assert.ok(!Object.values(nodes).some(node => node.class_type === "ReferenceLatent"));

    const sampler = Object.values(nodes).find(node => node.class_type === "KSampler");
    const positiveRef = sampler?.inputs?.positive;
    assert.ok(Array.isArray(positiveRef));
    assert.equal(nodes[String(positiveRef[0])]?.class_type, KLEIN_MULTI_REF_NODE);
  });

  it("no-ops when enhancer nodes are missing", () => {
    const scaffold = buildWorkflowScaffoldForModel("flux-2-klein-9b");
    const wired = ensureKleinReferenceLatentWiringInWorkflow(
      JSON.parse(scaffold.json) as Record<string, unknown>,
      {
        model: "flux-2-klein-9b",
        inputImageFilename: "a.png",
      },
    );
    const result = ensureKleinEnhancerPackWiringInWorkflow(wired.workflow, {
      model: "flux-2-klein-9b",
      inputImageFilename: "a.png",
      availableNodeTypes: new Set(["KSampler"]),
    });
    assert.equal(result.usedEnhancer, false);
    assert.ok(
      Object.values(result.workflow as Record<string, { class_type?: string }>).some(
        node => node.class_type === "ReferenceLatent",
      ),
    );
  });
});
