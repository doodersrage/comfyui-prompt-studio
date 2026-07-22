"use client";

import { useEffect, useState } from "react";
import ModalPortal from "@/components/ui/ModalPortal";
import { scheduleAfterCommit } from "@/lib/schedule-after-commit";
import WorkflowPreviewPanel from "@/components/WorkflowPreviewPanel";
import { Spinner } from "@/components/ui/Button";
import type { ComfyGalleryEntry } from "@/lib/comfyui-gallery";
import type { WorkflowParamValues } from "@/lib/comfyui-config";
import {
  formatWorkflowParamValue,
  loadGalleryWorkflowView,
  workflowParamDisplayRows,
  type GalleryWorkflowView,
} from "@/lib/gallery-workflow-view";
import {
  formatQueueQualityProfileLabel,
  formatQueueQualityProfileHint,
} from "@/lib/queue-quality-profile";
import { loadSettingsCache } from "@/lib/settings-cache";
import { normalizeModelSamplerPresetTier } from "@/lib/model-sampler-defaults";
import { normalizeResolutionSizeTier } from "@/lib/model-resolution-defaults";

type GalleryWorkflowModalProps = {
  entry: ComfyGalleryEntry;
  onClose: () => void;
};

function ParamGrid({
  label,
  params,
}: {
  label: string;
  params: WorkflowParamValues | Record<string, string | number | undefined>;
}) {
  const rows = workflowParamDisplayRows(params);

  return (
    <div className="space-y-2">
      <h3 className="type-caption font-medium text-zinc-400">{label}</h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-5">
        {rows.map((row) => (
          <div key={row.key} className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 px-3 py-2">
            <dt className="type-caption text-zinc-500">{row.key}</dt>
            <dd className="type-code mt-0.5 truncate text-sm text-violet-100" title={formatWorkflowParamValue(row.value)}>
              {formatWorkflowParamValue(row.value)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function GalleryWorkflowModal({ entry, onClose }: GalleryWorkflowModalProps) {
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<GalleryWorkflowView | null>(null);

  useEffect(() => {
    let cancelled = false;
    scheduleAfterCommit(() => {
      setLoading(true);
    });
    void loadGalleryWorkflowView(entry).then((result) => {
      if (!cancelled) {
        setView(result);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [entry]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const historyParams = view?.history?.extractedParams;
  const previewParams = view?.preview?.resolvedParams;
  const shared = loadSettingsCache().shared;
  const qualityProfile = entry.queueQualityProfile;
  const qualityHint =
    qualityProfile && qualityProfile !== "followSettings"
      ? formatQueueQualityProfileHint(
          qualityProfile,
          normalizeModelSamplerPresetTier(shared.modelSamplerPreset),
          normalizeResolutionSizeTier(shared.modelResolutionSizeTier),
        )
      : null;

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-zinc-950/85 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-label="Gallery workflow configuration"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            onClose();
          }
        }}
      >
        <div className="my-4 w-full max-w-5xl rounded-2xl border border-zinc-800/80 bg-zinc-950 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.9)]">
        <div className="flex items-start justify-between gap-4 border-b border-zinc-800/80 px-5 py-4">
          <div className="min-w-0 space-y-1">
            <h2 className="text-lg font-medium text-zinc-100">Workflow configuration</h2>
            <p className="type-caption truncate text-zinc-500">
              {entry.tool ?? "gallery"} · {entry.model ?? "unknown model"} · prompt{" "}
              {entry.promptId.slice(0, 12)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ui-btn-ghost ui-btn-sm shrink-0"
          >
            Close
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-zinc-400" role="status">
              <Spinner size="sm" />
              Loading workflow data…
            </div>
          ) : (
            <>
              {qualityProfile ? (
                <div className="rounded-xl border border-violet-500/20 bg-violet-950/20 px-4 py-3">
                  <p className="type-caption text-zinc-400">Queue quality profile</p>
                  <p className="mt-1 text-sm text-violet-100">
                    {formatQueueQualityProfileLabel(qualityProfile)}
                  </p>
                  {qualityHint ? (
                    <p className="mt-1 type-caption text-zinc-500">{qualityHint}</p>
                  ) : null}
                </div>
              ) : null}

              {view?.storedParams ? (
                <ParamGrid label="Stored job params (from gallery entry)" params={view.storedParams} />
              ) : null}

              {historyParams ? (
                <ParamGrid
                  label="Params extracted from ComfyUI history"
                  params={historyParams}
                />
              ) : view?.historyError ? (
                <p className="type-caption text-zinc-500">
                  ComfyUI history: {view.historyError}
                </p>
              ) : null}

              {previewParams ? (
                <ParamGrid
                  label="Resolved preview params (current workflow settings)"
                  params={previewParams}
                />
              ) : null}

              {entry.sourceImageUrl || entry.maskImageUrl ? (
                <div className="space-y-2">
                  <h3 className="type-caption font-medium text-zinc-400">
                    Re-queue image URLs (stored on gallery entry)
                  </h3>
                  <dl className="grid gap-2">
                    {entry.sourceImageUrl ? (
                      <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 px-3 py-2">
                        <dt className="type-caption text-zinc-500">sourceImageUrl</dt>
                        <dd className="type-code mt-0.5 truncate text-sm text-emerald-100/90" title={entry.sourceImageUrl}>
                          {entry.sourceImageUrl}
                        </dd>
                      </div>
                    ) : null}
                    {entry.maskImageUrl ? (
                      <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 px-3 py-2">
                        <dt className="type-caption text-zinc-500">maskImageUrl</dt>
                        <dd className="type-code mt-0.5 truncate text-sm text-amber-100/90" title={entry.maskImageUrl}>
                          {entry.maskImageUrl}
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                </div>
              ) : null}

              {view?.history?.nodeInputs && view.history.nodeInputs.length > 0 ? (
                <div className="space-y-2">
                  <h3 className="type-caption font-medium text-zinc-400">
                    Node inputs from ComfyUI history
                  </h3>
                  <div className="max-h-56 overflow-auto rounded-xl border border-zinc-800/80">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-zinc-900/95 text-zinc-500">
                        <tr>
                          <th className="px-3 py-2 font-medium">Node</th>
                          <th className="px-3 py-2 font-medium">Type</th>
                          <th className="px-3 py-2 font-medium">Input</th>
                          <th className="px-3 py-2 font-medium">Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {view.history.nodeInputs.map((row) => (
                          <tr
                            key={`${row.nodeId}-${row.input}-${String(row.value).slice(0, 24)}`}
                            className="border-t border-zinc-800/60 text-zinc-300"
                          >
                            <td className="type-code px-3 py-2 text-violet-200">{row.nodeId}</td>
                            <td className="px-3 py-2 text-zinc-500">{row.classType ?? "—"}</td>
                            <td className="type-code px-3 py-2 text-sky-200">{row.input}</td>
                            <td className="type-code max-w-[16rem] truncate px-3 py-2 text-emerald-100">
                              {String(row.value)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {view?.history?.workflowJson ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="type-caption font-medium text-zinc-400">
                      ComfyUI workflow JSON (from history)
                    </h3>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard
                          .writeText(view.history?.workflowJson ?? "")
                          .catch(() => undefined);
                      }}
                      className="ui-btn-ghost ui-btn-sm text-xs"
                    >
                      Copy JSON
                    </button>
                  </div>
                  <pre className="type-code max-h-80 overflow-auto rounded-xl border border-zinc-800/80 bg-zinc-950/70 p-4 text-zinc-300">
                    {view.history.workflowJson}
                    {view.history.truncated ? "\n… (truncated)" : ""}
                  </pre>
                </div>
              ) : null}

              <div className="space-y-2">
                <h3 className="type-caption font-medium text-zinc-400">
                  Reconstructed workflow preview
                </h3>
                <p className="type-caption text-zinc-500">
                  Built from your current workflow settings plus this entry&apos;s prompt and
                  params. May differ from the original job if settings changed since queue time.
                </p>
                <WorkflowPreviewPanel
                  loading={false}
                  error={view?.previewError}
                  preview={view?.preview ?? null}
                />
              </div>
            </>
          )}
        </div>
      </div>
      </div>
    </ModalPortal>
  );
}
