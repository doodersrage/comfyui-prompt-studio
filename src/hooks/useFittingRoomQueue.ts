'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { usePromptResultActions } from '@/hooks/usePromptResultActions';
import { activeLook, toggleLookKeeper, type CharacterRecord } from '@/lib/character-os';
import { getCachedClothingLabel } from '@/lib/clothing-catalog-client';
import {
  COMFYUI_GALLERY_UPDATED_EVENT,
  galleryEntryPrimaryThumbUrl,
  galleryEntryPrimaryViewUrl,
  loadComfyGallery,
} from '@/lib/comfyui-gallery';
import {
  buildFittingKitPreviewPrompt,
  buildFittingOutfitPrompt,
  pushFittingCompareTryOn,
  type FittingCompareTryOn,
  type FittingSwipeKit,
} from '@/lib/fitting-room';
import {
  countInFlightFittingKitPreviews,
  FITTING_KIT_PREVIEW_CONCURRENCY,
  FITTING_KIT_PREVIEW_HEIGHT,
  FITTING_KIT_PREVIEW_MAX,
  FITTING_KIT_PREVIEW_PROMPT_VERSION,
  FITTING_KIT_PREVIEW_WIDTH,
  fittingKitsNeedingPreview,
  getFittingKitPreview,
  mergeFittingKitPreviewsFromGallery,
  normalizeFittingKitPreviews,
  upsertFittingKitPreview,
  type FittingKitPreview,
} from '@/lib/fitting-kit-previews';
import {
  applyLookPackToDaySlots,
  lookPackDayHref,
  lookPackNotes,
  loadLookPack,
  saveLookPack,
} from '@/lib/look-pack';
import { bumpPlayCampaignStep } from '@/lib/play-campaign';
import { seedDaySlotsFromKeeperWardrobes } from '@/lib/day-planner';
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import { buildRoleplayQueueStillOptions } from '@/lib/roleplay-play-core';
import {
  DEFAULT_DAY_TOOL_CACHE,
  loadToolSettings,
  saveToolSettings,
  type FittingToolCache,
  type SharedToolSettings,
} from '@/lib/settings-cache';
import type { WorkflowParamValues } from '@/lib/comfyui-config';

const TOOL_ID = 'fitting' as const;

type PromptResultActions = ReturnType<typeof usePromptResultActions>;

export function useFittingRoomQueue(input: {
  mounted: boolean;
  actions: PromptResultActions;
  shared: SharedToolSettings;
  toolSettings: FittingToolCache;
  updateShared: (patch: Partial<SharedToolSettings>) => void;
  updateToolSettings: (patch: Partial<FittingToolCache>) => void;
  character: CharacterRecord | undefined;
  hasReference: boolean;
  isolateSubject: boolean;
  referenceImageFilename: string;
  referenceImageUrl: string;
  lockedWardrobeLabel: string | undefined;
  swipeDeck: FittingSwipeKit[];
  deckSelectionId: string | undefined;
  activeLookId: string;
  kitPreviews: Record<string, FittingKitPreview>;
  autoKitPreviews: boolean;
  inFlightPreviewCount: number;
  previewModel: string | null | undefined;
  previewQueueParams: WorkflowParamValues;
  previewQueueResolveOptions: Pick<
    import('@/lib/queue-params-settings').ResolveQueueParamsOptions,
    'resolutionSizeTier' | 'resolutionOrientation' | 'preserveInputAspect'
  >;
  swipeKit: (delta: number) => void;
  setOutput: (output: string) => void;
  setError: (error: string | null) => void;
  setCopied: (copied: boolean) => void;
  setSaveStatus: (status: string | null) => void;
  setContinueDayHref: (href: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [compareTryOns, setCompareTryOns] = useState<FittingCompareTryOn[]>([]);
  const [previewStatus, setPreviewStatus] = useState<string | null>(null);
  const pendingTryOnRef = useRef<{
    promptId: string;
    wardrobeId: string;
    wardrobeLabel?: string;
  } | null>(null);
  const previewQueueBusyRef = useRef(false);
  const kitPreviewsRef = useRef(normalizeFittingKitPreviews(input.toolSettings.kitPreviews));

  useEffect(() => {
    kitPreviewsRef.current = input.kitPreviews;
  }, [input.kitPreviews]);

  const buildPrompt = useCallback(() => {
    const outfitLabel =
      input.lockedWardrobeLabel?.trim() || input.shared.lockedWardrobeId?.trim() || '';
    if (!outfitLabel) {
      throw new Error('Pick a wardrobe kit first.');
    }
    if (!input.hasReference) {
      throw new Error('Add a plate — Cast look, upload, or Gallery still.');
    }
    return buildFittingOutfitPrompt({
      outfitLabel,
      characterName: input.character?.name,
      characterDescriptor: input.character?.descriptor || input.character?.hints,
      notes: input.toolSettings.notes,
      isolated: input.toolSettings.referenceIsolated === true,
    });
  }, [
    input.character?.descriptor,
    input.character?.hints,
    input.character?.name,
    input.hasReference,
    input.lockedWardrobeLabel,
    input.shared.lockedWardrobeId,
    input.toolSettings.notes,
    input.toolSettings.referenceIsolated,
  ]);

  const queueTryOn = useCallback(async (): Promise<boolean> => {
    setBusy(true);
    input.setError(null);
    input.setCopied(false);
    input.actions.resetStatuses();
    try {
      const prompt = buildPrompt();
      const finalized = await input.actions.finalizePrompt(
        prompt,
        input.character?.name || 'Fitting'
      );
      input.setOutput(finalized);
      rememberDraftFields({
        toolKey: TOOL_ID,
        label: 'Fitting Room',
        href: '/fitting',
        fields: [input.character?.name ?? '', input.shared.lockedWardrobeId ?? '', finalized],
      });
      const queueOptions = buildRoleplayQueueStillOptions({
        photoMode: true,
        isolateSubject: input.isolateSubject,
        referenceIsolated: input.toolSettings.referenceIsolated === true,
        filename: input.referenceImageFilename,
        imageUrl: input.referenceImageUrl,
        identityLockStrength: input.shared.ipAdapterStrength,
        identityKind: input.shared.identityKind,
      });
      const promptId = await input.actions.sendComfyUi(finalized, undefined, undefined, {
        ...(queueOptions ?? {}),
        characterId: input.shared.activeCharacterId,
        lookId: input.shared.activeLookId ?? input.character?.activeLookId,
      });
      if (typeof promptId === 'string' && promptId.trim()) {
        pendingTryOnRef.current = {
          promptId: promptId.trim(),
          wardrobeId: input.shared.lockedWardrobeId?.trim() || '',
          wardrobeLabel: input.lockedWardrobeLabel,
        };
      }
      return true;
    } catch (err) {
      input.setError(err instanceof Error ? err.message : 'Could not queue the try-on.');
      return false;
    } finally {
      setBusy(false);
    }
  }, [
    buildPrompt,
    input.actions,
    input.character,
    input.isolateSubject,
    input.lockedWardrobeLabel,
    input.referenceImageFilename,
    input.referenceImageUrl,
    input.setCopied,
    input.setError,
    input.setOutput,
    input.shared.activeCharacterId,
    input.shared.activeLookId,
    input.shared.identityKind,
    input.shared.ipAdapterStrength,
    input.shared.lockedWardrobeId,
    input.toolSettings.referenceIsolated,
  ]);

  useEffect(() => {
    const syncGallery = () => {
      const pending = pendingTryOnRef.current;
      if (pending?.promptId) {
        const entry = loadComfyGallery().find(item => item.promptId === pending.promptId);
        if (entry?.status === 'completed') {
          const imageUrl = galleryEntryPrimaryViewUrl(entry);
          if (imageUrl) {
            pendingTryOnRef.current = null;
            setCompareTryOns(current =>
              pushFittingCompareTryOn(current, {
                promptId: pending.promptId,
                wardrobeId: pending.wardrobeId,
                wardrobeLabel: pending.wardrobeLabel,
                imageUrl,
                galleryEntryId: entry.id,
              })
            );
          }
        }
      }

      const currentPreviews = kitPreviewsRef.current;
      const wanted = new Set(
        Object.values(currentPreviews)
          .map(entry => entry.promptId?.trim())
          .filter(Boolean) as string[]
      );
      if (wanted.size === 0) {
        return;
      }
      const gallery = loadComfyGallery()
        .filter(entry => wanted.has(entry.promptId))
        .map(entry => ({
          promptId: entry.promptId,
          status: entry.status,
          imageUrl: galleryEntryPrimaryThumbUrl(entry) || galleryEntryPrimaryViewUrl(entry),
        }));
      const merged = mergeFittingKitPreviewsFromGallery(currentPreviews, gallery);
      if (merged.changed) {
        input.updateToolSettings({ kitPreviews: merged.previews });
      }
    };
    window.addEventListener(COMFYUI_GALLERY_UPDATED_EVENT, syncGallery);
    syncGallery();
    return () => window.removeEventListener(COMFYUI_GALLERY_UPDATED_EVENT, syncGallery);
  }, [input.updateToolSettings]);

  const queueKitPreview = useCallback(
    async (wardrobeId: string, wardrobeLabel: string) => {
      const lookId = (input.shared.activeLookId ?? input.character?.activeLookId ?? '').trim();
      if (!lookId || !input.hasReference || !wardrobeId.trim()) {
        return false;
      }
      if (input.isolateSubject && input.toolSettings.referenceIsolated !== true) {
        return false;
      }
      const existing = getFittingKitPreview(kitPreviewsRef.current, wardrobeId, lookId);
      if (
        (existing?.status === 'completed' &&
          existing.imageUrl?.trim() &&
          (existing.promptVersion ?? 0) >= FITTING_KIT_PREVIEW_PROMPT_VERSION) ||
        existing?.status === 'queued' ||
        existing?.status === 'running'
      ) {
        return false;
      }

      try {
        if (!input.previewModel) {
          input.setError(
            'Install Boogu Edit Turbo or Qwen Edit Lightning 4 for fast kit previews. Queue try-on still uses your sidebar model.'
          );
          return false;
        }
        const prompt = buildFittingKitPreviewPrompt({
          outfitLabel: wardrobeLabel.trim() || wardrobeId,
        });
        const queueOptions = buildRoleplayQueueStillOptions({
          photoMode: true,
          isolateSubject: input.isolateSubject,
          referenceIsolated: input.toolSettings.referenceIsolated === true,
          filename: input.referenceImageFilename,
          imageUrl: input.referenceImageUrl,
          identityLockStrength: input.shared.ipAdapterStrength,
          identityKind: input.shared.identityKind,
        });
        const promptId = await input.actions.sendComfyUi(prompt, undefined, undefined, {
          ...(queueOptions ?? {}),
          identityLock: false,
          queueModel: input.previewModel,
          qualityProfile: 'draft',
          queueParamsBase: input.previewQueueParams,
          ...input.previewQueueResolveOptions,
          figurePixelSize: {
            width: FITTING_KIT_PREVIEW_WIDTH,
            height: FITTING_KIT_PREVIEW_HEIGHT,
          },
          draftPreviewLite: true,
          queueHints: '',
          characterId: input.shared.activeCharacterId,
          lookId,
        });
        const next = upsertFittingKitPreview(kitPreviewsRef.current, {
          wardrobeId,
          lookId,
          promptId: typeof promptId === 'string' ? promptId.trim() : undefined,
          status: promptId ? 'queued' : 'error',
          updatedAt: Date.now(),
          promptVersion: FITTING_KIT_PREVIEW_PROMPT_VERSION,
        });
        kitPreviewsRef.current = next;
        input.updateToolSettings({ kitPreviews: next });
        return Boolean(promptId);
      } catch {
        const next = upsertFittingKitPreview(kitPreviewsRef.current, {
          wardrobeId,
          lookId,
          status: 'error',
          updatedAt: Date.now(),
        });
        kitPreviewsRef.current = next;
        input.updateToolSettings({ kitPreviews: next });
        return false;
      }
    },
    [
      input.actions,
      input.character?.activeLookId,
      input.hasReference,
      input.isolateSubject,
      input.previewModel,
      input.previewQueueParams,
      input.previewQueueResolveOptions,
      input.referenceImageFilename,
      input.referenceImageUrl,
      input.setError,
      input.shared.activeCharacterId,
      input.shared.activeLookId,
      input.shared.identityKind,
      input.shared.ipAdapterStrength,
      input.toolSettings.referenceIsolated,
      input.updateToolSettings,
    ]
  );

  const fillKitPreviews = useCallback(async () => {
    const lookId = (input.shared.activeLookId ?? input.character?.activeLookId ?? '').trim();
    if (
      !lookId ||
      !input.hasReference ||
      !input.previewModel ||
      previewQueueBusyRef.current ||
      (input.isolateSubject && input.toolSettings.referenceIsolated !== true)
    ) {
      return;
    }
    const needed = fittingKitsNeedingPreview(
      input.swipeDeck,
      kitPreviewsRef.current,
      lookId,
      FITTING_KIT_PREVIEW_MAX,
      input.deckSelectionId
    );
    if (needed.length === 0) {
      return;
    }
    const slots =
      FITTING_KIT_PREVIEW_CONCURRENCY -
      countInFlightFittingKitPreviews(kitPreviewsRef.current, lookId);
    if (slots <= 0) {
      return;
    }

    previewQueueBusyRef.current = true;
    setPreviewStatus('Queueing draft kit previews…');
    try {
      const batch = needed.slice(0, slots);
      for (const wardrobeId of batch) {
        const kit = input.swipeDeck.find(entry => entry.id === wardrobeId);
        const label = kit?.label || getCachedClothingLabel(wardrobeId) || wardrobeId;
        await queueKitPreview(wardrobeId, label);
      }
      const remaining = fittingKitsNeedingPreview(
        input.swipeDeck,
        kitPreviewsRef.current,
        lookId,
        FITTING_KIT_PREVIEW_MAX,
        input.deckSelectionId
      ).length;
      setPreviewStatus(
        remaining > 0
          ? `Draft previews: ${FITTING_KIT_PREVIEW_MAX - remaining}/${FITTING_KIT_PREVIEW_MAX} queued near selection…`
          : 'Draft previews queued — thumbs fill as jobs finish.'
      );
    } finally {
      previewQueueBusyRef.current = false;
    }
  }, [
    input.character?.activeLookId,
    input.deckSelectionId,
    input.hasReference,
    input.isolateSubject,
    input.previewModel,
    input.shared.activeLookId,
    input.swipeDeck,
    input.toolSettings.referenceIsolated,
    queueKitPreview,
  ]);

  useEffect(() => {
    if (!input.mounted || !input.autoKitPreviews) {
      return;
    }
    const timer = window.setTimeout(() => {
      void fillKitPreviews();
    }, 600);
    return () => window.clearTimeout(timer);
  }, [
    fillKitPreviews,
    input.activeLookId,
    input.autoKitPreviews,
    input.hasReference,
    input.inFlightPreviewCount,
    input.mounted,
    input.swipeDeck,
  ]);

  const keepTryOn = useCallback(
    (tryOn: FittingCompareTryOn) => {
      const characterId = input.shared.activeCharacterId?.trim();
      const lookId = input.shared.activeLookId ?? input.character?.activeLookId;
      const entryId = tryOn.galleryEntryId?.trim();
      if (!characterId || !lookId || !entryId) {
        input.setError('Pick a Cast character with a look before keeping a try-on.');
        return;
      }
      const updated = toggleLookKeeper(characterId, lookId, entryId);
      const wardrobeId = tryOn.wardrobeId?.trim();
      if (wardrobeId) {
        input.updateShared({ lockedWardrobeId: wardrobeId });
      }
      const existing = loadLookPack();
      const nextPack = {
        version: 1 as const,
        source: (existing?.source === 'saved' ? 'saved' : 'moodboard') as 'moodboard' | 'saved',
        characterId,
        templateId: existing?.templateId,
        paletteNotes: existing?.paletteNotes,
        lightingNotes: existing?.lightingNotes,
        locationNotes: existing?.locationNotes,
        styleNotes: existing?.styleNotes,
        moodNotes: existing?.moodNotes,
        wardrobeId: wardrobeId || existing?.wardrobeId,
        instruction: existing?.instruction,
        vibePrompt: existing?.vibePrompt,
        tileSummaries: existing?.tileSummaries,
        savedAt: Date.now(),
      };
      saveLookPack(nextPack);
      const look = updated ? activeLook(updated) : undefined;
      const keeperIds = new Set(look?.keeperEntryIds ?? [entryId]);
      const keeperWardrobes = [
        ...new Set(
          compareTryOns
            .filter(entry => entry.galleryEntryId && keeperIds.has(entry.galleryEntryId))
            .map(entry => entry.wardrobeId?.trim())
            .filter((id): id is string => Boolean(id))
        ),
      ];
      if (wardrobeId && !keeperWardrobes.includes(wardrobeId)) {
        keeperWardrobes.push(wardrobeId);
      }
      const daySettings = loadToolSettings('day', DEFAULT_DAY_TOOL_CACHE);
      const seededSlots = applyLookPackToDaySlots(
        seedDaySlotsFromKeeperWardrobes(
          daySettings.slots,
          keeperWardrobes.length > 0 ? keeperWardrobes : [wardrobeId || nextPack.wardrobeId || '']
        ),
        nextPack
      );
      saveToolSettings('day', {
        ...daySettings,
        slots: seededSlots,
        notes:
          daySettings.notes?.trim() ||
          input.toolSettings.notes?.trim() ||
          lookPackNotes(nextPack) ||
          daySettings.notes,
      });
      const dayHref = lookPackDayHref({
        ...nextPack,
        characterId,
        wardrobeId: wardrobeId || nextPack.wardrobeId,
      });
      input.setContinueDayHref(dayHref);
      bumpPlayCampaignStep({ characterId, stepId: 'day', lookPackId: undefined });
      void import('@/lib/local-observability').then(({ noteKeepTryOnMetric }) => {
        noteKeepTryOnMetric();
      });
      const kitCount = keeperWardrobes.length || 1;
      input.setSaveStatus(
        kitCount > 1
          ? `Kept ${tryOn.wardrobeLabel || tryOn.wardrobeId || 'try-on'} · ${kitCount} keeper kits mapped to Day slots.`
          : `Kept ${tryOn.wardrobeLabel || tryOn.wardrobeId || 'try-on'} as a Cast keeper · Day slots seeded.`
      );
      input.setError(null);
    },
    [
      compareTryOns,
      input.character?.activeLookId,
      input.setContinueDayHref,
      input.setError,
      input.setSaveStatus,
      input.shared.activeCharacterId,
      input.shared.activeLookId,
      input.toolSettings.notes,
      input.updateShared,
    ]
  );

  const queueTryOnAndSwipe = useCallback(async () => {
    const ok = await queueTryOn();
    if (ok) {
      input.swipeKit(1);
    }
  }, [input.swipeKit, queueTryOn]);

  return {
    busy,
    compareTryOns,
    previewStatus,
    queueTryOn,
    queueKitPreview,
    fillKitPreviews,
    keepTryOn,
    queueTryOnAndSwipe,
  };
}
