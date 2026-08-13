'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ComfyGalleryEntry } from '@/lib/comfyui-gallery';
import type { PromptProject } from '@/lib/prompt-projects';
import type { ParamExperimentAxis } from '@/lib/param-experiment-queue';
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
  onRate: (rating: NonNullable<ComfyGalleryEntry['reviewRating']>) => void;
  onDelete: () => void;
  onExportSidecars: () => void;
  onDownloadImages: () => void;
  onExportZip: () => void;
  onExportLoraDataset: () => void;
  onExportCompareJson: () => void;
  onExportCompareHtml: () => void;
  onFindSimilar: () => void;
  onFindVisualSimilar?: () => void;
  onClearSimilar: () => void;
  canClearSimilar: boolean;
  onApplyUserTag?: (tag: string) => void;
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
      ? 'border-[var(--tint-info-border)] bg-[var(--tint-info-bg)] text-[var(--tint-info-text)] hover:border-[var(--tint-info-border)]'
      : props.label === 'Queue'
        ? 'border-slate-600/35 bg-slate-900/15 text-slate-400 hover:border-slate-500/50'
        : props.label === 'Send'
          ? 'border-[var(--tint-success-border)] bg-[var(--tint-success-bg)] text-[var(--tint-success-text)] hover:brightness-110'
          : props.label === 'Organize'
            ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-text)] hover:brightness-110'
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
        className={`ui-btn-ghost ui-btn-sm text-xs rounded-xl border border-[var(--border-subtle)]/80 bg-[var(--bg-base)]/70 backdrop-blur-xs transition ${menuTone} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] active:scale-[0.97]`}
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
      className={`ui-menu-item rounded-xl border-[var(--border-subtle)]/60 bg-[var(--bg-base)]/70 text-[11px] backdrop-blur-xs transition hover:border-[var(--accent-border)] hover:bg-[var(--accent-muted)] hover:text-[var(--accent-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] active:scale-[0.97]`}
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
      ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-text)] rounded-xl backdrop-blur-xs px-2.5 py-1 text-xs font-medium'
      : props.selectedCount <= 10
        ? 'border-[var(--tint-success-border)] bg-[var(--tint-success-bg)] text-[var(--tint-success-text)] rounded-xl backdrop-blur-xs px-2.5 py-1 text-xs font-medium'
        : 'border-[var(--border-default)]/70 bg-[var(--bg-base)]/80 text-[var(--text-muted)] tabular-nums rounded-lg backdrop-blur-xs px-2.5 py-1 text-xs font-medium';

  return (
    <div className="ui-gallery-dock sticky top-[calc(var(--header-offset,0px)+0.5rem)] z-20 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-1 flex items-center gap-2 border-r border-[var(--border-subtle)] pr-3">
          <span className={selectionClassName}>{props.selectedCount} selected</span>
          <button
            type="button"
            onClick={props.onClearSelection}
            className={`ui-btn-ghost ui-btn-sm text-xs rounded-xl border border-[var(--border-subtle)]/70 bg-[var(--bg-base)]/60 backdrop-blur-xs transition hover:bg-[var(--accent-muted)] hover:border-[var(--accent-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] text-[var(--accent-text)]`}
          >
            Clear
          </button>
        </div>

        <button
          type="button"
          className={`ui-btn-ghost ui-btn-sm text-xs rounded-xl border border-[var(--tint-success-border)] bg-[var(--tint-success-bg)] backdrop-blur-xs transition hover:bg-[var(--tint-success-bg)] hover:border-[var(--tint-success-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tint-success-border)] text-[var(--tint-success-text)] disabled:!hidden`}
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
                label="Mutate crowned winner → text diff prompt"
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
            {props.onFindVisualSimilar ? (
              <MenuItem label="Looks like this" onClick={props.onFindVisualSimilar} />
            ) : null}
            {props.canClearSimilar ? (
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
          {props.onApplyUserTag ? (
            <MenuItem
              label="Add tag…"
              onClick={() => {
                const tag = window.prompt('Tag to apply to selected stills');
                if (tag?.trim()) {
                  props.onApplyUserTag?.(tag.trim());
                }
              }}
            />
          ) : null}
          {[5, 4, 3, 2, 1].map(rating => (
            <MenuItem
              key={rating}
              label={`Rate ${rating}★`}
              onClick={() => props.onRate(rating as NonNullable<ComfyGalleryEntry['reviewRating']>)}
            />
          ))}
        </ActionMenu>

        <button
          type="button"
          className={`ui-btn-ghost ui-btn-sm text-xs rounded-xl border border-[var(--tint-danger-border)] bg-[var(--tint-danger-bg)] backdrop-blur-xs transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tint-danger-border)] text-[var(--tint-danger-text)]`}
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
