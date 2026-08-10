'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ComfyGalleryEntry } from '@/lib/comfyui-gallery';
import type { PromptProject } from '@/lib/prompt-projects';
import type { ParamExperimentAxis } from '@/lib/param-experiment-queue';
import { Button } from '@/components/ui/Button';
import {
  canUpscaleGalleryEntry,
  galleryEntryAlreadyEnrichedForUpscale,
  galleryEntrySupportsMoireClean,
  galleryEntrySupportsRefine,
} from '@/lib/gallery-entry-actions';
import { isQwenRapidAioModel } from '@/lib/model-denoise-defaults';
import { isQwenLightningModel } from '@/lib/model-sampling-patch';

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
  /** Simple workspace — compare, export essentials, and organize only. */
  lean?: boolean;
};

function ActionMenu(props: { label: string; children: ReactNode; disabled?: boolean }) {
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
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const menuTone =
    props.label === 'Export'
      ? 'border-sky-600/35 bg-sky-900/15 text-sky-400 hover:border-sky-500/50'
      : props.label === 'Queue'
        ? 'border-slate-600/35 bg-slate-900/15 text-slate-400 hover:border-slate-500/50'
        : props.label === 'Send'
          ? 'border-emerald-600/35 bg-emerald-900/15 text-emerald-400 hover:border-emerald-500/50'
          : props.label === 'Organize'
            ? 'border-violet-600/35 bg-violet-800/15 text-violet-400 hover:border-violet-500/50'
            : 'border-[var(--border-default)]/40 bg-[var(--bg-muted)]/20 text-[var(--text-muted)] hover:border-[var(--border-default)]/60';

  if (props.disabled) {
    return (
      <button
        type="button"
        disabled
        className={`ui-btn-ghost ui-btn-sm text-xs opacity-35 rounded-xl border border-[var(--border-subtle)]/70 bg-[var(--bg-base)]/60`}
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
        className={`ui-btn-ghost ui-btn-sm text-xs rounded-xl border border-[var(--border-subtle)]/80 bg-[var(--bg-base)]/70 backdrop-blur-xs transition ${menuTone} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/30 active:scale-[0.97]`}
        onClick={() => setOpen(value => !value)}
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
      className={`ui-menu-item rounded-xl border-[var(--border-subtle)]/60 bg-[var(--bg-base)]/70 text-[11px] backdrop-blur-xs transition hover:border-violet-600/60 hover:bg-violet-500/12 hover:text-violet-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/30 active:scale-[0.97]`}
    >
      {props.label}
    </button>
  );
}

export default function GallerySelectionBar(props: GallerySelectionBarProps) {
  const queueCapabilities = useMemo(() => {
    const entries = props.selectedEntries;
    const canUpscaleFinal = entries.some(entry => canUpscaleGalleryEntry(entry, 'final'));
    const canUpscaleMax = entries.some(entry => canUpscaleGalleryEntry(entry, 'max'));
    const canUpscale = canUpscaleFinal || canUpscaleMax;
    const canRefine = entries.some(entry => galleryEntrySupportsRefine(entry.model));
    const canMoireFinal = entries.some(
      entry =>
        galleryEntrySupportsMoireClean(entry.model) &&
        entry.status === 'completed' &&
        !galleryEntryAlreadyEnrichedForUpscale(entry, 'final')
    );
    const canMoireMax = entries.some(
      entry =>
        galleryEntrySupportsMoireClean(entry.model) &&
        entry.status === 'completed' &&
        !galleryEntryAlreadyEnrichedForUpscale(entry, 'max')
    );
    const canMoire = canMoireFinal || canMoireMax;
    const allRapid = entries.length > 0 && entries.every(entry => isQwenRapidAioModel(entry.model));
    const allLightning =
      entries.length > 0 && entries.every(entry => isQwenLightningModel(entry.model));
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
    ? 'Bulk Flux polish → Final' // rapid moiré blur only
    : 'Bulk upscale → Final (~1.25× Lanczos)';
  const upscaleMaxLabel = queueCapabilities.allRapid
    ? 'Bulk Flux polish → Max (blur + resample)'
    : 'Bulk upscale → Max (full pipeline)';

  const selectionClassName =
    props.selectedCount <= 3
      ? 'border-violet-500/45 bg-violet-500/20 text-violet-300 rounded-xl backdrop-blur-xs px-2.5 py-1 text-xs font-medium'
      : props.selectedCount <= 10
        ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200 rounded-xl backdrop-blur-xs px-2.5 py-1 text-xs font-medium'
        : 'border-[var(--border-default)]/70 bg-[var(--bg-base)]/80 text-[var(--text-muted)] tabular-nums rounded-lg backdrop-blur-xs px-2.5 py-1 text-xs font-medium';

  return (
    <div className="sticky top-[calc(var(--header-offset,0px)+0.5rem)] z-20 rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-elevated)] p-3 shadow-[var(--shadow-surface)] backdrop-blur-md">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-1 flex items-center gap-2 border-r border-[var(--border-subtle)] pr-3">
          <span className={selectionClassName}>{props.selectedCount} selected</span>
          <button
            type="button"
            onClick={props.onClearSelection}
            className={`ui-btn-ghost ui-btn-sm text-xs rounded-xl border border-[var(--border-subtle)]/70 bg-[var(--bg-base)]/60 backdrop-blur-xs transition hover:bg-violet-500/25 hover:border-violet-500/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/30 text-violet-400`}
          >
            Clear
          </button>
        </div>

        <button
          type="button"
          className={`ui-btn-ghost ui-btn-sm text-xs rounded-xl border border-emerald-600/45 bg-emerald-900/15 backdrop-blur-xs transition hover:bg-emerald-500/30 hover:border-emerald-500/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/30 text-emerald-400 disabled:!hidden`}
          disabled={!compareReady}
          onClick={props.onCompare}
        >
          Compare
        </button>

        <ActionMenu label="Export" disabled={props.selectedCount === 0}>
          <MenuItem label="Sidecars" onClick={props.onExportSidecars} />
          <MenuItem label="Images" onClick={props.onDownloadImages} />
          {!props.lean ? <MenuItem label="ZIP bundle" onClick={props.onExportZip} /> : null}
          {!props.lean ? (
            <MenuItem label="Export LoRA dataset" onClick={props.onExportLoraDataset} />
          ) : null}
          {!props.lean ? <MenuItem label="CSV" onClick={props.onExportCsv} /> : null}
          {!props.lean ? <MenuItem label="JSONL" onClick={props.onExportJsonl} /> : null}
          {!props.lean ? (
            <>
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
            </>
          ) : null}
        </ActionMenu>

        <ActionMenu label="Queue" disabled={props.selectedCount === 0}>
          {queueCapabilities.canUpscale || queueCapabilities.canMoire ? (
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
                  queueCapabilities.allRapid ? props.onBulkMoireCleanMax : props.onBulkUpscaleMax
                }
              />
            </>
          ) : null}
          {queueCapabilities.canRefine ? (
            <MenuItem label="Bulk refine → low-denoise second pass" onClick={props.onBulkRefine} />
          ) : null}
          {queueCapabilities.canMoire && !queueCapabilities.allRapid ? (
            <>
              <MenuItem
                label="Bulk Flux polish → Final (blur only)"
                onClick={props.onBulkMoireCleanFinal}
              />
              <MenuItem
                label="Bulk Flux polish → Max (blur + resample)"
                onClick={props.onBulkMoireCleanMax}
              />
            </>
          ) : null}
          {queueCapabilities.allLightning ? (
            <MenuItem
              label="Bulk variation → Lightning (new seeds + Final quality)"
              onClick={props.onBulkRequeue}
            />
          ) : (
            <MenuItem label="Bulk new variation (randomized seeds)" onClick={props.onBulkRequeue} />
          )}
          {!props.lean ? (
            <>
              <MenuItem
                label="Seed experiment → perturb seed"
                onClick={props.onSeedExperiment}
                disabled={!singleSelected}
              />
              <MenuItem
                label={`Param experiment → sweep ${props.paramAxis}`}
                onClick={props.onParamExperiment}
                disabled={!singleSelected}
              />
              <MenuItem
                label="Param grid (CFG×steps) → matrix"
                onClick={props.onParamGrid}
                disabled={!singleSelected}
              />
              <MenuItem
                label="Mutate winner → text diff prompt"
                onClick={props.onMutateWinner}
                disabled={!singleSelected}
              />
              <MenuItem
                label="Negative A/B → toggle prompt"
                onClick={props.onNegativeAb}
                disabled={!singleSelected}
              />
            </>
          ) : null}
        </ActionMenu>

        {!props.lean ? (
          <ActionMenu label="Send" disabled={!singleSelected}>
            <MenuItem label="Open in Variations" onClick={props.onVariations} />
            <MenuItem label="Open in Topics" onClick={props.onTopics} />
            <MenuItem label="Find similar" onClick={props.onFindSimilar} />
            {props.similarSearchActive ? (
              <MenuItem label="Clear similar filter" onClick={props.onClearSimilar} />
            ) : null}
          </ActionMenu>
        ) : null}

        <ActionMenu label="Organize">
          <MenuItem label="Assign active project" onClick={props.onAssignActiveProject} />
          {props.projects.map(project => (
            <MenuItem
              key={project.id}
              label={`Assign · ${project.name}`}
              onClick={() => props.onAssignProject(project.id)}
            />
          ))}
          <MenuItem label="Favorite" onClick={() => props.onFavorite(true)} />
          <MenuItem label="Unfavorite" onClick={() => props.onFavorite(false)} />
        </ActionMenu>

        <button
          type="button"
          className={`ui-btn-ghost ui-btn-sm text-xs rounded-xl border border-rose-600/55 bg-rose-900/20 backdrop-blur-xs transition hover:bg-rose-500/40 hover:border-rose-500/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/30 text-rose-400`}
          onClick={props.onDelete}
        >
          Remove selected
        </button>

        {!props.lean ? (
          <label className="ml-auto hidden items-center gap-1 text-[11px] text-[var(--text-muted)] sm:flex">
            Param axis
            <select
              value={props.paramAxis}
              onChange={event => props.setParamAxis(event.target.value as ParamExperimentAxis)}
              className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-muted)] px-2 py-1 text-[var(--text-secondary)]"
            >
              <option value="cfg">CFG</option>
              <option value="steps">Steps</option>
              <option value="width">Width</option>
              <option value="seed">Seed</option>
            </select>
          </label>
        ) : null}
      </div>
    </div>
  );
}
