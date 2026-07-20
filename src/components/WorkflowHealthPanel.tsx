"use client";

import { useMemo } from "react";
import { loadComfyWorkflowFiles } from "@/lib/comfyui-workflow-files";
import {
  auditWorkflowLibraryHealth,
  summarizeWorkflowLibraryHealth,
} from "@/lib/workflow-health-audit";

type WorkflowHealthPanelProps = {
  refreshKey?: number;
};

export default function WorkflowHealthPanel({ refreshKey = 0 }: WorkflowHealthPanelProps) {
  const report = useMemo(() => {
    void refreshKey;
    return auditWorkflowLibraryHealth({ workflowFiles: loadComfyWorkflowFiles() });
  }, [refreshKey]);

  const summary = summarizeWorkflowLibraryHealth(report);
  const topIssues = report.issues.slice(0, 6);

  return (
    <div className="mb-4 space-y-3 rounded-2xl border border-zinc-800/80 bg-zinc-950/30 p-4">
      <div className="space-y-1">
        <p className="text-sm font-medium text-zinc-200">Workflow library health</p>
        <p className="text-xs text-zinc-500">{summary}</p>
      </div>
      {topIssues.length > 0 ? (
        <ul className="space-y-2">
          {topIssues.map((issue) => (
            <li
              key={`${issue.workflowId}-${issue.message}`}
              className={`rounded-xl border px-3 py-2 text-xs ${
                issue.severity === "error"
                  ? "border-rose-500/25 bg-rose-500/5 text-rose-200"
                  : "border-amber-500/20 bg-amber-500/5 text-amber-100"
              }`}
            >
              <span className="font-medium">{issue.workflowName}</span>
              <span className="text-zinc-400"> — </span>
              {issue.message}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-emerald-300/90">
          Placeholders look bound. Run Optimize all after importing new community JSON.
        </p>
      )}
    </div>
  );
}
