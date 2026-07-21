import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  auditWorkflowLibraryHealth,
  summarizeWorkflowLibraryHealth,
} from "./workflow-health-audit.ts";

describe("workflow-health-audit", () => {
  it("flags unresolved loader placeholders as errors", () => {
    const report = auditWorkflowLibraryHealth({
      workflowFiles: [
        {
          id: "wf-1",
          name: "Test workflow",
          workflowJson: '{"1":{"class_type":"CheckpointLoaderSimple","inputs":{"ckpt_name":"{{CHECKPOINT}}"}}}',
        },
      ],
    });

    assert.equal(report.scanned, 1);
    assert.equal(report.healthy, 0);
    assert.ok(report.issues.some((issue) => issue.severity === "error" && /CHECKPOINT/.test(issue.message)));
    assert.ok(report.issues.some((issue) => /Not optimized yet/i.test(issue.message)));
  });

  it("summarizes clean libraries", () => {
    const summary = summarizeWorkflowLibraryHealth({
      scanned: 2,
      healthy: 2,
      issues: [],
    });
    assert.match(summary, /2 workflow\(s\) look ready/);
  });

  it("flags workflows that have never been optimized", () => {
    const report = auditWorkflowLibraryHealth({
      workflowFiles: [
        {
          id: "wf-2",
          name: "Fresh import",
          workflowJson:
            '{"1":{"class_type":"CheckpointLoaderSimple","inputs":{"ckpt_name":"model.safetensors"}}}',
        },
      ],
    });

    assert.equal(report.scanned, 1);
    assert.ok(
      report.issues.some((issue) => /Not optimized yet/i.test(issue.message)),
    );
  });
});
