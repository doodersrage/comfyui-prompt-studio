import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  comfyApiWorkflowToReactFlow,
  listEditableWidgets,
  reactFlowToComfyApiWorkflow,
  updateWorkflowNodeWidget,
} from "./workflow-react-flow.ts";

describe("workflow react flow round-trip", () => {
  it("converts API workflow to RF nodes/edges and back", () => {
    const workflow = {
      "1": {
        class_type: "CLIPTextEncode",
        inputs: { text: "hello", clip: ["2", 0] },
        _meta: { title: "Positive" },
      },
      "2": {
        class_type: "CheckpointLoaderSimple",
        inputs: { ckpt_name: "model.safetensors" },
      },
    };
    const { nodes, edges } = comfyApiWorkflowToReactFlow(workflow);
    assert.equal(nodes.length, 2);
    assert.equal(edges.length, 1);
    assert.equal(edges[0].source, "2");
    assert.equal(edges[0].target, "1");

    const updated = updateWorkflowNodeWidget(nodes, "1", "text", "world");
    const back = reactFlowToComfyApiWorkflow(updated, edges);
    assert.equal(
      (back["1"] as { inputs: { text: string } }).inputs.text,
      "world",
    );
    assert.deepEqual(
      (back["1"] as { inputs: { clip: [string, number] } }).inputs.clip,
      ["2", 0],
    );
  });

  it("lists editable widgets excluding links", () => {
    const widgets = listEditableWidgets({
      text: "a",
      steps: 20,
      model: ["3", 0],
    });
    assert.equal(widgets.length, 2);
  });
});
