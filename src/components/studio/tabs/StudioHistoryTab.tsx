'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import type { PromptHistoryEntry } from '@/hooks/usePromptHistory';
import type { PromptProject } from '@/lib/prompt-projects';
import {
  uniqueHistoryModels,
  uniqueHistoryTags,
  uniqueHistoryTools,
  type HistoryFilter,
} from '@/lib/history-filter';
import {
  deleteHistorySavedView,
  loadHistorySavedViews,
  upsertHistorySavedView,
  type HistorySavedView,
} from '@/lib/history-saved-views';
import { buildPromptSidecar, downloadPromptSidecar } from '@/lib/prompt-sidecar';
import {
  requeueComfyJobFromHistory,
  requeueComfyJobs,
  requeueRefineFromGalleryEntry,
  requeueUpscaleFromGalleryEntry,
} from '@/lib/comfyui-requeue';
import { findGalleryEntryForHistory } from '@/lib/prompt-lineage';
import { buildRegenerateUrl } from '@/lib/regenerate-url';
import { buildUseAsHintsUrl } from '@/lib/use-as-hints-url';
import { studioHistoryUrl } from '@/lib/prompt-lineage';
import { startPromptEditorFromHistoryEntry } from '@/lib/improve-output';
import { toastBulkQueueSummary, toastHeldMax, toastQueueOutcome } from '@/lib/app-toast';
import { loadHistoryDensity, saveHistoryDensity, type HistoryDensity } from '@/lib/history-density';
import {
  downloadTextFile,
  exportHistoryCsv,
  exportHistoryJsonl,
} from '@/lib/history-export-formats';
import {
  ToolBlockGroup,
  ToolContentPanel,
  ToolMetaPanel,
  ToolSection,
  accentFocusClass,
} from '@/components/ui/ToolPageShell';
import type { ToolAccent } from '@/lib/tool-theme';
import { FieldLabel } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import ImageLightbox, { type ImageLightboxState } from '@/components/ui/ImageLightbox';
import { buildGalleryLightboxPlaylist, resolveGalleryLightboxEntry } from '@/lib/comfyui-gallery';
import { downloadGalleryImage } from '@/lib/comfyui-gallery-export';
import ListPaginator from '@/components/ui/ListPaginator';
import {
  DEFAULT_HISTORY_PAGE_SIZE,
  paginateItems,
  pageForIndex,
  type HistoryPageSize,
} from '@/lib/history-pagination';
import VirtualizedHistoryList, {
  shouldVirtualizeHistoryList,
} from '@/components/studio/VirtualizedHistoryList';
import { readBrowserString, writeBrowserString } from '@/lib/browser-storage';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import {
  EmptyState,
  ErrorState,
  isLikelyErrorStatus,
  StudioTabSkeleton,
  SuccessBanner,
} from '@/components/ui/ViewState';

const PromptDiagnosticsPanel = dynamic(() => import('@/components/PromptDiagnosticsPanel'), {
  loading: () => <StudioTabSkeleton />,
});

export type StudioHistoryTabProps = {
  accent: ToolAccent;
  entries: PromptHistoryEntry[];
  filteredEntries: PromptHistoryEntry[];
  favoriteEntries: PromptHistoryEntry[];
  historyFilter: HistoryFilter;
  onHistoryFilterChange: React.Dispatch<React.SetStateAction<HistoryFilter>>;
  projects: PromptProject[];
  activeProjectId?: string;
  onActiveProjectChange: (projectId: string | undefined) => void;
  backupStatus: string | null;
  onBackupStatusChange: (status: string | null) => void;
  comfyUiStatus: string | null;
  highlightHistoryId: string | null;
  onCopy: (text: string) => void;
  onToggleFavorite: (id: string) => void;
  onRate: (id: string, rating: PromptHistoryEntry['rating']) => void;
  onAddTag: (id: string, tag: string) => void;
  onRemoveEntry: (id: string) => void;
  onRemoveEntries?: (ids: string[]) => void;
  onAddTagToEntries?: (ids: string[], tag: string) => void;
  onClearHistory: () => void;
  onImportBackup: (file: File) => void | Promise<void>;
  onDiffLeft: (id: string) => void;
  onDiffRight: (id: string) => void;
  onSaveTemplateFromEntry: (entry: PromptHistoryEntry) => void;
  onSendBatchFavorites: (prompts: string[]) => void;
};

function readHistoryBatchPrompts(entry: PromptHistoryEntry): string[] {
  const raw = entry.metadata?.batchPrompts;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function HistoryCard({
  entry,
  highlighted,
  density = 'comfortable',
  onCopy,
  onToggleFavorite,
  onRate,
  onAddTag,
  onExportSidecar,
  onRemove,
  onDiffLeft,
  onDiffRight,
  onSaveTemplate,
  onRequeue,
  onUpscale,
  onRefine,
  onRequeueBatch,
  batchPromptCount = 0,
  onPreview,
}: {
  entry: PromptHistoryEntry;
  highlighted?: boolean;
  density?: HistoryDensity;
  onCopy: () => void;
  onToggleFavorite: () => void;
  onRate: (rating: PromptHistoryEntry['rating']) => void;
  onAddTag: (tag: string) => void;
  onExportSidecar: () => void;
  onRemove: () => void;
  onDiffLeft: () => void;
  onDiffRight: () => void;
  onSaveTemplate: () => void;
  onRequeue: (newSeed: boolean) => void;
  onUpscale?: (qualityProfile: 'final' | 'max') => void;
  onRefine?: () => void;
  onRequeueBatch?: () => void;
  batchPromptCount?: number;
  onPreview?: () => void;
}) {
  const regenerateUrl = buildRegenerateUrl(entry);
  const useAsHintsUrl = buildUseAsHintsUrl(entry);
  const showHintDiff =
    entry.hints?.trim() &&
    entry.prompt.trim() &&
    !entry.prompt.toLowerCase().includes(entry.hints.trim().slice(0, 40).toLowerCase());
  const compact = density === 'compact';

  return (
    <ToolContentPanel
      className={`ui-block-group min-w-0 ${highlighted ? 'ring-2 ring-violet-500/40' : ''} ${
        compact ? '!gap-2' : ''
      }`}
    >
      <pre
        className={`type-code overflow-auto whitespace-pre-wrap border border-[var(--border-subtle)] bg-[var(--bg-muted)] !text-[var(--tint-success-text)] ${
          compact ? 'max-h-28 p-3 text-xs' : 'max-h-56 p-5'
        }`}
      >
        {entry.prompt}
      </pre>

      <ToolMetaPanel>
        <div className={`flex min-w-0 flex-col ${compact ? 'gap-2' : 'gap-3'}`}>
          <p className="type-caption min-w-0 break-words text-[var(--text-muted)]">
            {entry.tool} · {entry.model} · {new Date(entry.timestamp).toLocaleString()}
          </p>
          <div className={`ui-list-actions w-full justify-start ${compact ? 'gap-1.5' : ''}`}>
            <a href={regenerateUrl} className="ui-btn-ghost ui-btn-sm type-caption">
              Regenerate
            </a>
            <a href={useAsHintsUrl} className="ui-btn-ghost ui-btn-sm type-caption">
              Use as hints
            </a>
            <Button
              variant="ghost"
              size="sm"
              className="type-caption"
              onClick={() => startPromptEditorFromHistoryEntry(entry)}
            >
              Edit prompt
            </Button>
            <a href={studioHistoryUrl(entry.id)} className="ui-btn-ghost ui-btn-sm type-caption">
              Link
            </a>
            <Button variant="ghost" size="sm" className="type-caption" onClick={onToggleFavorite}>
              {entry.favorite ? '★' : '☆'}
            </Button>
            <Button variant="ghost" size="sm" className="type-caption" onClick={onCopy}>
              Copy
            </Button>
            {onPreview ? (
              <Button variant="ghost" size="sm" className="type-caption" onClick={onPreview}>
                Preview
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" className="type-caption" onClick={onExportSidecar}>
              Sidecar
            </Button>
            <Button
              variant="accent-outline"
              size="sm"
              className="type-caption"
              onClick={() => onRequeue(false)}
            >
              Re-queue
            </Button>
            <Button
              variant="accent-outline"
              size="sm"
              className="type-caption"
              onClick={() => onRequeue(true)}
            >
              New variation (new seed)
            </Button>
            {onUpscale ? (
              <>
                <Button
                  variant="accent-outline"
                  size="sm"
                  className="type-caption"
                  onClick={() => onUpscale('final')}
                >
                  Upscale (Final)
                </Button>
                <Button
                  variant="accent-outline"
                  size="sm"
                  className="type-caption"
                  onClick={() => onUpscale('max')}
                >
                  Upscale (Max)
                </Button>
              </>
            ) : null}
            {onRefine ? (
              <Button
                variant="accent-outline"
                size="sm"
                className="type-caption"
                onClick={onRefine}
              >
                Refine (low denoise)
              </Button>
            ) : null}
            {batchPromptCount > 1 && onRequeueBatch ? (
              <Button
                variant="accent-outline"
                size="sm"
                className="type-caption"
                onClick={onRequeueBatch}
              >
                Re-queue batch ({batchPromptCount})
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              className="type-caption"
              onClick={() => {
                const tag = window.prompt('Add tag');
                if (tag?.trim()) {
                  onAddTag(tag.trim());
                }
              }}
            >
              Tag
            </Button>
            <Button variant="ghost" size="sm" className="type-caption" onClick={onDiffLeft}>
              Diff A
            </Button>
            <Button variant="ghost" size="sm" className="type-caption" onClick={onDiffRight}>
              Diff B
            </Button>
            <Button variant="ghost" size="sm" className="type-caption" onClick={onSaveTemplate}>
              Template
            </Button>
            <Button variant="danger" size="sm" className="type-caption" onClick={onRemove}>
              Remove
            </Button>
          </div>
        </div>

        {entry.hints?.trim() && (
          <p className="type-caption ui-truncate-2">
            Hints: <span className="text-[var(--text-secondary)]">{entry.hints}</span>
          </p>
        )}

        {(entry.tags?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-2">
            {entry.tags!.map(tag => (
              <span
                key={tag}
                className="type-overline rounded-[var(--radius-full)] border border-[var(--border-default)] bg-[var(--bg-subtle)] px-2.5 py-1"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {showHintDiff && (
          <p className="type-caption text-[var(--tint-warning-text)]">
            Prompt expanded beyond the saved hints — use Regenerate to roll again with the same
            inputs.
          </p>
        )}

        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map(value => (
            <button
              key={value}
              type="button"
              onClick={() => onRate(value as PromptHistoryEntry['rating'])}
              className={`ui-chip !min-h-8 !min-w-8 justify-center px-0 ${
                entry.rating === value ? '' : ''
              }`}
              data-active={entry.rating === value ? 'true' : 'false'}
            >
              {value}
            </button>
          ))}
        </div>

        {entry.diagnostics && <PromptDiagnosticsPanel diagnostics={entry.diagnostics} />}
      </ToolMetaPanel>
    </ToolContentPanel>
  );
}

export default function StudioHistoryTab({
  accent,
  entries,
  filteredEntries,
  favoriteEntries,
  historyFilter,
  onHistoryFilterChange,
  projects,
  activeProjectId,
  onActiveProjectChange,
  backupStatus,
  onBackupStatusChange,
  comfyUiStatus,
  highlightHistoryId,
  onCopy,
  onToggleFavorite,
  onRate,
  onAddTag,
  onRemoveEntry,
  onRemoveEntries,
  onAddTagToEntries,
  onClearHistory,
  onImportBackup,
  onDiffLeft,
  onDiffRight,
  onSaveTemplateFromEntry,
  onSendBatchFavorites,
}: StudioHistoryTabProps) {
  const [pageSize, setPageSize] = useState<HistoryPageSize>(() => {
    const stored = readBrowserString('studio-history-page-size');
    const parsed = stored ? Number(stored) : DEFAULT_HISTORY_PAGE_SIZE;
    return ([10, 25, 50, 100] as const).includes(parsed as HistoryPageSize)
      ? (parsed as HistoryPageSize)
      : DEFAULT_HISTORY_PAGE_SIZE;
  });
  const [density, setDensity] = useState<HistoryDensity>(() => loadHistoryDensity());

  const filterKey = useMemo(() => JSON.stringify(historyFilter), [historyFilter]);
  const [pageByFilter, setPageByFilter] = useState<Record<string, number>>({});
  const [bulkTagDraft, setBulkTagDraft] = useState('');
  const [savedViews, setSavedViews] = useState<HistorySavedView[]>(() => loadHistorySavedViews());
  const [viewNameDraft, setViewNameDraft] = useState('');
  const [lightbox, setLightbox] = useState<ImageLightboxState | null>(null);
  const [lightboxEntries, setLightboxEntries] = useState<
    NonNullable<ReturnType<typeof findGalleryEntryForHistory>>[]
  >([]);

  const page = pageByFilter[filterKey] ?? 1;
  const setPage = (next: number | ((prev: number) => number)) => {
    setPageByFilter(previous => {
      const current = previous[filterKey] ?? 1;
      const resolved = typeof next === 'function' ? next(current) : next;
      return { ...previous, [filterKey]: resolved };
    });
  };

  useEffect(() => {
    if (!highlightHistoryId) {
      return;
    }
    const index = filteredEntries.findIndex(entry => entry.id === highlightHistoryId);
    if (index >= 0) {
      scheduleAfterCommit(() => {
        setPage(pageForIndex(index, pageSize));
      });
    }
  }, [highlightHistoryId, filteredEntries, pageSize, filterKey]);

  const pagination = useMemo(
    () => paginateItems(filteredEntries, page, pageSize),
    [filteredEntries, page, pageSize]
  );

  const useVirtualHistory = shouldVirtualizeHistoryList(filteredEntries.length);
  const visibleEntries = useVirtualHistory ? filteredEntries : pagination.items;

  const renderHistoryCard = (entry: PromptHistoryEntry) => (
    <HistoryCard
      key={entry.id}
      entry={entry}
      highlighted={highlightHistoryId === entry.id}
      density={density}
      onCopy={() => onCopy(entry.prompt)}
      onToggleFavorite={() => onToggleFavorite(entry.id)}
      onRate={rating => onRate(entry.id, rating)}
      onAddTag={tag => onAddTag(entry.id, tag)}
      onExportSidecar={() => {
        downloadPromptSidecar(
          buildPromptSidecar({
            positive: entry.prompt,
            model: entry.model,
            hints: entry.hints,
            tool: entry.tool,
            diagnostics: entry.diagnostics,
            metadata: entry.metadata,
          }),
          `${entry.tool}-history`
        );
      }}
      onRemove={() => onRemoveEntry(entry.id)}
      onDiffLeft={() => onDiffLeft(entry.id)}
      onDiffRight={() => onDiffRight(entry.id)}
      onSaveTemplate={() => onSaveTemplateFromEntry(entry)}
      onRequeue={newSeed => {
        onBackupStatusChange('Queueing variation from history…');
        void requeueComfyJobFromHistory(entry, {
          newSeed,
          onStatus: onBackupStatusChange,
        }).then(result => {
          if (!result.ok) {
            onBackupStatusChange(result.error ?? 'Re-queue failed.');
            toastQueueOutcome({
              ok: false,
              text: result.error ?? 'Re-queue failed.',
            });
            return;
          }
          if (result.held) {
            const message = 'Max re-queue held until ComfyUI queue is idle';
            onBackupStatusChange(message);
            toastHeldMax({ text: message });
            return;
          }
          const message = [
            'queued from history',
            result.promptId ? `prompt_id ${result.promptId}` : null,
            newSeed ? 'new variation · new seed' : 'same params',
          ]
            .filter(Boolean)
            .join(' · ');
          onBackupStatusChange(message);
          toastQueueOutcome({ ok: true, text: message });
        });
      }}
      onUpscale={qualityProfile => {
        const galleryEntry = findGalleryEntryForHistory(entry);
        if (!galleryEntry) {
          onBackupStatusChange(
            'No linked gallery output — rate or queue from Gallery first, then upscale from there.'
          );
          return;
        }
        onBackupStatusChange(`Upscaling linked gallery output (${qualityProfile})…`);
        void requeueUpscaleFromGalleryEntry(galleryEntry, {
          qualityProfile,
          onStatus: onBackupStatusChange,
        }).then(result => {
          if (!result.ok) {
            onBackupStatusChange(result.error ?? 'Upscale failed.');
            toastQueueOutcome({
              ok: false,
              text: result.error ?? 'Upscale failed.',
            });
            return;
          }
          if (result.held) {
            const message = 'Max upscale held until ComfyUI queue is idle';
            onBackupStatusChange(message);
            toastHeldMax({ text: message });
            return;
          }
          const message = result.promptId
            ? `Upscale queued · ${result.promptId}`
            : 'Upscale queued';
          onBackupStatusChange(message);
          toastQueueOutcome({ ok: true, text: message });
        });
      }}
      onRefine={() => {
        const galleryEntry = findGalleryEntryForHistory(entry);
        if (!galleryEntry) {
          onBackupStatusChange(
            'No linked gallery output — open Gallery and use Refine on the completed output.'
          );
          return;
        }
        onBackupStatusChange('Queueing low-denoise refine from linked gallery output…');
        void requeueRefineFromGalleryEntry(galleryEntry, {
          onStatus: onBackupStatusChange,
        }).then(result => {
          if (!result.ok) {
            onBackupStatusChange(result.error ?? 'Refine failed.');
            toastQueueOutcome({
              ok: false,
              text: result.error ?? 'Refine failed.',
            });
            return;
          }
          if (result.held) {
            const message = 'Max refine held until ComfyUI queue is idle';
            onBackupStatusChange(message);
            toastHeldMax({ text: message });
            return;
          }
          const message = result.promptId ? `Refine queued · ${result.promptId}` : 'Refine queued';
          onBackupStatusChange(message);
          toastQueueOutcome({ ok: true, text: message });
        });
      }}
      onRequeueBatch={() => {
        const batchPrompts = readHistoryBatchPrompts(entry);
        if (batchPrompts.length === 0) {
          return;
        }
        onBackupStatusChange(`Re-queueing batch (${batchPrompts.length})…`);
        void requeueComfyJobs(
          batchPrompts.map(prompt => ({
            prompt,
            tool: entry.tool,
            model: entry.model,
            hints: entry.hints,
            newSeed: true,
          })),
          onBackupStatusChange
        ).then(({ queued, failed }) => {
          onBackupStatusChange(`Batch re-queue finished · ${queued} queued · ${failed} failed`);
          toastBulkQueueSummary({
            label: 'Batch re-queue finished',
            queued,
            failed,
          });
        });
      }}
      batchPromptCount={readHistoryBatchPrompts(entry).length}
      onPreview={
        findGalleryEntryForHistory(entry)
          ? () => {
              const galleryEntry = findGalleryEntryForHistory(entry);
              if (!galleryEntry) {
                return;
              }
              const playlist = buildGalleryLightboxPlaylist([galleryEntry]);
              if (playlist.images.length === 0) {
                onBackupStatusChange('Linked gallery entry has no previewable image.');
                return;
              }
              setLightboxEntries([galleryEntry]);
              setLightbox({
                ...playlist,
                index: 0,
                title: playlist.titles[0],
              });
            }
          : undefined
      }
    />
  );

  return (
    <ToolSection title="Saved prompts">
      <ImageLightbox
        state={lightbox}
        onClose={() => {
          setLightbox(null);
          setLightboxEntries([]);
        }}
        onIndexChange={index =>
          setLightbox(previous =>
            previous
              ? { ...previous, index, title: previous.titles?.[index] ?? previous.title }
              : previous
          )
        }
        onDownloadImage={async displayIndex => {
          const resolved = resolveGalleryLightboxEntry(lightboxEntries, displayIndex);
          if (!resolved) {
            return;
          }
          await downloadGalleryImage(resolved.entry, resolved.imageIndex);
        }}
      />
      <ToolMetaPanel>
        <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <p className="type-heading shrink-0">
            {filteredEntries.length}
            {filteredEntries.length !== entries.length ? ` of ${entries.length}` : ''} entries
            {useVirtualHistory
              ? ' · virtual scroll'
              : filteredEntries.length > pageSize
                ? ` · page ${pagination.page}/${pagination.totalPages}`
                : ''}
          </p>
          <div className="ui-list-actions w-full justify-start lg:w-auto lg:justify-end">
            <div className="flex items-center gap-1 rounded-full border border-[var(--border-subtle)] p-0.5">
              {(
                [
                  ['comfortable', 'Comfortable'],
                  ['compact', 'Compact'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={density === value}
                  className={`rounded-full px-2.5 py-1 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${
                    density === value
                      ? 'bg-[color-mix(in_oklab,var(--accent)_72%,#1a1028)] text-white'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                  onClick={() => {
                    setDensity(value);
                    saveHistoryDensity(value);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {favoriteEntries.length > 0 && (
              <Button
                variant="accent-outline"
                size="sm"
                onClick={() => onSendBatchFavorites(favoriteEntries.map(entry => entry.prompt))}
              >
                Queue favorites ({favoriteEntries.length})
              </Button>
            )}
            {entries.length > 0 && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    downloadTextFile(
                      exportHistoryCsv(filteredEntries),
                      'history-filtered.csv',
                      'text/csv;charset=utf-8'
                    )
                  }
                >
                  Export CSV
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    downloadTextFile(
                      exportHistoryJsonl(filteredEntries),
                      'history-filtered.jsonl',
                      'application/jsonl;charset=utf-8'
                    )
                  }
                >
                  Export JSONL
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void import('@/lib/studio-backup').then(({ downloadHistoryExport }) => {
                      downloadHistoryExport(filteredEntries);
                    });
                  }}
                >
                  Export filtered
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void import('@/lib/studio-backup').then(({ downloadHistoryExport }) => {
                      downloadHistoryExport(entries);
                    });
                  }}
                >
                  Export all
                </Button>
                <Button variant="ghost" size="sm" onClick={onClearHistory}>
                  Clear all
                </Button>
                {filteredEntries.length > 0 &&
                filteredEntries.length !== entries.length &&
                onRemoveEntries ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Delete ${filteredEntries.length} filtered entries? This cannot be undone.`
                        )
                      ) {
                        onRemoveEntries(filteredEntries.map(entry => entry.id));
                        onBackupStatusChange(`Removed ${filteredEntries.length} filtered entries.`);
                      }
                    }}
                  >
                    Delete filtered ({filteredEntries.length})
                  </Button>
                ) : null}
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                void import('@/lib/studio-backup').then(({ downloadStudioBackup }) => {
                  downloadStudioBackup();
                  onBackupStatusChange('Studio backup downloaded.');
                });
              }}
            >
              Export backup
            </Button>
            <label className="ui-btn-ghost ui-btn-sm ui-file-input-label cursor-pointer px-4">
              Import backup
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={event => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void onImportBackup(file);
                  }
                  event.target.value = '';
                }}
              />
            </label>
          </div>
        </div>

        {entries.length > 0 && (
          <div className="grid gap-4 pt-2 sm:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-2">
              <FieldLabel htmlFor="history-search">Search</FieldLabel>
              <input
                id="history-search"
                value={historyFilter.query ?? ''}
                onChange={event =>
                  onHistoryFilterChange(previous => ({
                    ...previous,
                    query: event.target.value || undefined,
                  }))
                }
                placeholder="prompt, hints, tool…"
                className="ui-input px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
              />
            </div>
            <div className="space-y-2">
              <FieldLabel htmlFor="history-tool">Tool</FieldLabel>
              <select
                id="history-tool"
                value={historyFilter.tool ?? 'all'}
                onChange={event =>
                  onHistoryFilterChange(previous => ({
                    ...previous,
                    tool: event.target.value === 'all' ? undefined : event.target.value,
                  }))
                }
                className="ui-input px-3 py-[var(--input-padding-y)] type-body"
              >
                <option value="all">All tools</option>
                {uniqueHistoryTools(entries).map(tool => (
                  <option key={tool} value={tool}>
                    {tool}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <FieldLabel htmlFor="history-model">Model</FieldLabel>
              <select
                id="history-model"
                value={historyFilter.model ?? 'all'}
                onChange={event =>
                  onHistoryFilterChange(previous => ({
                    ...previous,
                    model: event.target.value === 'all' ? undefined : event.target.value,
                  }))
                }
                className="ui-input px-3 py-[var(--input-padding-y)] type-body"
              >
                <option value="all">All models</option>
                {uniqueHistoryModels(entries).map(model => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <FieldLabel htmlFor="history-tag">Tag</FieldLabel>
              <select
                id="history-tag"
                value={historyFilter.tag ?? 'all'}
                onChange={event =>
                  onHistoryFilterChange(previous => ({
                    ...previous,
                    tag: event.target.value === 'all' ? undefined : event.target.value,
                  }))
                }
                className="ui-input px-3 py-[var(--input-padding-y)] type-body"
              >
                <option value="all">All tags</option>
                {uniqueHistoryTags(entries).map(tag => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-3 self-end pb-1 type-body">
              <input
                type="checkbox"
                checked={historyFilter.semanticSearch === true}
                onChange={event =>
                  onHistoryFilterChange(previous => ({
                    ...previous,
                    semanticSearch: event.target.checked || undefined,
                  }))
                }
                className={`h-4 w-4 rounded-[var(--radius-sm)] ${accentFocusClass(accent)}`}
              />
              Semantic search
            </label>
            {projects.length > 0 && (
              <div className="space-y-2">
                <FieldLabel htmlFor="history-project">Project</FieldLabel>
                <select
                  id="history-project"
                  value={activeProjectId ?? 'all'}
                  onChange={event => {
                    const value = event.target.value === 'all' ? undefined : event.target.value;
                    onActiveProjectChange(value);
                  }}
                  className="ui-input px-3 py-[var(--input-padding-y)] type-body"
                >
                  <option value="all">All projects</option>
                  {projects.map(project => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <label className="flex items-center gap-3 self-end pb-1 type-body">
              <input
                type="checkbox"
                checked={historyFilter.favoritesOnly === true}
                onChange={event =>
                  onHistoryFilterChange(previous => ({
                    ...previous,
                    favoritesOnly: event.target.checked || undefined,
                  }))
                }
                className={`h-4 w-4 rounded-[var(--radius-sm)] ${accentFocusClass(accent)}`}
              />
              Favorites only
            </label>
            <label className="flex items-center gap-3 self-end pb-1 type-body">
              <input
                type="checkbox"
                checked={historyFilter.videoOnly === true}
                onChange={event =>
                  onHistoryFilterChange(previous => ({
                    ...previous,
                    videoOnly: event.target.checked || undefined,
                  }))
                }
                className={`h-4 w-4 rounded-[var(--radius-sm)] ${accentFocusClass(accent)}`}
              />
              Video lineage only
            </label>
            <div className="flex flex-wrap items-end gap-2 sm:col-span-2 xl:col-span-3">
              <div className="min-w-[10rem] flex-1 space-y-2">
                <FieldLabel htmlFor="history-saved-view-name">Saved filter</FieldLabel>
                <input
                  id="history-saved-view-name"
                  value={viewNameDraft}
                  onChange={event => setViewNameDraft(event.target.value)}
                  placeholder="Campaign keepers, video drafts…"
                  className="ui-input px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
                />
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  const name = viewNameDraft.trim() || `Filter ${savedViews.length + 1}`;
                  upsertHistorySavedView({
                    id: `history-view-${Date.now().toString(36)}`,
                    name,
                    filter: historyFilter,
                  });
                  setSavedViews(loadHistorySavedViews());
                  setViewNameDraft('');
                  onBackupStatusChange(`Saved history filter “${name}”.`);
                }}
              >
                Save filter
              </Button>
              {savedViews.map(view => (
                <div key={view.id} className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      onHistoryFilterChange(view.filter);
                      onBackupStatusChange(`Applied filter “${view.name}”.`);
                    }}
                  >
                    {view.name}
                  </Button>
                  <button
                    type="button"
                    aria-label={`Delete saved filter ${view.name}`}
                    className="rounded px-1 text-xs text-[var(--text-muted)] hover:text-rose-300"
                    onClick={() => {
                      deleteHistorySavedView(view.id);
                      setSavedViews(loadHistorySavedViews());
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            {filteredEntries.length > 0 && onAddTagToEntries ? (
              <div className="flex flex-wrap items-end gap-2 sm:col-span-2 xl:col-span-3">
                <div className="min-w-[10rem] flex-1 space-y-2">
                  <FieldLabel htmlFor="history-bulk-tag">Tag filtered</FieldLabel>
                  <input
                    id="history-bulk-tag"
                    value={bulkTagDraft}
                    onChange={event => setBulkTagDraft(event.target.value)}
                    placeholder="campaign, keeper, …"
                    className="ui-input px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
                  />
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!bulkTagDraft.trim()}
                  onClick={() => {
                    const tag = bulkTagDraft.trim();
                    if (!tag) {
                      return;
                    }
                    onAddTagToEntries(
                      filteredEntries.map(entry => entry.id),
                      tag
                    );
                    setBulkTagDraft('');
                    onBackupStatusChange(`Tagged ${filteredEntries.length} entries “${tag}”.`);
                  }}
                >
                  Apply to {filteredEntries.length}
                </Button>
              </div>
            ) : null}
            <div className="space-y-2">
              <FieldLabel htmlFor="history-rating">Min rating</FieldLabel>
              <select
                id="history-rating"
                value={historyFilter.minRating ?? 0}
                onChange={event => {
                  const value = Number(event.target.value);
                  onHistoryFilterChange(previous => ({
                    ...previous,
                    minRating: value > 0 ? value : undefined,
                  }));
                }}
                className="ui-input px-3 py-[var(--input-padding-y)] type-body"
              >
                <option value={0}>Any</option>
                {[1, 2, 3, 4, 5].map(rating => (
                  <option key={rating} value={rating}>
                    {rating}+ stars
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </ToolMetaPanel>

      {backupStatus &&
        (isLikelyErrorStatus(backupStatus) ? (
          <ErrorState
            compact
            title="Action failed"
            description={backupStatus}
            action={{
              label: 'Dismiss',
              onClick: () => onBackupStatusChange(null),
            }}
          />
        ) : (
          <SuccessBanner message={backupStatus} />
        ))}
      {comfyUiStatus ? (
        <p className="type-caption text-[var(--accent-text)]">{comfyUiStatus}</p>
      ) : null}

      {entries.length === 0 ? (
        <EmptyState
          icon="inbox"
          title="No saved prompts yet"
          description="Generate a scene in Character or another tool, then use Save to history on the result panel. Your prompts will appear here for re-queue, export, and diff."
          action={{ label: 'Open Character', href: '/character' }}
        />
      ) : filteredEntries.length === 0 ? (
        <EmptyState
          icon="search"
          title="No matches for these filters"
          description="Try a broader search term or remove tool, model, tag, or rating filters to see more history entries."
          action={{
            label: 'Clear filters',
            onClick: () => onHistoryFilterChange({}),
          }}
        />
      ) : (
        <>
          {filteredEntries.length > pageSize && !useVirtualHistory ? (
            <ListPaginator
              page={pagination.page}
              totalPages={pagination.totalPages}
              totalItems={pagination.totalItems}
              rangeStart={pagination.rangeStart}
              rangeEnd={pagination.rangeEnd}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={nextSize => {
                setPageSize(nextSize);
                writeBrowserString('studio-history-page-size', String(nextSize));
                setPage(1);
              }}
            />
          ) : null}
          {useVirtualHistory ? (
            <VirtualizedHistoryList
              entries={filteredEntries}
              renderEntry={renderHistoryCard}
              density={density}
            />
          ) : (
            <ToolBlockGroup className="mt-[var(--block-gap)]">
              {visibleEntries.map(entry => renderHistoryCard(entry))}
            </ToolBlockGroup>
          )}
          {filteredEntries.length > pageSize && !useVirtualHistory ? (
            <ListPaginator
              page={pagination.page}
              totalPages={pagination.totalPages}
              totalItems={pagination.totalItems}
              rangeStart={pagination.rangeStart}
              rangeEnd={pagination.rangeEnd}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={nextSize => {
                setPageSize(nextSize);
                writeBrowserString('studio-history-page-size', String(nextSize));
                setPage(1);
              }}
            />
          ) : null}
        </>
      )}
    </ToolSection>
  );
}
