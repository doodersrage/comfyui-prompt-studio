"use client";

import { useEffect, useMemo, useState } from "react";
import { loadComfyWorkflowFiles } from "@/lib/comfyui-workflow-files";
import {
  auditWorkflowLibraryHealth,
  dispatchWorkflowHealthSelect,
  summarizeWorkflowLibraryHealth,
} from "@/lib/workflow-health-audit";
import { auditLoaderMapsAgainstComfyUi } from "@/lib/loader-map-health-audit";
import { loadSettingsCache } from "@/lib/settings-cache";
import { loadComfyUiSettings, mergeLoraLibraryIntoCustomTokens } from "@/lib/comfyui-settings";
import { resolveComfyUiRuntime } from "@/lib/comfyui-runtime";
import type { ComfyUiModelLists } from "@/lib/comfyui-object-info";
import {
  auditDualClipNodesInWorkflow,
} from "@/lib/workflow-queue-loader-preflight";
import { auditLoaderFilenamesInWorkflow } from "@/lib/workflow-loader-filename-audit";
import {
  applyLoaderMapRepairs,
  suggestLoaderMapRepairs,
} from "@/lib/workflow-loader-map-repair";
import { saveSharedSettings } from "@/lib/settings-cache";
import { scheduleAfterCommit } from "@/lib/schedule-after-commit";

type WorkflowHealthPanelProps = {
  refreshKey?: number;
  onStatus?: (message: string) => void;
};

function workflowFileLoaderIssues(
  files: ReturnType<typeof loadComfyWorkflowFiles>,
  models: ComfyUiModelLists,
) {
  return files.flatMap((file) => {
    const dualClip = auditDualClipNodesInWorkflow({
      workflowJson: file.workflowJson,
      models,
    }).map((issue) => ({
      workflowId: file.id,
      workflowName: file.name,
      severity: issue.severity,
      message: issue.message,
      action: "optimize-workflow" as const,
    }));

    const loaders = auditLoaderFilenamesInWorkflow({
      workflowJson: file.workflowJson,
      models,
    }).map((issue) => ({
      workflowId: file.id,
      workflowName: file.name,
      severity: issue.severity,
      message: issue.message,
      action:
        issue.severity === "error"
          ? ("optimize-workflow" as const)
          : ("open-workflow" as const),
    }));

    return [...dualClip, ...loaders];
  });
}

export default function WorkflowHealthPanel({
  refreshKey = 0,
  onStatus,
}: WorkflowHealthPanelProps) {
  const [loaderIssues, setLoaderIssues] = useState<
    ReturnType<typeof auditLoaderMapsAgainstComfyUi>
  >([]);
  const [loaderStatus, setLoaderStatus] = useState<string | null>(null);
  const [comfyModels, setComfyModels] = useState<ComfyUiModelLists | null>(null);

  const report = useMemo(() => {
    void refreshKey;
    const shared = loadSettingsCache().shared;
    return auditWorkflowLibraryHealth({
      workflowFiles: loadComfyWorkflowFiles(),
      modelWorkflowMap: shared.modelWorkflowMap,
    });
  }, [refreshKey]);

  useEffect(() => {
    void refreshKey;
    const runtime = resolveComfyUiRuntime();
    const comfyUrl = runtime?.apiUrl?.trim();
    const params = comfyUrl ? `?comfyUrl=${encodeURIComponent(comfyUrl)}` : "";
    scheduleAfterCommit(() => {
      setLoaderStatus("Checking loader maps against ComfyUI…");
    });

    void fetch(`/api/comfyui/object-info${params}`)
      .then(async (response) => {
        if (!response.ok) {
          setLoaderIssues([]);
          setLoaderStatus("ComfyUI offline — loader map filenames not verified.");
          return;
        }
        const data = (await response.json()) as {
          models?: ComfyUiModelLists;
        };
        if (!data.models) {
          setLoaderIssues([]);
          setComfyModels(null);
          setLoaderStatus(null);
          return;
        }
        setComfyModels(data.models);
        const shared = loadSettingsCache().shared;
        const settings = mergeLoraLibraryIntoCustomTokens(loadComfyUiSettings());
        const checkpointMap = { ...(shared.modelCheckpointMap ?? {}) };
        const vaeMap = { ...(shared.modelVaeMap ?? {}) };
        const upscaleMap = { ...(shared.modelUpscaleMap ?? {}) };
        const controlNetMap = { ...(shared.modelControlNetMap ?? {}) };
        const mapIssues = auditLoaderMapsAgainstComfyUi({
          checkpointMap: checkpointMap as Record<string, string>,
          vaeMap: vaeMap as Record<string, string>,
          upscaleMap: upscaleMap as Record<string, string>,
          controlNetMap: controlNetMap as Record<string, string>,
          customTokens: settings.customTokens,
          models: data.models,
        });
        const workflowIssues = workflowFileLoaderIssues(
          loadComfyWorkflowFiles(),
          data.models,
        );
        const issues = [...mapIssues, ...workflowIssues];
        setLoaderIssues(issues);
        setLoaderStatus(
          issues.length === 0
            ? "Loader maps and workflow filenames match ComfyUI."
            : `${issues.length} loader note(s) from ComfyUI.`,
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
  const loaderMapRepairs = useMemo(() => {
    if (!comfyModels) {
      return [];
    }
    const shared = loadSettingsCache().shared;
    return suggestLoaderMapRepairs({
      checkpointMap: { ...(shared.modelCheckpointMap ?? {}) } as Record<string, string>,
      vaeMap: { ...(shared.modelVaeMap ?? {}) } as Record<string, string>,
      upscaleMap: { ...(shared.modelUpscaleMap ?? {}) } as Record<string, string>,
      controlNetMap: { ...(shared.modelControlNetMap ?? {}) } as Record<string, string>,
      models: comfyModels,
    });
  }, [comfyModels, refreshKey]);

  const applyLoaderMapRepairSuggestions = () => {
    if (loaderMapRepairs.length === 0) {
      onStatus?.("No loader map repairs suggested.");
      return;
    }
    const shared = loadSettingsCache().shared;
    const repaired = applyLoaderMapRepairs(
      {
        checkpointMap: { ...(shared.modelCheckpointMap ?? {}) } as Record<string, string>,
        vaeMap: { ...(shared.modelVaeMap ?? {}) } as Record<string, string>,
        upscaleMap: { ...(shared.modelUpscaleMap ?? {}) } as Record<string, string>,
        controlNetMap: { ...(shared.modelControlNetMap ?? {}) } as Record<string, string>,
      },
      loaderMapRepairs,
    );
    saveSharedSettings({
      ...shared,
      modelCheckpointMap: repaired.checkpointMap,
      modelVaeMap: repaired.vaeMap,
      modelUpscaleMap: repaired.upscaleMap,
      modelControlNetMap: repaired.controlNetMap,
    });
    onStatus?.(`Applied ${repaired.applied} closest-match loader map repair(s).`);
  };

  return (
    <div className="mb-4 space-y-3 rounded-2xl border border-zinc-800/80 bg-zinc-950/30 p-4">
      <div className="space-y-1">
        <p className="text-sm font-medium text-zinc-200">Workflow library health</p>
        <p className="text-xs text-zinc-500">{summary}</p>
        {loaderStatus ? <p className="text-xs text-zinc-600">{loaderStatus}</p> : null}
        {loaderMapRepairs.length > 0 ? (
          <button
            type="button"
            onClick={applyLoaderMapRepairSuggestions}
            className="rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-xs text-violet-200 transition hover:border-violet-400/50 hover:bg-violet-500/15"
          >
            Apply {loaderMapRepairs.length} suggested loader map repair
            {loaderMapRepairs.length === 1 ? "" : "s"}
          </button>
        ) : null}
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
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p>
                  <span className="font-medium">{issue.workflowName}</span>
                  <span className="text-zinc-400"> — </span>
                  {issue.message}
                </p>
                {issue.workflowId !== "loader-map" && issue.action ? (
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        dispatchWorkflowHealthSelect(issue.workflowId, "open-workflow");
                        onStatus?.(`Opened workflow “${issue.workflowName}” in library.`);
                      }}
                      className="rounded-lg border border-zinc-700/70 px-2 py-0.5 text-[10px] text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100"
                    >
                      Open
                    </button>
                    {issue.action === "optimize-workflow" ? (
                      <button
                        type="button"
                        onClick={() => {
                          dispatchWorkflowHealthSelect(issue.workflowId, "optimize-workflow");
                          onStatus?.(`Optimizing “${issue.workflowName}”…`);
                        }}
                        className="rounded-lg border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-200 transition hover:border-violet-400/50 hover:bg-violet-500/15"
                      >
                        Optimize
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-emerald-300/90">
          Placeholders and loader maps look ready. Run Optimize all after importing new community JSON so
          queue hash-skip stays warm.
        </p>
      )}
    </div>
  );
}
