"use client";

import ComfyUiGalleryPanel from "@/components/ComfyUiGalleryPanel";
import QueueOrchestrationPanel from "@/components/QueueOrchestrationPanel";
import PngMetadataImportButton from "@/components/PngMetadataImportButton";
import SidecarImportButton from "@/components/SidecarImportButton";
import {
  fetchComfyHistoryImports,
  importComfyGalleryFromHistory,
} from "@/lib/comfyui-gallery-client";
import { requeueComfyJob } from "@/lib/comfyui-requeue";
import {
  sidecarNegativePrompt,
  type PromptSidecar,
} from "@/lib/prompt-sidecar";
import { useState } from "react";
import {
  CollapsibleSection,
  ToolBadge,
  ToolLayout,
} from "@/components/ui/ToolPageShell";
import { Button } from "@/components/ui/Button";

const ACCENT = "neutral" as const;

export default function GalleryTool() {
  const [importedSidecar, setImportedSidecar] = useState<PromptSidecar | null>(
    null,
  );
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  return (
    <ToolLayout
      accent={ACCENT}
      width="wide"
      badge={<ToolBadge accent={ACCENT}>Gallery</ToolBadge>}
      title="ComfyUI Gallery"
      description="Browse outputs, review ratings, and queue follow-up work — without wading through every tool at once."
    >
      <ComfyUiGalleryPanel showHeader showFilters />

      <CollapsibleSection
        title="Import & queue tools"
        summary="Sidecar, PNG, ComfyUI history"
        defaultOpen={false}
      >
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
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setImportStatus("Re-queueing imported sidecar…");
                    void requeueComfyJob({
                      prompt: importedSidecar.positive,
                      negativePrompt: sidecarNegativePrompt(importedSidecar),
                      tool: importedSidecar.tool,
                      model: importedSidecar.model,
                      hints: importedSidecar.hints,
                      newSeed: false,
                      onStatus: setImportStatus,
                    });
                  }}
                >
                  Re-queue
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setImportStatus("Re-queueing with new seed…");
                    void requeueComfyJob({
                      prompt: importedSidecar.positive,
                      negativePrompt: sidecarNegativePrompt(importedSidecar),
                      tool: importedSidecar.tool,
                      model: importedSidecar.model,
                      hints: importedSidecar.hints,
                      newSeed: true,
                      onStatus: setImportStatus,
                    });
                  }}
                >
                  Re-queue (new seed)
                </Button>
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
      </CollapsibleSection>
    </ToolLayout>
  );
}
