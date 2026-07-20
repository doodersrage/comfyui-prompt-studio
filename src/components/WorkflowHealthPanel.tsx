"use client";

import { useEffect, useMemo, useState } from "react";
import { loadComfyWorkflowFiles } from "@/lib/comfyui-workflow-files";
import {
  auditWorkflowLibraryHealth,
  summarizeWorkflowLibraryHealth,
} from "@/lib/workflow-health-audit";
import { auditLoaderMapsAgainstComfyUi } from "@/lib/loader-map-health-audit";
import { loadSettingsCache } from "@/lib/settings-cache";
import { loadComfyUiSettings } from "@/lib/comfyui-settings";
import { resolveComfyUiRuntime } from "@/lib/comfyui-runtime";

type WorkflowHealthPanelProps = {
  refreshKey?: number;
};

export default function WorkflowHealthPanel({ refreshKey = 0 }: WorkflowHealthPanelProps) {
  const [loaderIssues, setLoaderIssues] = useState<
    ReturnType<typeof auditLoaderMapsAgainstComfyUi>
  >([]);
  const [loaderStatus, setLoaderStatus] = useState<string | null>(null);

  const report = useMemo(() => {
    void refreshKey;
    return auditWorkflowLibraryHealth({ workflowFiles: loadComfyWorkflowFiles() });
  }, [refreshKey]);

  useEffect(() => {
    void refreshKey;
    const runtime = resolveComfyUiRuntime();
    const comfyUrl = runtime?.apiUrl?.trim();
    const params = comfyUrl ? `?comfyUrl=${encodeURIComponent(comfyUrl)}` : "";
    setLoaderStatus("Checking loader maps against ComfyUI…");

    void fetch(`/api/comfyui/object-info${params}`)
      .then(async (response) => {
        if (!response.ok) {
          setLoaderIssues([]);
          setLoaderStatus("ComfyUI offline — loader map filenames not verified.");
          return;
        }
        const data = (await response.json()) as {
          models?: {
            checkpoints: string[];
            unets: string[];
            vaes: string[];
            upscaleModels: string[];
          };
        };
        if (!data.models) {
          setLoaderIssues([]);
          setLoaderStatus(null);
          return;
        }
        const shared = loadSettingsCache().shared;
        const settings = loadComfyUiSettings();
        const checkpointMap = {
          ...settings.modelCheckpointMap,
          ...shared.modelCheckpointMap,
        };
        const vaeMap = {
          ...settings.modelVaeMap,
          ...shared.modelVaeMap,
        };
        const upscaleMap = {
          ...settings.modelUpscaleMap,
          ...shared.modelUpscaleMap,
        };
        const issues = auditLoaderMapsAgainstComfyUi({
          checkpointMap,
          vaeMap,
          upscaleMap,
          models: data.models,
        });
        setLoaderIssues(issues);
        setLoaderStatus(
          issues.length === 0
            ? "Loader maps match ComfyUI filenames."
            : `${issues.length} loader map note(s) from ComfyUI.`,
        );
      })
      .catch(() => {
        setLoaderIssues([]);
        setLoaderStatus("Could not verify loader maps against ComfyUI.");
      });
  }, [refreshKey]);

  const allIssues = [...report.issues, ...loaderIssues];
  const summary = summarizeWorkflowLibraryHealth({
    ...report,
    issues: allIssues,
    healthy: Math.max(0, report.scanned - new Set(allIssues.map((issue) => issue.workflowId)).size),
  });
  const topIssues = allIssues.slice(0, 8);

  return (
    <div className="mb-4 space-y-3 rounded-2xl border border-zinc-800/80 bg-zinc-950/30 p-4">
      <div className="space-y-1">
        <p className="text-sm font-medium text-zinc-200">Workflow library health</p>
        <p className="text-xs text-zinc-500">{summary}</p>
        {loaderStatus ? <p className="text-xs text-zinc-600">{loaderStatus}</p> : null}
      </div>
      {topIssues.length > 0 ? (
        <ul className="space-y-2">
          {topIssues.map((issue) => (
            <li
              key={`${issue.workflowId}-${issue.workflowName}-${issue.message}`}
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
          Placeholders and loader maps look ready. Run Optimize all after importing new community JSON.
        </p>
      )}
    </div>
  );
}
