'use client';

import {
  useLayoutEffect,
  useMemo,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import type { GalleryCardActions } from '@/components/gallery/GalleryCardItem';
import type { GalleryExperimentPanelProps } from '@/components/gallery/GalleryExperimentPanel';
import { startAnatomyRepairFromGalleryEntry } from '@/lib/improve-output';
import { formatMutatedJobsStatus, queueMutatedGalleryJobs } from '@/lib/gallery-mutations';
import { queueNegativeAbTest } from '@/lib/negative-ab-queue';
import { queueSeedExperiment } from '@/lib/seed-experiment-queue';
import { queueParamExperiment, type ParamExperimentAxis } from '@/lib/param-experiment-queue';
import { toastBulkQueueSummary, toastHeldMax, toastQueueOutcome } from '@/lib/app-toast';
import { loadActiveProjectId } from '@/lib/prompt-projects';
import {
  galleryTopicsPath,
  galleryVariationsPath,
  saveGalleryTopicsHandoff,
  saveGalleryVariationsHandoff,
  buildGalleryVariationsHandoff,
} from '@/lib/gallery-variations-handoff';
import {
  exportGalleryCsv,
  exportGalleryJsonl,
  downloadTextFile,
} from '@/lib/history-export-formats';
import {
  downloadGalleryImagesSequential,
  downloadGallerySidecarBundle,
} from '@/lib/comfyui-gallery-export';
import { cancelComfyGalleryJob } from '@/lib/comfyui-queue-cancel';
import { resolveRequeueImageUrlsFromEntry } from '@/lib/queue-requeue-images';
import {
  galleryEntryPrimaryMediaKind,
  type ComfyGalleryEntry,
  type ComfyGalleryFilter,
} from '@/lib/comfyui-gallery';
import { resolveExperimentWinnerEntry } from '@/lib/experiment-winners';
import {
  buildGalleryHandoff,
  galleryHandoffPath,
  type GalleryHandoffPayload,
  saveGalleryHandoff,
} from '@/lib/gallery-handoff';

const loadGalleryRequeue = () => import('@/lib/comfyui-requeue');

const EMPTY_GALLERY_CARD_ACTIONS: GalleryCardActions = {
  toggleSelected: () => undefined,
  remove: () => undefined,
  toggleFavorite: () => undefined,
  requeue: () => undefined,
  cancel: () => undefined,
  upscale: () => undefined,
  refine: () => undefined,
  softSecondPass: () => undefined,
  faceDetail: () => undefined,
  anatomyRepair: () => undefined,
  moireClean: () => undefined,
  showParent: () => undefined,
  showDerivatives: () => undefined,
  openImage: () => undefined,
  prefetchImage: () => undefined,
  reviewRating: () => undefined,
  downloadError: () => undefined,
  visionTagClick: () => undefined,
  userTagClick: () => undefined,
  viewWorkflow: () => undefined,
  restoreExactGraph: () => undefined,
  pick: () => undefined,
};

export type GalleryBulkExperimentHandlers = Omit<
  GalleryExperimentPanelProps,
  | 'selectedCount'
  | 'selectedEntries'
  | 'projects'
  | 'paramAxis'
  | 'setParamAxis'
  | 'similarSearchActive'
  | 'lean'
  | 'footer'
  | 'onClearSelection'
  | 'onCompare'
>;

export type UseGalleryPanelActionsInput = {
  entriesRef: MutableRefObject<ComfyGalleryEntry[]>;
  toggleSelected: (id: string, options?: { shift?: boolean }) => void;
  removeEntry: (id: string) => void;
  toggleFavorite: (id: string) => void;
  setRequeueStatus: (status: string | null) => void;
  setDownloadError: (message: string | null) => void;
  setFilter: Dispatch<SetStateAction<ComfyGalleryFilter>>;
  setWorkflowEntry: (entry: ComfyGalleryEntry | null) => void;
  openLightboxForEntryId: (entryId: string, imageIndex: number) => void;
  prefetchLightboxForEntryId: (entryId: string, imageIndex: number) => void;
  handleReviewRating: (
    entry: ComfyGalleryEntry,
    rating: NonNullable<ComfyGalleryEntry['reviewRating']>
  ) => void;
  pickFor: GalleryHandoffPayload['target'] | null;
  router: ReturnType<typeof import('next/navigation').useRouter>;
  selectedIds: string[];
  selectedEntries: ComfyGalleryEntry[];
  setSelectedIds: (ids: string[]) => void;
  setProjectIds: (ids: string[], projectId?: string) => void;
  removeEntries: (ids: string[]) => void;
  setFavorites: (ids: string[], favorite: boolean) => void;
  setReviewRatings: (ids: string[], rating: ComfyGalleryEntry['reviewRating']) => void;
  setUserTags?: (ids: string[], tags: string[], mode?: 'add' | 'replace' | 'remove') => void;
  paramAxis: ParamExperimentAxis;
  filter: ComfyGalleryFilter;
  setLoraExportScope: (scope: 'favorites' | 'selected') => void;
  setLoraExportOpen: (open: boolean) => void;
};

export function useGalleryPanelActions({
  entriesRef,
  toggleSelected,
  removeEntry,
  toggleFavorite,
  setRequeueStatus,
  setDownloadError,
  setFilter,
  setWorkflowEntry,
  openLightboxForEntryId,
  prefetchLightboxForEntryId,
  handleReviewRating,
  pickFor,
  router,
  selectedIds,
  selectedEntries,
  setSelectedIds,
  setProjectIds,
  removeEntries,
  setFavorites,
  setReviewRatings,
  setUserTags,
  paramAxis,
  filter,
  setLoraExportScope,
  setLoraExportOpen,
}: UseGalleryPanelActionsInput) {
  const galleryCardActionsRef = useRef<GalleryCardActions>(EMPTY_GALLERY_CARD_ACTIONS);

  useLayoutEffect(() => {
    galleryCardActionsRef.current = {
      toggleSelected,
      remove: removeEntry,
      toggleFavorite: (id: string) => {
        const entry = entriesRef.current.find(item => item.id === id);
        const willFavorite = entry ? !entry.favorite : false;
        toggleFavorite(id);
        if (entry && willFavorite) {
          void import('@/lib/auto-improve-loop')
            .then(({ runAutoImproveOnFavorite }) => runAutoImproveOnFavorite(entry, true))
            .then(message => {
              if (message) {
                setRequeueStatus(message);
              }
            });
        }
      },
      requeue: (
        id: string,
        newSeed: boolean,
        qualityProfile?: import('@/lib/queue-quality-profile').QueueQualityProfile,
        options?: { exactGraph?: boolean }
      ) => {
        const entry = entriesRef.current.find(item => item.id === id);
        if (!entry) {
          return;
        }
        const exactGraph = options?.exactGraph !== false;
        setRequeueStatus(exactGraph ? 'Replaying exact graph…' : 'Queueing variation…');
        void loadGalleryRequeue()
          .then(({ requeueComfyJobFromEntry }) =>
            requeueComfyJobFromEntry(entry, {
              newSeed,
              qualityProfile,
              exactGraph,
              onStatus: setRequeueStatus,
            })
          )
          .then(result => {
            if (!result.ok) {
              const message = result.error ?? 'Re-queue failed.';
              setRequeueStatus(message);
              toastQueueOutcome({ ok: false, text: message });
              return;
            }
            const profileNote = qualityProfile ? `${qualityProfile} quality · ` : '';
            const message = [
              'queued variation',
              profileNote,
              result.promptId ? `prompt_id ${result.promptId}` : null,
              result.comfyUrl,
              newSeed ? 'new seed' : 'same params',
            ]
              .filter(Boolean)
              .join(' · ');
            setRequeueStatus(message);
            toastQueueOutcome({ ok: true, text: message });
          });
      },
      cancel: (id: string) => {
        const entry = entriesRef.current.find(item => item.id === id);
        if (!entry) {
          return;
        }
        setRequeueStatus('Cancelling job…');
        void cancelComfyGalleryJob(entry).then(result => {
          if (!result.ok) {
            const message = result.error ?? 'Cancel failed.';
            setRequeueStatus(message);
            toastQueueOutcome({ ok: false, text: message });
            return;
          }
          setRequeueStatus('Job cancelled.');
          toastQueueOutcome({ ok: true, text: 'Job cancelled' });
        });
      },
      upscale: (id: string, qualityProfile: 'final' | 'max', options?: { force?: boolean }) => {
        const entry = entriesRef.current.find(item => item.id === id);
        if (!entry) {
          return;
        }
        setRequeueStatus(options?.force ? 'Force upscaling…' : 'Upscaling…');
        void loadGalleryRequeue()
          .then(({ requeueUpscaleFromGalleryEntry }) =>
            requeueUpscaleFromGalleryEntry(entry, {
              qualityProfile,
              force: options?.force,
              onStatus: setRequeueStatus,
            })
          )
          .then(result => {
            if (!result.ok) {
              setRequeueStatus(result.error ?? 'Upscale failed.');
              toastQueueOutcome({ ok: false, text: result.error ?? 'Upscale failed.' });
              return;
            }
            if (result.held) {
              const message = 'Max upscale held until ComfyUI queue is idle';
              setRequeueStatus(message);
              toastHeldMax({ text: message });
              return;
            }
            const message = [
              options?.force ? 'force upscale queued' : 'upscale queued',
              result.vramDowngraded
                ? 'Max → Final (VRAM)'
                : `${qualityProfile} quality · same image`,
              result.promptId ? `prompt_id ${result.promptId}` : null,
              result.comfyUrl,
            ]
              .filter(Boolean)
              .join(' · ');
            setRequeueStatus(message);
            toastQueueOutcome({ ok: true, text: message });
          });
      },
      refine: (id: string) => {
        const entry = entriesRef.current.find(item => item.id === id);
        if (!entry) {
          return;
        }
        setRequeueStatus('Queueing low-denoise refine…');
        void loadGalleryRequeue()
          .then(({ requeueRefineFromGalleryEntry }) =>
            requeueRefineFromGalleryEntry(entry, {
              onStatus: setRequeueStatus,
            })
          )
          .then(result => {
            if (!result.ok) {
              setRequeueStatus(result.error ?? 'Refine failed.');
              toastQueueOutcome({ ok: false, text: result.error ?? 'Refine failed.' });
              return;
            }
            if (result.held) {
              const message = 'Max refine held until ComfyUI queue is idle';
              setRequeueStatus(message);
              toastHeldMax({ text: message });
              return;
            }
            const message = [
              'refine queued',
              result.vramDowngraded ? 'Max → Final (VRAM)' : 'low denoise · same seed',
              result.promptId ? `prompt_id ${result.promptId}` : null,
              result.comfyUrl,
            ]
              .filter(Boolean)
              .join(' · ');
            setRequeueStatus(message);
            toastQueueOutcome({ ok: true, text: message });
          });
      },
      softSecondPass: (id: string) => {
        const entry = entriesRef.current.find(item => item.id === id);
        if (!entry) {
          return;
        }
        setRequeueStatus('Queueing soft second pass…');
        void loadGalleryRequeue()
          .then(({ requeueSoftSecondPassFromGalleryEntry }) =>
            requeueSoftSecondPassFromGalleryEntry(entry, {
              onStatus: setRequeueStatus,
            })
          )
          .then(result => {
            if (!result.ok) {
              setRequeueStatus(result.error ?? 'Soft second pass failed.');
              toastQueueOutcome({
                ok: false,
                text: result.error ?? 'Soft second pass failed.',
              });
              return;
            }
            if (result.held) {
              const message = 'Soft second pass held until ComfyUI queue is idle';
              setRequeueStatus(message);
              toastHeldMax({ text: message });
              return;
            }
            const message = [
              'soft second pass queued',
              result.vramDowngraded ? 'Max → Final (VRAM)' : 'gentle denoise · same seed',
              result.promptId ? `prompt_id ${result.promptId}` : null,
              result.comfyUrl,
            ]
              .filter(Boolean)
              .join(' · ');
            setRequeueStatus(message);
            toastQueueOutcome({ ok: true, text: message });
          });
      },
      faceDetail: (id: string) => {
        const entry = entriesRef.current.find(item => item.id === id);
        if (!entry) {
          return;
        }
        setRequeueStatus('Queueing face detail…');
        void loadGalleryRequeue()
          .then(({ requeueFaceDetailFromGalleryEntry }) =>
            requeueFaceDetailFromGalleryEntry(entry, {
              onStatus: setRequeueStatus,
            })
          )
          .then(result => {
            if (!result.ok) {
              setRequeueStatus(result.error ?? 'Face detail failed.');
              toastQueueOutcome({ ok: false, text: result.error ?? 'Face detail failed.' });
              return;
            }
            if (result.held) {
              const message = 'Face detail held until ComfyUI queue is idle';
              setRequeueStatus(message);
              toastHeldMax({ text: message });
              return;
            }
            const message = [
              'face detail queued',
              result.promptId ? `prompt_id ${result.promptId}` : null,
              result.comfyUrl,
            ]
              .filter(Boolean)
              .join(' · ');
            setRequeueStatus(message);
            toastQueueOutcome({ ok: true, text: message });
          });
      },
      anatomyRepair: (id: string) => {
        const entry = entriesRef.current.find(item => item.id === id);
        if (!entry) {
          return;
        }
        startAnatomyRepairFromGalleryEntry(entry);
      },
      moireClean: (id: string, qualityProfile: 'final' | 'max', options?: { force?: boolean }) => {
        const entry = entriesRef.current.find(item => item.id === id);
        if (!entry) {
          return;
        }
        setRequeueStatus(
          options?.force
            ? qualityProfile === 'max'
              ? 'Force moiré clean (Max)…'
              : 'Force moiré clean (Final)…'
            : qualityProfile === 'max'
              ? 'Queueing moiré clean (Max)…'
              : 'Queueing moiré clean (Final)…'
        );
        void loadGalleryRequeue()
          .then(({ requeueMoireCleanFromGalleryEntry }) =>
            requeueMoireCleanFromGalleryEntry(entry, {
              qualityProfile,
              force: options?.force,
              onStatus: setRequeueStatus,
            })
          )
          .then(result => {
            if (!result.ok) {
              setRequeueStatus(result.error ?? 'Moiré clean failed.');
              toastQueueOutcome({
                ok: false,
                text: result.error ?? 'Moiré clean failed.',
              });
              return;
            }
            if (result.held) {
              const message = 'Max moiré clean held until ComfyUI queue is idle';
              setRequeueStatus(message);
              toastHeldMax({ text: message });
              return;
            }
            const message = [
              options?.force ? 'force moiré clean queued' : 'moiré clean queued',
              result.vramDowngraded
                ? 'Max → Final (VRAM)'
                : qualityProfile === 'max'
                  ? 'Max · blur → bicubic → Lanczos'
                  : 'Final · soft blur only',
              result.promptId ? `prompt_id ${result.promptId}` : null,
              result.comfyUrl,
            ]
              .filter(Boolean)
              .join(' · ');
            setRequeueStatus(message);
            toastQueueOutcome({ ok: true, text: message });
          });
      },
      showParent: (id: string) => {
        const entry = entriesRef.current.find(item => item.id === id);
        if (!entry?.parentGalleryEntryId) {
          return;
        }
        setFilter(previous => ({
          ...previous,
          focusEntryId: entry.parentGalleryEntryId,
          derivativeOfEntryId: undefined,
          similarToEntryId: undefined,
        }));
        setRequeueStatus('Showing source output…');
      },
      showDerivatives: (id: string) => {
        setFilter(previous => ({
          ...previous,
          derivativeOfEntryId: id,
          focusEntryId: undefined,
          similarToEntryId: undefined,
        }));
        setRequeueStatus('Showing derived outputs…');
      },
      openImage: openLightboxForEntryId,
      prefetchImage: prefetchLightboxForEntryId,
      reviewRating: (id: string, rating: ComfyGalleryEntry['reviewRating']) => {
        const entry = entriesRef.current.find(item => item.id === id);
        if (entry && rating) {
          handleReviewRating(entry, rating);
        }
      },
      downloadError: setDownloadError,
      visionTagClick: (tag: string) => {
        setFilter(previous => ({ ...previous, query: tag, userTag: undefined }));
      },
      userTagClick: (tag: string) => {
        setFilter(previous => ({
          ...previous,
          userTag: previous.userTag === tag ? undefined : tag,
        }));
      },
      viewWorkflow: (id: string) => {
        const entry = entriesRef.current.find(item => item.id === id);
        if (entry) {
          setWorkflowEntry(entry);
        }
      },
      restoreExactGraph: (id: string) => {
        const entry = entriesRef.current.find(item => item.id === id);
        if (!entry?.promptId?.trim()) {
          setRequeueStatus('No Comfy prompt id — cannot restore graph.');
          return;
        }
        setRequeueStatus('Restoring exact graph from ComfyUI history…');
        void loadGalleryRequeue()
          .then(({ restoreExactGraphFromComfyHistory }) =>
            restoreExactGraphFromComfyHistory(entry, { onStatus: setRequeueStatus })
          )
          .then(result => {
            setRequeueStatus(result.message);
          })
          .catch(error => {
            setRequeueStatus(
              error instanceof Error ? error.message : 'Failed to restore exact graph.'
            );
          });
      },
      pick: (id: string) => {
        const target = pickFor;
        if (!target) {
          return;
        }
        const entry = entriesRef.current.find(item => item.id === id);
        if (!entry || entry.status !== 'completed') {
          setRequeueStatus('Pick a completed still image.');
          return;
        }
        if (galleryEntryPrimaryMediaKind(entry) !== 'image') {
          setRequeueStatus('Only still images can be picked in this mode.');
          return;
        }
        saveGalleryHandoff(buildGalleryHandoff(entry, target));
        router.push(galleryHandoffPath(target));
      },
    };
  }, [
    entriesRef,
    toggleSelected,
    removeEntry,
    toggleFavorite,
    setRequeueStatus,
    setDownloadError,
    openLightboxForEntryId,
    prefetchLightboxForEntryId,
    handleReviewRating,
    setFilter,
    setWorkflowEntry,
    pickFor,
    router,
  ]);

  const bulkExperimentHandlers = useMemo<GalleryBulkExperimentHandlers>(
    () => ({
      onAssignActiveProject: () => {
        const projectId = loadActiveProjectId();
        if (!projectId) {
          setRequeueStatus('Set an active project in Studio first.');
          return;
        }
        setProjectIds(selectedIds, projectId);
        setRequeueStatus(`Assigned ${selectedIds.length} entries to active project.`);
      },
      onAssignProject: projectId => {
        setProjectIds(selectedIds, projectId);
        setRequeueStatus(`Assigned ${selectedIds.length} entries.`);
      },
      onFavorite: favorite => setFavorites(selectedIds, favorite),
      onRate: rating => {
        setReviewRatings(selectedIds, rating);
        setRequeueStatus(`Rated ${selectedIds.length} selected ${rating}★.`);
      },
      onDelete: () => {
        const count = selectedIds.length;
        if (
          !window.confirm(
            `Remove ${count} selected ${count === 1 ? 'entry' : 'entries'} from the gallery?`
          )
        ) {
          return;
        }
        removeEntries(selectedIds);
        setSelectedIds([]);
        setRequeueStatus(`Removed ${count} ${count === 1 ? 'entry' : 'entries'}.`);
      },
      onExportSidecars: () => {
        downloadGallerySidecarBundle(selectedEntries);
        setRequeueStatus(`Exported ${selectedEntries.length} sidecar(s).`);
      },
      onDownloadImages: () => {
        setRequeueStatus('Downloading selected images…');
        void downloadGalleryImagesSequential(selectedEntries).then(count => {
          setRequeueStatus(`Downloaded ${count} image(s).`);
        });
      },
      onExportZip: () => {
        setRequeueStatus('Building ZIP export…');
        void import('@/lib/gallery-zip-export')
          .then(({ downloadGalleryZipBundle }) => downloadGalleryZipBundle(selectedEntries))
          .then(count => {
            setRequeueStatus(`ZIP export prepared for ${count} entries.`);
          });
      },
      onExportLoraDataset: () => {
        setLoraExportScope('selected');
        setLoraExportOpen(true);
      },
      onExportCompareJson: () => {
        void import('@/lib/gallery-compare-export').then(({ downloadCompareExport }) =>
          downloadCompareExport(selectedEntries.slice(0, 4), 'json')
        );
      },
      onExportCompareHtml: () => {
        void import('@/lib/gallery-compare-export').then(({ downloadCompareExport }) =>
          downloadCompareExport(selectedEntries.slice(0, 4), 'html')
        );
      },
      onFindSimilar: () => {
        const entry = selectedEntries[0];
        if (!entry) return;
        setFilter(previous => ({
          ...previous,
          similarToEntryId: entry.id,
          similarMode: 'prompt',
          query: undefined,
        }));
        setRequeueStatus(`Finding outputs similar to ${entry.model ?? 'selection'}…`);
      },
      onFindVisualSimilar: () => {
        const entry = selectedEntries[0];
        if (!entry) return;
        setFilter(previous => ({
          ...previous,
          similarToEntryId: entry.id,
          similarMode: 'visual',
          query: undefined,
        }));
        setRequeueStatus(`Finding stills that look like ${entry.model ?? 'selection'}…`);
      },
      onClearSimilar: () =>
        setFilter(previous => ({
          ...previous,
          similarToEntryId: undefined,
          similarMode: undefined,
        })),
      canClearSimilar: Boolean(filter.similarToEntryId),
      onApplyUserTag: (tag: string) => {
        if (!setUserTags || selectedIds.length === 0) {
          return;
        }
        setUserTags(selectedIds, [tag], 'add');
        setRequeueStatus(`Tagged ${selectedIds.length} with #${tag}`);
      },
      onSeedExperiment: () => {
        const entry = selectedEntries[0];
        if (!entry) return;
        setRequeueStatus('Queueing seed experiment…');
        void queueSeedExperiment({
          prompt: entry.prompt,
          model: entry.model ?? 'qwen-image-2512',
          negativePrompt: entry.negativePrompt,
          hints: entry.prompt.slice(0, 200),
          count: 4,
        }).then(({ queued, held, seeds }) => {
          if (held > 0) {
            toastHeldMax({
              text: 'Max seed experiment held until ComfyUI is idle',
              count: held,
            });
          }
          setRequeueStatus(
            [
              `Seed experiment queued ${queued}`,
              held > 0 ? `held ${held}` : null,
              `seeds ${seeds.join(', ')}`,
            ]
              .filter(Boolean)
              .join(' · ')
          );
        });
      },
      onParamExperiment: () => {
        const entry = selectedEntries[0];
        if (!entry) return;
        setRequeueStatus(`Queueing ${paramAxis} experiment…`);
        void queueParamExperiment({
          prompt: entry.prompt,
          model: entry.model ?? 'qwen-image-2512',
          negativePrompt: entry.negativePrompt,
          hints: entry.prompt.slice(0, 200),
          axis: paramAxis,
          baseParams: entry.queueParams,
          count: 4,
        }).then(({ queued, held, labels }) => {
          if (held > 0) {
            toastHeldMax({
              text: 'Max param experiment held until ComfyUI is idle',
              count: held,
            });
          }
          setRequeueStatus(
            [
              `Param experiment queued ${queued}`,
              held > 0 ? `held ${held}` : null,
              labels.join(', '),
            ]
              .filter(Boolean)
              .join(' · ')
          );
        });
      },
      onParamGrid: () => {
        const entry = selectedEntries[0];
        if (!entry) return;
        setRequeueStatus('Queueing CFG × steps grid…');
        void import('@/lib/param-experiment-grid')
          .then(({ queueParamExperimentGrid }) =>
            queueParamExperimentGrid({
              prompt: entry.prompt,
              model: entry.model ?? 'qwen-image-2512',
              negativePrompt: entry.negativePrompt,
              hints: entry.prompt.slice(0, 200),
              baseParams: entry.queueParams,
            })
          )
          .then(({ queued, held, cells }) => {
            if (held > 0) {
              toastHeldMax({
                text: 'Max param grid held until ComfyUI is idle',
                count: held,
              });
            }
            setRequeueStatus(
              [
                `Param grid queued ${queued}`,
                held > 0 ? `held ${held}` : null,
                `${cells.slice(0, 4).join('; ')}${cells.length > 4 ? '…' : ''}`,
              ]
                .filter(Boolean)
                .join(' · ')
            );
          });
      },
      onMutateWinner: () => {
        const entry = resolveExperimentWinnerEntry(selectedEntries) ?? selectedEntries[0];
        if (!entry) return;
        setRequeueStatus('Mutating crowned winner…');
        void queueMutatedGalleryJobs({
          entry,
          kinds: ['variation', 'location', 'wardrobe'],
          count: 3,
        }).then(({ queued, held, jobs }) => {
          if (held > 0) {
            toastHeldMax({
              text: 'Max mutations held until ComfyUI is idle',
              count: held,
            });
          }
          setRequeueStatus(formatMutatedJobsStatus(jobs, queued, held));
        });
      },
      onVariations: () => {
        const entry = selectedEntries[0];
        if (!entry) return;
        saveGalleryVariationsHandoff(buildGalleryVariationsHandoff(entry));
        router.push(galleryVariationsPath());
      },
      onTopics: () => {
        const entry = selectedEntries[0];
        if (!entry) return;
        saveGalleryTopicsHandoff(entry);
        router.push(galleryTopicsPath());
      },
      onNegativeAb: () => {
        const entry = selectedEntries[0];
        if (!entry) return;
        void queueNegativeAbTest({
          prompt: entry.prompt,
          model: entry.model ?? 'qwen-image-2512',
          negativeA: entry.negativePrompt,
          hints: entry.prompt.slice(0, 200),
        }).then(({ queued, held, seed }) => {
          if (held > 0) {
            toastHeldMax({
              text: 'Max negative A/B held until ComfyUI is idle',
              count: held,
            });
          }
          setRequeueStatus(
            [`Negative A/B queued ${queued}`, held > 0 ? `held ${held}` : null, `seed ${seed}`]
              .filter(Boolean)
              .join(' · ')
          );
        });
      },
      onExportCsv: () => {
        downloadTextFile(
          exportGalleryCsv(selectedEntries),
          'gallery-export.csv',
          'text/csv;charset=utf-8'
        );
      },
      onExportJsonl: () => {
        downloadTextFile(
          exportGalleryJsonl(selectedEntries),
          'gallery-export.jsonl',
          'application/jsonl;charset=utf-8'
        );
      },
      onBulkRequeue: () => {
        setRequeueStatus('Bulk variation queue started…');
        void loadGalleryRequeue()
          .then(({ requeueComfyJobs }) =>
            requeueComfyJobs(
              selectedEntries.map(entry => {
                const urls = resolveRequeueImageUrlsFromEntry(entry);
                return {
                  prompt: entry.prompt,
                  negativePrompt: entry.negativePrompt,
                  tool: entry.tool,
                  model: entry.model,
                  queueParams: entry.queueParams,
                  sourceImageUrl: urls.sourceImageUrl,
                  maskImageUrl: urls.maskImageUrl,
                  newSeed: true,
                  parentGalleryEntryId: entry.id,
                  derivedKind: 'variation' as const,
                };
              }),
              setRequeueStatus
            )
          )
          .then(({ queued, failed }) => {
            setSelectedIds([]);
            toastBulkQueueSummary({
              label: 'Bulk variation queue finished',
              queued,
              failed,
            });
          });
      },
      onBulkUpscaleFinal: () => {
        setRequeueStatus('Bulk upscale (Final) started…');
        void loadGalleryRequeue()
          .then(({ bulkUpscaleGalleryEntries }) =>
            bulkUpscaleGalleryEntries(selectedEntries, 'final', setRequeueStatus)
          )
          .then(({ queued, failed, skipped }) => {
            setSelectedIds([]);
            toastBulkQueueSummary({
              label: 'Bulk upscale (Final) finished',
              queued,
              failed,
              skipped,
            });
          });
      },
      onBulkUpscaleMax: () => {
        setRequeueStatus('Bulk upscale (Max) started…');
        void loadGalleryRequeue()
          .then(({ bulkUpscaleGalleryEntries }) =>
            bulkUpscaleGalleryEntries(selectedEntries, 'max', setRequeueStatus)
          )
          .then(({ queued, failed, skipped }) => {
            setSelectedIds([]);
            toastBulkQueueSummary({
              label: 'Bulk upscale (Max) finished',
              queued,
              failed,
              skipped,
            });
          });
      },
      onBulkRefine: () => {
        setRequeueStatus('Bulk refine (Final) started…');
        void loadGalleryRequeue()
          .then(({ bulkRefineGalleryEntries }) =>
            bulkRefineGalleryEntries(selectedEntries, 'final', setRequeueStatus)
          )
          .then(({ queued, failed, skipped }) => {
            setSelectedIds([]);
            toastBulkQueueSummary({
              label: 'Bulk refine finished',
              queued,
              failed,
              skipped,
            });
          });
      },
      onBulkMoireCleanFinal: () => {
        setRequeueStatus('Bulk moiré clean (Final) started…');
        void loadGalleryRequeue()
          .then(({ bulkMoireCleanGalleryEntries }) =>
            bulkMoireCleanGalleryEntries(selectedEntries, 'final', setRequeueStatus)
          )
          .then(({ queued, failed, skipped }) => {
            setSelectedIds([]);
            toastBulkQueueSummary({
              label: 'Bulk moiré clean (Final) finished',
              queued,
              failed,
              skipped,
            });
          });
      },
      onBulkMoireCleanMax: () => {
        setRequeueStatus('Bulk moiré clean (Max) started…');
        void loadGalleryRequeue()
          .then(({ bulkMoireCleanGalleryEntries }) =>
            bulkMoireCleanGalleryEntries(selectedEntries, 'max', setRequeueStatus)
          )
          .then(({ queued, failed, skipped }) => {
            setSelectedIds([]);
            toastBulkQueueSummary({
              label: 'Bulk moiré clean (Max) finished',
              queued,
              failed,
              skipped,
            });
          });
      },
    }),
    [
      filter.similarToEntryId,
      paramAxis,
      removeEntries,
      router,
      selectedEntries,
      selectedIds,
      setFavorites,
      setReviewRatings,
      setUserTags,
      setFilter,
      setLoraExportOpen,
      setLoraExportScope,
      setProjectIds,
      setRequeueStatus,
      setSelectedIds,
    ]
  );

  return { galleryCardActionsRef, bulkExperimentHandlers };
}
