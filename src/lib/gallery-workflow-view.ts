"use client";

import type { ComfyGalleryEntry } from "./comfyui-gallery";
import type { ComfyHistoryWorkflowResult } from "./comfyui-history-workflow";
import { fetchWorkflowPreview } from "./comfyui-requeue";
import type { WorkflowParamValues } from "./comfyui-config";

export type GalleryWorkflowView = {
  entry: ComfyGalleryEntry;
  storedParams?: WorkflowParamValues;
  history?: ComfyHistoryWorkflowResult;
  preview?: Awaited<ReturnType<typeof fetchWorkflowPreview>>;
  previewError?: string;
  historyError?: string;
};

export async function loadGalleryWorkflowView(
  entry: ComfyGalleryEntry,
): Promise<GalleryWorkflowView> {
  const storedParams = entry.queueParams;
  const view: GalleryWorkflowView = { entry, storedParams };

  const historyPromise = entry.promptId
    ? fetch(
        `/api/comfyui/history/workflow?${new URLSearchParams({
          promptId: entry.promptId,
          ...(entry.comfyUrl ? { comfyUrl: entry.comfyUrl } : {}),
        }).toString()}`,
      )
        .then(async (response) => {
          const data = (await response.json()) as ComfyHistoryWorkflowResult & {
            error?: string;
          };
          if (!response.ok) {
            view.historyError = data.error ?? `History lookup failed (HTTP ${response.status}).`;
            return;
          }
          view.history = data;
        })
        .catch((error: unknown) => {
          view.historyError =
            error instanceof Error ? error.message : "History lookup failed.";
        })
    : Promise.resolve();

  const previewParams = storedParams ?? view.history?.extractedParams;

  const previewPromise = fetchWorkflowPreview({
    prompt: entry.prompt,
    negativePrompt: entry.negativePrompt,
    params: previewParams,
  })
    .then((preview) => {
      view.preview = preview;
    })
    .catch((error: unknown) => {
      view.previewError =
        error instanceof Error ? error.message : "Workflow preview failed.";
    });

  await Promise.all([historyPromise, previewPromise]);

  return view;
}

export function formatWorkflowParamValue(value: string | number | undefined): string {
  if (value === undefined || value === "") {
    return "—";
  }
  return String(value);
}
