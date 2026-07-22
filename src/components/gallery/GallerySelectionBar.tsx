"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ComfyGalleryEntry } from "@/lib/comfyui-gallery";
import type { PromptProject } from "@/lib/prompt-projects";
import type { ParamExperimentAxis } from "@/lib/param-experiment-queue";
import { Button } from "@/components/ui/Button";
import {
  canUpscaleGalleryEntry,
  galleryEntryAlreadyEnrichedForUpscale,
  galleryEntrySupportsMoireClean,
  galleryEntrySupportsRefine,
} from "@/lib/comfyui-requeue";
import { isQwenRapidAioModel } from "@/lib/model-denoise-defaults";
import { isQwenLightningModel } from "@/lib/model-sampling-patch";

type GallerySelectionBarProps = {
  selectedCount: number;
  selectedEntries: ComfyGalleryEntry[];
  projects: PromptProject[];
  paramAxis: ParamExperimentAxis;
  setParamAxis: (axis: ParamExperimentAxis) => void;
  similarSearchActive: boolean;
  onClearSelection: () => void;
  onCompare: () => void;
  onAssignActiveProject: () => void;
  onAssignProject: (projectId: string) => void;
  onFavorite: (favorite: boolean) => void;
  onDelete: () => void;
  onExportSidecars: () => void;
  onDownloadImages: () => void;
  onExportZip: () => void;
  onExportLoraDataset: () => void;
  onExportCompareJson: () => void;
  onExportCompareHtml: () => void;
  onFindSimilar: () => void;
  onClearSimilar: () => void;
  canClearSimilar: boolean;
  onSeedExperiment: () => void;
  onParamExperiment: () => void;
  onParamGrid: () => void;
  onMutateWinner: () => void;
  onVariations: () => void;
  onTopics: () => void;
  onNegativeAb: () => void;
  onExportCsv: () => void;
  onExportJsonl: () => void;
  onBulkRequeue: () => void;
  onBulkUpscaleFinal: () => void;
  onBulkUpscaleMax: () => void;
  onBulkRefine: () => void;
  onBulkMoireCleanFinal: () => void;
  onBulkMoireCleanMax: () => void;
};

function ActionMenu(props: {
  label: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  if (props.disabled) {
    return (
      <button
        type="button"
        disabled
        className="ui-btn-ghost ui-btn-sm text-xs opacity-40"
      >
        {props.label}
      </button>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        className="ui-btn-ghost ui-btn-sm text-xs"
        onClick={() => setOpen((value) => !value)}
      >
        {props.label}
      </button>
      {open ? <div className="ui-menu left-0">{props.children}</div> : null}
    </div>
  );
}

function MenuItem(props: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
      className="ui-menu-item"
    >
      {props.label}
    </button>
  );
}

export default function GallerySelectionBar(props: GallerySelectionBarProps) {
  const queueCapabilities = useMemo(() => {
    const entries = props.selectedEntries;
    const canUpscaleFinal = entries.some((entry) =>
      canUpscaleGalleryEntry(entry, "final"),
    );
    const canUpscaleMax = entries.some((entry) =>
      canUpscaleGalleryEntry(entry, "max"),
    );
    const canUpscale = canUpscaleFinal || canUpscaleMax;
    const canRefine = entries.some((entry) => galleryEntrySupportsRefine(entry.model));
    const canMoireFinal = entries.some(
      (entry) =>
        galleryEntrySupportsMoireClean(entry.model) &&
        entry.status === "completed" &&
        !galleryEntryAlreadyEnrichedForUpscale(entry, "final"),
    );
    const canMoireMax = entries.some(
      (entry) =>
        galleryEntrySupportsMoireClean(entry.model) &&
        entry.status === "completed" &&
        !galleryEntryAlreadyEnrichedForUpscale(entry, "max"),
    );
    const canMoire = canMoireFinal || canMoireMax;
    const allRapid =
      entries.length > 0 &&
      entries.every((entry) => isQwenRapidAioModel(entry.model));
    const allLightning =
      entries.length > 0 &&
      entries.every((entry) => isQwenLightningModel(entry.model));
    return {
      canUpscale,
      canUpscaleFinal,
      canUpscaleMax,
      canRefine,
      canMoire,
      canMoireFinal,
      canMoireMax,
      allRapid,
      allLightning,
    };
  }, [props.selectedEntries]);

  if (props.selectedCount === 0) {
    return null;
  }

  const singleSelected = props.selectedCount === 1;
  const compareReady = props.selectedCount >= 2 && props.selectedCount <= 4;
  const upscaleFinalLabel = queueCapabilities.allRapid
    ? "Bulk moiré clean (Final) — Rapid AIO"
    : "Bulk upscale (Final)";
  const upscaleMaxLabel = queueCapabilities.allRapid
    ? "Bulk moiré clean (Max) — Rapid AIO"
    : "Bulk upscale (Max)";

  return (
    <div className="sticky top-[var(--header-offset,0px)] z-20 rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-elevated)] p-3 shadow-[var(--shadow-surface)] backdrop-blur-md">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-1 flex items-center gap-2 border-r border-[var(--border-subtle)] pr-3">
          <span className="rounded-[var(--radius-full)] border border-[var(--accent-border)] bg-[var(--accent-muted)] px-2.5 py-1 text-xs font-medium text-[var(--accent-text)]">
            {props.selectedCount} selected
          </span>
          <button
            type="button"
            onClick={props.onClearSelection}
            className="text-xs text-[var(--text-muted)] transition hover:text-[var(--text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
          >
            Clear
          </button>
        </div>

        <Button
          variant="secondary"
          className="!min-h-9 px-3 text-xs"
          disabled={!compareReady}
          onClick={props.onCompare}
        >
          Compare
        </Button>

        <ActionMenu label="Export" disabled={props.selectedCount === 0}>
          <MenuItem label="Sidecars" onClick={props.onExportSidecars} />
          <MenuItem label="Images" onClick={props.onDownloadImages} />
          <MenuItem label="ZIP bundle" onClick={props.onExportZip} />
          <MenuItem label="Export LoRA dataset" onClick={props.onExportLoraDataset} />
          <MenuItem label="CSV" onClick={props.onExportCsv} />
          <MenuItem label="JSONL" onClick={props.onExportJsonl} />
          <MenuItem
            label="Compare JSON"
            disabled={!compareReady}
            onClick={props.onExportCompareJson}
          />
          <MenuItem
            label="Compare HTML"
            disabled={!compareReady}
            onClick={props.onExportCompareHtml}
          />
        </ActionMenu>

        <ActionMenu label="Queue" disabled={props.selectedCount === 0}>
          {(queueCapabilities.canUpscale || queueCapabilities.canMoire) ? (
            <>
              <MenuItem
                label={upscaleFinalLabel}
                disabled={
                  queueCapabilities.allRapid
                    ? !queueCapabilities.canMoireFinal
                    : !queueCapabilities.canUpscaleFinal
                }
                onClick={
                  queueCapabilities.allRapid
                    ? props.onBulkMoireCleanFinal
                    : props.onBulkUpscaleFinal
                }
              />
              <MenuItem
                label={upscaleMaxLabel}
                disabled={
                  queueCapabilities.allRapid
                    ? !queueCapabilities.canMoireMax
                    : !queueCapabilities.canUpscaleMax
                }
                onClick={
                  queueCapabilities.allRapid
                    ? props.onBulkMoireCleanMax
                    : props.onBulkUpscaleMax
                }
              />
            </>
          ) : null}
          {queueCapabilities.canRefine ? (
            <MenuItem label="Bulk refine (Final)" onClick={props.onBulkRefine} />
          ) : null}
          {queueCapabilities.canMoire && !queueCapabilities.allRapid ? (
            <>
              <MenuItem
                label="Bulk clean moiré (Final)"
                onClick={props.onBulkMoireCleanFinal}
              />
              <MenuItem
                label="Bulk clean moiré (Max)"
                onClick={props.onBulkMoireCleanMax}
              />
            </>
          ) : null}
          {queueCapabilities.allLightning ? (
            <MenuItem
              label="Bulk new variation (Final, new seeds) — Lightning"
              onClick={props.onBulkRequeue}
            />
          ) : (
            <MenuItem
              label="Bulk new variation (new seeds)"
              onClick={props.onBulkRequeue}
            />
          )}
          <MenuItem label="Seed experiment" onClick={props.onSeedExperiment} disabled={!singleSelected} />
          <MenuItem
            label={`Param experiment (${props.paramAxis})`}
            onClick={props.onParamExperiment}
            disabled={!singleSelected}
          />
          <MenuItem label="Param grid (CFG×steps)" onClick={props.onParamGrid} disabled={!singleSelected} />
          <MenuItem label="Mutate winner" onClick={props.onMutateWinner} disabled={!singleSelected} />
          <MenuItem label="Negative A/B" onClick={props.onNegativeAb} disabled={!singleSelected} />
        </ActionMenu>

        <ActionMenu label="Send" disabled={!singleSelected}>
          <MenuItem label="Open in Variations" onClick={props.onVariations} />
          <MenuItem label="Open in Topics" onClick={props.onTopics} />
          <MenuItem label="Find similar" onClick={props.onFindSimilar} />
          {props.similarSearchActive ? (
            <MenuItem label="Clear similar filter" onClick={props.onClearSimilar} />
          ) : null}
        </ActionMenu>

        <ActionMenu label="Organize">
          <MenuItem label="Assign active project" onClick={props.onAssignActiveProject} />
          {props.projects.map((project) => (
            <MenuItem
              key={project.id}
              label={`Assign · ${project.name}`}
              onClick={() => props.onAssignProject(project.id)}
            />
          ))}
          <MenuItem label="Favorite" onClick={() => props.onFavorite(true)} />
          <MenuItem label="Unfavorite" onClick={() => props.onFavorite(false)} />
        </ActionMenu>

        <Button
          variant="danger"
          className="!min-h-9 px-3 text-xs"
          onClick={props.onDelete}
        >
          Remove selected
        </Button>

        <label className="ml-auto hidden items-center gap-1 text-[11px] text-[var(--text-muted)] sm:flex">
          Param axis
          <select
            value={props.paramAxis}
            onChange={(event) =>
              props.setParamAxis(event.target.value as ParamExperimentAxis)
            }
            className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-muted)] px-2 py-1 text-[var(--text-secondary)]"
          >
            <option value="cfg">CFG</option>
            <option value="steps">Steps</option>
            <option value="width">Width</option>
            <option value="seed">Seed</option>
          </select>
        </label>
      </div>
    </div>
  );
}
