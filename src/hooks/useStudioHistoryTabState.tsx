'use client';

import { useEffect, useMemo, useState } from 'react';
import type { PromptHistoryEntry } from '@/hooks/usePromptHistory';
import { uniqueHistoryModels, uniqueHistoryTags, uniqueHistoryTools } from '@/lib/history-filter';
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
import {
  startBackgroundFromGalleryEntry,
  startComposeFromGalleryEntry,
  startControlNetFromGalleryEntry,
  startImagePromptFromGalleryEntry,
  startInpaintFromGalleryEntry,
  startOutpaintFromGalleryEntry,
  startRefineFromGalleryEntry,
  startVideoFromGalleryEntry,
} from '@/lib/improve-output';
import { toastBulkQueueSummary, toastHeldMax, toastQueueOutcome } from '@/lib/app-toast';
import { loadHistoryDensity, type HistoryDensity } from '@/lib/history-density';
import {
  DEFAULT_HISTORY_PAGE_SIZE,
  paginateItems,
  pageForIndex,
  type HistoryPageSize,
} from '@/lib/history-pagination';
import { shouldVirtualizeHistoryList } from '@/components/studio/VirtualizedHistoryList';
import { readBrowserString } from '@/lib/browser-storage';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { buildGalleryLightboxPlaylist } from '@/lib/comfyui-gallery';
import type { ImageLightboxState } from '@/components/ui/ImageLightbox';
import HistoryCard from '@/components/studio/history/HistoryCard';
import type { StudioHistoryTabProps } from '@/components/studio/history/studio-history-tab-types';

function readHistoryBatchPrompts(entry: PromptHistoryEntry): string[] {
  const raw = entry.metadata?.batchPrompts;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

export function useStudioHistoryTabState(props: StudioHistoryTabProps) {
  const {
    entries,
    filteredEntries,
    highlightHistoryId,
    historyFilter,
    onCopy,
    onToggleFavorite,
    onRate,
    onAddTag,
    onRemoveEntry,
    onDiffLeft,
    onDiffRight,
    onSaveTemplateFromEntry,
    onBackupStatusChange,
  } = props;

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

  // findGalleryEntryForHistory() does an O(gallery.length) scan (gallery can hold thousands
  // of entries). renderHistoryCard() used to call it directly at render time — twice per row,
  // once just to decide whether onPreview should be set and again inside the handler — so every
  // re-render of this tab (e.g. every keystroke in the history search box) redid that scan for
  // every visible row. Precompute it once per row here instead; this only recomputes when the
  // set of visible rows actually changes, not on unrelated re-renders.
  const linkedGalleryEntryByHistoryId = useMemo(() => {
    const map = new Map<string, ReturnType<typeof findGalleryEntryForHistory>>();
    for (const entry of visibleEntries) {
      map.set(entry.id, findGalleryEntryForHistory(entry));
    }
    return map;
  }, [visibleEntries]);

  // Each of these does a map/flatMap → Set → sort() over the full (unfiltered) history list —
  // they were previously called directly in JSX on every render, including every search
  // keystroke, even though their result only depends on `entries`.
  const historyToolOptions = useMemo(() => uniqueHistoryTools(entries), [entries]);
  const historyModelOptions = useMemo(() => uniqueHistoryModels(entries), [entries]);
  const historyTagOptions = useMemo(() => uniqueHistoryTags(entries), [entries]);

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
      onOpenLinkedEdit={target => {
        const galleryEntry = findGalleryEntryForHistory(entry);
        if (!galleryEntry) {
          onBackupStatusChange(
            'No linked gallery output — queue from a tool first, then open edit tools from history.'
          );
          return;
        }
        if (target === 'refine') {
          startRefineFromGalleryEntry(galleryEntry);
          return;
        }
        if (target === 'inpaint') {
          startInpaintFromGalleryEntry(galleryEntry);
          return;
        }
        if (target === 'outpaint') {
          startOutpaintFromGalleryEntry(galleryEntry);
          return;
        }
        if (target === 'compose') {
          startComposeFromGalleryEntry(galleryEntry);
          return;
        }
        if (target === 'video') {
          startVideoFromGalleryEntry(galleryEntry);
          return;
        }
        if (target === 'controlnet') {
          startControlNetFromGalleryEntry(galleryEntry);
          return;
        }
        if (target === 'background') {
          startBackgroundFromGalleryEntry(galleryEntry);
          return;
        }
        startImagePromptFromGalleryEntry(galleryEntry);
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
        linkedGalleryEntryByHistoryId.get(entry.id)
          ? () => {
              const galleryEntry = linkedGalleryEntryByHistoryId.get(entry.id);
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

  return {
    pageSize,
    setPageSize,
    density,
    setDensity,
    page,
    setPage,
    bulkTagDraft,
    setBulkTagDraft,
    savedViews,
    setSavedViews,
    viewNameDraft,
    setViewNameDraft,
    lightbox,
    setLightbox,
    lightboxEntries,
    setLightboxEntries,
    pagination,
    useVirtualHistory,
    visibleEntries,
    historyToolOptions,
    historyModelOptions,
    historyTagOptions,
    renderHistoryCard,
  };
}
