import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  auditLoraStackAtQueueTime,
  collectActiveLoraNodesInWorkflow,
} from "./lora-stack-preflight.ts";
import { buildWorkflowScaffoldForModel } from "./workflow-scaffold.ts";
import { applyLoraStackToWorkflow } from "./lora-stack.ts";

describe("lora stack preflight", () => {
  it("collects active non-lightning lora loaders from workflow json", () => {
    const nodes = collectActiveLoraNodesInWorkflow(
      JSON.stringify({
        "11": {
          class_type: "LoraLoaderModelOnly",
          inputs: {
            model: ["1", 0],
            lora_name: "flux_realism.safetensors",
            strength_model: 0.75,
          },
        },
        "12": {
          class_type: "LoraLoaderModelOnly",
          inputs: {
            model: ["1", 0],
            lora_name: "{{LORA_LIGHTNING}}",
            strength_model: 1,
          },
        },
        "13": {
          class_type: "LoraLoaderModelOnly",
          inputs: {
            model: ["1", 0],
            lora_name: "disabled.safetensors",
            strength_model: 0,
          },
        },
      }),
    );
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0]?.filename, "flux_realism.safetensors");
  });

  it("warns when expected stack does not appear in prepared klein workflow", () => {
    const scaffold = buildWorkflowScaffoldForModel("flux-2-klein-9b");
    const issues = auditLoraStackAtQueueTime({
      model: "flux-2-klein-9b",
      workflowJson: scaffold.json,
      loraLibrary: [
        {
          id: "realism",
          label: "Realism",
          triggerPhrase: "",
          tokenValue: "flux_realism.safetensors",
          strengthModel: 0.8,
          strengthClip: 0.8,
          enabled: true,
        },
      ],
    });
    assert.ok(
      issues.some((issue) => /no active LoRA loaders/i.test(issue.message)),
    );
  });

  it("passes when lora stack is chained into klein scaffold", () => {
    const scaffold = buildWorkflowScaffoldForModel("flux-2-klein-9b");
    const workflow = JSON.parse(scaffold.json) as Record<string, unknown>;
    const patched = applyLoraStackToWorkflow(workflow, [
      {
        id: "realism",
        label: "Realism",
        triggerPhrase: "",
        tokenValue: "flux_realism.safetensors",
        strengthModel: 0.8,
        strengthClip: 0.8,
        enabled: true,
      },
    ]);
    const issues = auditLoraStackAtQueueTime({
      model: "flux-2-klein-9b",
      workflowJson: JSON.stringify(patched.workflow),
      loraLibrary: [
        {
          id: "realism",
          label: "Realism",
          triggerPhrase: "",
          tokenValue: "flux_realism.safetensors",
          strengthModel: 0.8,
          strengthClip: 0.8,
          enabled: true,
        },
      ],
    });
    assert.equal(issues.length, 0);
  });
});
