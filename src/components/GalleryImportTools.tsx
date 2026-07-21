"use client";

import { useState } from "react";
import PngMetadataImportButton from "@/components/PngMetadataImportButton";
import SidecarImportButton from "@/components/SidecarImportButton";
import {
  fetchComfyHistoryImports,
  importComfyGalleryFromHistory,
} from "@/lib/comfyui-gallery-client";
import {
  requeueComfyJob,
  requeueRefineFromGalleryEntry,
  requeueUpscaleFromGalleryEntry,
} from "@/lib/comfyui-requeue";
import { galleryEntryFromSidecar } from "@/lib/gallery-sidecar-entry";
import {
  sidecarNegativePrompt,
  sidecarRequeueContext,
  type PromptSidecar,
} from "@/lib/prompt-sidecar";
import { toastHeldMax } from "@/lib/app-toast";
import { Button } from "@/components/ui/Button";
import QueueOrchestrationPanel from "@/components/QueueOrchestrationPanel";

export default function GalleryImportTools() {
  const [importedSidecar, setImportedSidecar] = useState<PromptSidecar | null>(
    null,
  );
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const pseudoEntry = importedSidecar ? galleryEntryFromSidecar(importedSidecar) : null;
  const canUpscaleRefine = Boolean(pseudoEntry);

  return (
    <>
      <p className="type-caption">
        Backfill outputs generated outside this app, or inspect the ComfyUI queue.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <SidecarImportButton
          onImport={(sidecar) => {
            setImportedSidecar(sidecar);
            setImportStatus(`Loaded sidecar from ${sidecar.tool ?? "unknown tool"}.`);
          }}
          onError={setImportStatus}
        />
        <PngMetadataImportButton
          onImport={(sidecar) => {
            setImportedSidecar(sidecar);
            setImportStatus(`Loaded PNG metadata (${sidecar.tool ?? "png-import"}).`);
          }}
          onError={setImportStatus}
        />
        <Button
          variant="secondary"
          loading={historyLoading}
          loadingLabel="Importing ComfyUI history"
          onClick={() => {
            setHistoryLoading(true);
            void fetchComfyHistoryImports(40)
              .then((payload) => {
                const result = importComfyGalleryFromHistory(payload.items ?? []);
                setImportStatus(
                  `Imported ${result.imported} job(s) from ComfyUI history (${result.skipped} duplicate(s) skipped).`,
                );
              })
              .catch((error) => {
                setImportStatus(
                  error instanceof Error
                    ? error.message
                    : "ComfyUI history import failed.",
                );
              })
              .finally(() => setHistoryLoading(false));
          }}
        >
          Import ComfyUI history
        </Button>
      </div>
      {importStatus ? <p className="text-xs text-zinc-500">{importStatus}</p> : null}
      {importedSidecar ? (
        <div className="ui-surface-inset space-y-3">
          <p className="line-clamp-3 type-body">{importedSidecar.positive}</p>
          {!canUpscaleRefine ? (
            <p className="text-xs text-amber-200/80">
              Upscale and refine need an output or source image URL in the sidecar metadata.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setImportStatus("Re-queueing imported sidecar…");
                const requeue = sidecarRequeueContext(importedSidecar);
                void requeueComfyJob({
                  prompt: importedSidecar.positive,
                  negativePrompt: sidecarNegativePrompt(importedSidecar),
                  tool: importedSidecar.tool,
                  model: importedSidecar.model,
                  hints: importedSidecar.hints,
                  queueParams: requeue.queueParams,
                  sourceImageUrl: requeue.sourceImageUrl,
                  maskImageUrl: requeue.maskImageUrl,
                  storedQualityProfile: requeue.queueQualityProfile,
                  newSeed: false,
                  onStatus: setImportStatus,
                }).then((result) => {
                  if (result.ok && result.held) {
                    const message = "Max re-queue held until ComfyUI queue is idle";
                    setImportStatus(message);
                    toastHeldMax({ text: message });
                  }
                });
              }}
            >
              Re-queue
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setImportStatus("Queueing new variation…");
                const requeue = sidecarRequeueContext(importedSidecar);
                void requeueComfyJob({
                  prompt: importedSidecar.positive,
                  negativePrompt: sidecarNegativePrompt(importedSidecar),
                  tool: importedSidecar.tool,
                  model: importedSidecar.model,
                  hints: importedSidecar.hints,
                  queueParams: requeue.queueParams,
                  sourceImageUrl: requeue.sourceImageUrl,
                  maskImageUrl: requeue.maskImageUrl,
                  storedQualityProfile: requeue.queueQualityProfile,
                  newSeed: true,
                  onStatus: setImportStatus,
                }).then((result) => {
                  if (result.ok && result.held) {
                    const message = "Max re-queue held until ComfyUI queue is idle";
                    setImportStatus(message);
                    toastHeldMax({ text: message });
                  }
                });
              }}
            >
              New variation (new seed)
            </Button>
            {pseudoEntry ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setImportStatus("Upscaling imported output (Final)…");
                    void requeueUpscaleFromGalleryEntry(pseudoEntry, {
                      qualityProfile: "final",
                      onStatus: setImportStatus,
                    }).then((result) => {
                      if (result.ok && result.held) {
                        const message = "Max upscale held until ComfyUI queue is idle";
                        setImportStatus(message);
                        toastHeldMax({ text: message });
                      }
                    });
                  }}
                >
                  Upscale (Final)
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setImportStatus("Upscaling imported output (Max)…");
                    void requeueUpscaleFromGalleryEntry(pseudoEntry, {
                      qualityProfile: "max",
                      onStatus: setImportStatus,
                    }).then((result) => {
                      if (result.ok && result.held) {
                        const message = "Max upscale held until ComfyUI queue is idle";
                        setImportStatus(message);
                        toastHeldMax({ text: message });
                      }
                    });
                  }}
                >
                  Upscale (Max)
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setImportStatus("Queueing low-denoise refine…");
                    void requeueRefineFromGalleryEntry(pseudoEntry, {
                      onStatus: setImportStatus,
                    }).then((result) => {
                      if (result.ok && result.held) {
                        const message = "Max refine held until ComfyUI queue is idle";
                        setImportStatus(message);
                        toastHeldMax({ text: message });
                      }
                    });
                  }}
                >
                  Refine (low denoise)
                </Button>
              </>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              className="text-zinc-500"
              onClick={() => {
                setImportedSidecar(null);
                setImportStatus(null);
              }}
            >
              Clear
            </Button>
          </div>
        </div>
      ) : null}
      <QueueOrchestrationPanel />
    </>
  );
}
