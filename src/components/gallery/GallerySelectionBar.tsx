"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ComfyGalleryEntry } from "@/lib/comfyui-gallery";
import type { PromptProject } from "@/lib/prompt-projects";
import type { ParamExperimentAxis } from "@/lib/param-experiment-queue";
import { Button } from "@/components/ui/Button";
import {
  galleryEntrySupportsMoireClean,
  galleryEntrySupportsRefine,
  galleryEntrySupportsUpscale,
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
    const canUpscale = entries.some((entry) => galleryEntrySupportsUpscale(entry.model));
    const canRefine = entries.some((entry) => galleryEntrySupportsRefine(entry.model));
    const canMoire = entries.some((entry) =>
      galleryEntrySupportsMoireClean(entry.model),
    );
    const allRapid =
      entries.length > 0 &&
      entries.every((entry) => isQwenRapidAioModel(entry.model));
    const allLightning =
      entries.length > 0 &&
      entries.every((entry) => isQwenLightningModel(entry.model));
    return { canUpscale, canRefine, canMoire, allRapid, allLightning };
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
    <div className="sticky top-[var(--header-offset,0px)] z-20 rounded-2xl border border-violet-500/25 bg-zinc-950/90 p-3 shadow-[0_12px_40px_-24px_rgba(124,58,237,0.45)] backdrop-blur-md">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-1 flex items-center gap-2 border-r border-zinc-800 pr-3">
          <span className="rounded-full bg-violet-500/15 px-2.5 py-1 text-xs font-medium text-violet-100">
            {props.selectedCount} selected
          </span>
          <button
            type="button"
            onClick={props.onClearSelection}
            className="text-xs text-zinc-500 transition hover:text-zinc-300"
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
          {queueCapabilities.canUpscale || queueCapabilities.allRapid ? (
            <>
              <MenuItem
                label={upscaleFinalLabel}
                onClick={
                  queueCapabilities.allRapid
                    ? props.onBulkMoireCleanFinal
                    : props.onBulkUpscaleFinal
                }
              />
              <MenuItem
                label={upscaleMaxLabel}
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
          <MenuItem label="Delete selected" onClick={props.onDelete} />
        </ActionMenu>

        <label className="ml-auto hidden items-center gap-1 text-[11px] text-zinc-500 sm:flex">
          Param axis
          <select
            value={props.paramAxis}
            onChange={(event) =>
              props.setParamAxis(event.target.value as ParamExperimentAxis)
            }
            className="rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1 text-zinc-300"
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
