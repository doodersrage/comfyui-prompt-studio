'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { useWorkspaceMode } from '@/hooks/useWorkspaceMode';
import { isLeanWorkspaceMode } from '@/lib/workspace-mode';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import { useSeedToolDraft } from '@/hooks/useSeedToolDraft';
import { parseCharacterHints } from '@/lib/character-hints';
import {
  assembleAndStampFilm,
  downloadFilmBlob,
  stampAssembledFilm,
} from '@/lib/character-film-assemble';
import { filmDownloadFilename } from '@/lib/character-film';
import { applyCharacterRecord, getCharacter, upsertCharacter } from '@/lib/character-os';
import {
  markOnboardingFirstFilmCut,
  markOnboardingFirstPlayCampaign,
} from '@/lib/onboarding-hooks';
import { subjectGenderToClothingGender } from '@/lib/clothing-gender';
import {
  fetchClothingLabels,
  fetchClothingSelectOptions,
  getCachedClothingLabel,
} from '@/lib/clothing-catalog-client';
import { getComfyModelDefinition } from '@/lib/comfy-models/client';
import {
  COMFYUI_GALLERY_UPDATED_EVENT,
  galleryEntryPrimaryViewUrl,
  loadComfyGallery,
} from '@/lib/comfyui-gallery';
import {
  buildDaySlotMotionSubject,
  buildDaySlotPrompt,
  dayWatchPlaylist,
  mergeDaySlotStills,
  normalizeDaySlotStills,
  normalizeDaySlots,
  seedDaySlotsWardrobe,
  upsertDaySlotStill,
  type DaySlot,
  type DaySlotId,
} from '@/lib/day-planner';
import { resolveFittingPlateFromCharacter } from '@/lib/fitting-room';
import {
  countWardrobeOptionsForFilter,
  filterWardrobeSelectOptions,
  normalizeWardrobeCategoryFilter,
} from '@/lib/wardrobe-catalog-ui';
import {
  applyLookPackToDaySlots,
  loadLookPack,
  lookPackNotes,
  lookPackRoleplayHref,
  saveLookPack,
} from '@/lib/look-pack';
import { bumpPlayCampaignStep, completePlayCampaign } from '@/lib/play-campaign';
import { getReformatTargetModel } from '@/lib/reformat-target';
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import { buildRoleplayQueueStillOptions } from '@/lib/roleplay-play-core';
import { isGalleryClipEntry } from '@/lib/roleplay-film';
import { resolvePreferredVideoModel } from '@/lib/queue-tool-model';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import {
  DEFAULT_DAY_TOOL_CACHE,
  DEFAULT_VIDEO_TOOL_CACHE,
  loadSettingsCache,
  loadToolSettings,
  saveSharedSettings,
} from '@/lib/settings-cache';

const TOOL_ID = 'day' as const;
type ClothingOption = { value: string; label: string; group?: string };

export function useDayPlannerToolOrchestration() {
  const router = useRouter();
  const workspaceMode = useWorkspaceMode();
  const leanChrome = isLeanWorkspaceMode(workspaceMode);
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } = useCachedSettings(
    'day',
    DEFAULT_DAY_TOOL_CACHE
  );

  const [output, setOutput] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeSlotId, setActiveSlotId] = useState<DaySlotId>('morning');
  const [wardrobeLabels, setWardrobeLabels] = useState<Record<string, string>>({});
  const [assemblingFilm, setAssemblingFilm] = useState(false);
  const [filmStatus, setFilmStatus] = useState<string | null>(null);
  const [filmNeedsCast, setFilmNeedsCast] = useState(false);
  const assembledFilmRef = useRef<{ filename: string; data: Uint8Array } | null>(null);
  const deepLinkHandled = useRef(false);
  const stillsRef = useRef(normalizeDaySlotStills(toolSettings.stills));

  const slots = useMemo(() => normalizeDaySlots(toolSettings.slots), [toolSettings.slots]);
  const stills = useMemo(() => normalizeDaySlotStills(toolSettings.stills), [toolSettings.stills]);
  stillsRef.current = stills;
  const watchPlaylist = useMemo(() => dayWatchPlaylist(stills, slots), [slots, stills]);
  const activeSlot = slots.find(slot => slot.id === activeSlotId) ?? slots[0]!;
  const character = getCharacter(shared.activeCharacterId);
  const selectedModel = getComfyModelDefinition(shared.model);
  const plate = useMemo(() => resolveFittingPlateFromCharacter(character), [character]);
  const hasPlate = Boolean(plate?.filename || plate?.imageUrl);

  const clothingGender = useMemo(
    () =>
      subjectGenderToClothingGender(
        parseCharacterHints(character?.hints || character?.descriptor).gender
      ),
    [character?.descriptor, character?.hints]
  );

  const [wardrobeOptions, setWardrobeOptions] = useState<ClothingOption[]>([
    { value: '', label: 'Default kit…' },
  ]);
  const [wardrobeLoadedKey, setWardrobeLoadedKey] = useState<string | null>(null);
  const wardrobeOptionsKey = `wardrobeCatalog:${clothingGender}`;
  const wardrobeReady = wardrobeLoadedKey === wardrobeOptionsKey;
  const wardrobeCategoryFilter = normalizeWardrobeCategoryFilter(
    toolSettings.wardrobeCategoryFilter
  );
  const filteredWardrobeOptions = useMemo(
    () =>
      filterWardrobeSelectOptions(
        wardrobeOptions,
        wardrobeCategoryFilter,
        activeSlot.wardrobeId || shared.lockedWardrobeId
      ),
    [activeSlot.wardrobeId, shared.lockedWardrobeId, wardrobeCategoryFilter, wardrobeOptions]
  );
  const wardrobeKitCount = useMemo(
    () => countWardrobeOptionsForFilter(wardrobeOptions, wardrobeCategoryFilter),
    [wardrobeCategoryFilter, wardrobeOptions]
  );

  useSeedToolDraft(mounted, {
    toolKey: TOOL_ID,
    label: 'Day Planner',
    href: '/day',
    fields: [character?.name, activeSlot.sceneHints, toolSettings.notes],
  });

  const actions = usePromptResultActions({
    tool: TOOL_ID,
    model: shared.model,
    detail: shared.detail,
    hints: toolSettings.notes,
    autoFixRules: shared.autoFixRules !== false,
    reformatTarget: getReformatTargetModel(shared.model),
  });

  const updateSlot = useCallback(
    (slotId: DaySlotId, patch: Partial<DaySlot>) => {
      updateToolSettings({
        slots: slots.map(slot => (slot.id === slotId ? { ...slot, ...patch } : slot)),
      });
    },
    [slots, updateToolSettings]
  );

  useEffect(() => {
    if (!mounted || typeof window === 'undefined' || deepLinkHandled.current) {
      return;
    }
    deepLinkHandled.current = true;
    const params = new URLSearchParams(window.location.search);
    const characterId = params.get('character')?.trim();
    const wardrobeId = params.get('wardrobe')?.trim();
    const fromLook = params.get('from')?.trim() === 'look';

    if (characterId) {
      const record = getCharacter(characterId);
      if (record) {
        try {
          updateShared(applyCharacterRecord(record));
        } catch (err) {
          scheduleAfterCommit(() =>
            setError(err instanceof Error ? err.message : 'Could not apply that character.')
          );
        }
      }
    }
    if (wardrobeId) {
      updateShared({ lockedWardrobeId: wardrobeId });
      updateToolSettings({
        slots: seedDaySlotsWardrobe(toolSettings.slots, wardrobeId),
      });
    }
    if (fromLook) {
      // Keep the session pack for Roleplay handoff; Roleplay clears on apply.
      const pack = loadLookPack();
      if (pack) {
        if (pack.wardrobeId?.trim() && !wardrobeId) {
          updateShared({ lockedWardrobeId: pack.wardrobeId.trim() });
        }
        const nextSlots = applyLookPackToDaySlots(
          seedDaySlotsWardrobe(toolSettings.slots, pack.wardrobeId || wardrobeId),
          pack
        );
        const notes = lookPackNotes(pack);
        updateToolSettings({
          slots: nextSlots,
          notes: notes || toolSettings.notes,
        });
        scheduleAfterCommit(() => setFilmStatus('Applied Moodboard look pack to day slots.'));
      }
    }
  }, [mounted, toolSettings.notes, toolSettings.slots, updateShared, updateToolSettings]);

  useEffect(() => {
    let cancelled = false;
    void fetchClothingSelectOptions('wardrobeCatalog', clothingGender).then(next => {
      if (cancelled) {
        return;
      }
      setWardrobeOptions(next);
      setWardrobeLoadedKey(wardrobeOptionsKey);
    });
    return () => {
      cancelled = true;
    };
  }, [clothingGender, wardrobeOptionsKey]);

  useEffect(() => {
    const ids = [
      ...new Set(slots.map(slot => slot.wardrobeId?.trim()).filter(Boolean) as string[]),
    ];
    if (ids.length === 0) {
      return;
    }
    let cancelled = false;
    void fetchClothingLabels(ids).then(labels => {
      if (cancelled) {
        return;
      }
      setWardrobeLabels(previous => {
        const next = { ...previous };
        for (const [id, label] of labels) {
          if (label) {
            next[id] = label;
          }
        }
        return next;
      });
    });
    for (const id of ids) {
      const cached = getCachedClothingLabel(id);
      if (cached) {
        setWardrobeLabels(previous =>
          previous[id] === cached ? previous : { ...previous, [id]: cached }
        );
      }
    }
    return () => {
      cancelled = true;
    };
  }, [slots]);

  useEffect(() => {
    const sync = () => {
      const current = stillsRef.current;
      const wanted = new Set(
        current.map(still => still.promptId?.trim()).filter(Boolean) as string[]
      );
      const clipWanted = new Set(
        current.map(still => still.clipPromptId?.trim()).filter(Boolean) as string[]
      );
      if (wanted.size === 0 && clipWanted.size === 0) {
        return;
      }
      const gallery = loadComfyGallery()
        .filter(entry => wanted.has(entry.promptId) || clipWanted.has(entry.promptId))
        .map(entry => ({
          promptId: entry.promptId,
          status: entry.status,
          imageUrl: galleryEntryPrimaryViewUrl(entry),
          isClip: isGalleryClipEntry(entry) || clipWanted.has(entry.promptId),
        }));
      const merged = mergeDaySlotStills(current, gallery);
      if (merged.changed) {
        updateToolSettings({ stills: merged.stills });
      }
    };
    window.addEventListener(COMFYUI_GALLERY_UPDATED_EVENT, sync);
    sync();
    return () => window.removeEventListener(COMFYUI_GALLERY_UPDATED_EVENT, sync);
  }, [updateToolSettings]);

  const wardrobeLabelFor = useCallback(
    (wardrobeId?: string) => {
      const id = wardrobeId?.trim();
      if (!id) {
        return '';
      }
      return wardrobeLabels[id] ?? id;
    },
    [wardrobeLabels]
  );

  const buildSlotPrompt = useCallback(
    (slot: DaySlot) =>
      buildDaySlotPrompt({
        slot,
        wardrobeLabel: wardrobeLabelFor(slot.wardrobeId),
        characterName: character?.name,
        characterDescriptor: character?.descriptor || character?.hints,
        lockedLocation: shared.lockedLocation,
        notes: toolSettings.notes,
      }),
    [
      character?.descriptor,
      character?.hints,
      character?.name,
      shared.lockedLocation,
      toolSettings.notes,
      wardrobeLabelFor,
    ]
  );

  const queueSlot = useCallback(
    async (slot: DaySlot, options?: { manageBusy?: boolean }) => {
      const manageBusy = options?.manageBusy !== false;
      if (manageBusy) {
        setBusy(true);
      }
      setError(null);
      setCopied(false);
      setActiveSlotId(slot.id);
      actions.resetStatuses();
      try {
        const prompt = buildSlotPrompt(slot);
        const finalized = await actions.finalizePrompt(prompt, character?.name || slot.label);
        setOutput(finalized);
        rememberDraftFields({
          toolKey: TOOL_ID,
          label: 'Day Planner',
          href: '/day',
          fields: [character?.name ?? '', slot.label, finalized],
        });
        const queueOptions = hasPlate
          ? buildRoleplayQueueStillOptions({
              photoMode: true,
              isolateSubject: false,
              referenceIsolated: true,
              filename: plate?.filename,
              imageUrl: plate?.imageUrl,
              identityLockStrength: shared.ipAdapterStrength,
              identityKind: shared.identityKind,
            })
          : undefined;
        const promptId = await actions.sendComfyUi(finalized, undefined, undefined, {
          ...(queueOptions ?? {}),
          characterId: shared.activeCharacterId,
          lookId: shared.activeLookId ?? character?.activeLookId,
        });
        updateToolSettings({
          stills: upsertDaySlotStill(stillsRef.current, {
            slotId: slot.id,
            promptId: typeof promptId === 'string' ? promptId : undefined,
            status: promptId ? 'queued' : 'error',
            imageUrl: undefined,
          }),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not queue that slot.');
        updateToolSettings({
          stills: upsertDaySlotStill(stillsRef.current, {
            slotId: slot.id,
            status: 'error',
          }),
        });
      } finally {
        if (manageBusy) {
          setBusy(false);
        }
      }
    },
    [
      actions,
      buildSlotPrompt,
      character,
      hasPlate,
      plate,
      shared.activeCharacterId,
      shared.activeLookId,
      shared.identityKind,
      shared.ipAdapterStrength,
      updateToolSettings,
    ]
  );

  const queueAll = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      for (const slot of slots) {
        await queueSlot(slot, { manageBusy: false });
      }
    } finally {
      setBusy(false);
    }
  }, [queueSlot, slots]);

  const animateSlot = useCallback(
    async (slot: DaySlot, options?: { manageBusy?: boolean }) => {
      const manageBusy = options?.manageBusy !== false;
      const still = stillsRef.current.find(entry => entry.slotId === slot.id);
      const imageUrl = still?.status === 'completed' ? still.imageUrl?.trim() : '';
      if (!imageUrl) {
        setError(`Queue and wait for the ${slot.label.toLowerCase()} still before animating.`);
        return;
      }
      if (manageBusy) {
        setBusy(true);
      }
      setError(null);
      setActiveSlotId(slot.id);
      actions.resetStatuses();
      try {
        const parentEntry = still?.promptId
          ? loadComfyGallery().find(entry => entry.promptId === still.promptId)
          : undefined;
        const videoModel = resolvePreferredVideoModel({
          toolModel: loadToolSettings('video', DEFAULT_VIDEO_TOOL_CACHE).model,
          sharedModel: shared.model,
        });
        const subject = buildDaySlotMotionSubject(slot, character?.name);
        let prompt = subject;
        try {
          const response = await fetch('/api/video-prompt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              subject: slot.label,
              motion: slot.sceneHints?.trim() || subject,
              model: videoModel,
              durationSec: 4,
            }),
          });
          const data = (await response.json()) as { prompt?: string };
          if (data.prompt?.trim()) {
            prompt = data.prompt.trim();
          }
        } catch {
          /* use subject */
        }
        const promptId = await actions.sendComfyUi(prompt, undefined, undefined, {
          queueTool: 'video',
          queueModel: videoModel,
          inputImageUrl: imageUrl,
          parentGalleryEntryId: parentEntry?.id,
          derivedKind: 'i2v',
          clipMode: 'i2v',
          qualityProfile: 'final',
          queueParamsBase: { videoFrames: 64, videoFps: 16 },
          characterId: shared.activeCharacterId,
          lookId: shared.activeLookId ?? character?.activeLookId,
        });
        updateToolSettings({
          stills: upsertDaySlotStill(stillsRef.current, {
            slotId: slot.id,
            clipPromptId: typeof promptId === 'string' ? promptId : undefined,
            clipStatus: promptId ? 'queued' : 'error',
            clipUrl: undefined,
          }),
        });
        if (promptId) {
          setFilmStatus(
            `Queued ${slot.label.toLowerCase()} clip — motion reel prefers clips when ready.`
          );
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not queue that clip.');
        updateToolSettings({
          stills: upsertDaySlotStill(stillsRef.current, {
            slotId: slot.id,
            clipStatus: 'error',
          }),
        });
      } finally {
        if (manageBusy) {
          setBusy(false);
        }
      }
    },
    [
      actions,
      character,
      shared.activeCharacterId,
      shared.activeLookId,
      shared.model,
      updateToolSettings,
    ]
  );

  const animateAllClips = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      for (const slot of slots) {
        const still = stillsRef.current.find(entry => entry.slotId === slot.id);
        if (still?.status !== 'completed' || still.clipStatus === 'completed') {
          continue;
        }
        await animateSlot(slot, { manageBusy: false });
      }
    } finally {
      setBusy(false);
    }
  }, [animateSlot, slots]);

  const cutDayFilm = useCallback(async () => {
    const shots = dayWatchPlaylist(stillsRef.current, slots);
    if (shots.length === 0) {
      setError('Queue and wait for at least one completed slot still before cutting a film.');
      return;
    }
    const name = character?.name?.trim() || 'day';
    setAssemblingFilm(true);
    setError(null);
    setFilmNeedsCast(false);
    setFilmStatus('Checking shots…');
    try {
      const result = await assembleAndStampFilm({
        shots,
        characterId: character?.id ?? '',
        characterName: name,
        lookId: character?.activeLookId ?? shared.activeLookId,
        onProgress: progress => setFilmStatus(progress.label),
      });
      downloadFilmBlob(result.blob, result.filename);
      assembledFilmRef.current = {
        filename: result.filename,
        data: new Uint8Array(await result.blob.arrayBuffer()),
      };
      if (character && result.persisted) {
        setFilmNeedsCast(false);
        setFilmStatus(`Saved ${result.filename} to ${character.name} and started the download.`);
      } else {
        setFilmNeedsCast(true);
        setFilmStatus(
          character
            ? `Downloaded ${result.filename}. Save to Cast to stamp a studio copy.`
            : `Downloaded ${result.filename} unstamped. Save to Cast to attach this film.`
        );
      }
      markOnboardingFirstPlayCampaign();
      markOnboardingFirstFilmCut();
      void import('@/lib/local-observability').then(
        ({ noteFilmCutSourceMetric, noteSaveToCastMetric }) => {
          noteFilmCutSourceMetric('day');
          if (character && result.persisted) {
            noteSaveToCastMetric();
          }
        }
      );
      if (character) {
        completePlayCampaign({ characterId: character.id });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not assemble the film.');
      setFilmStatus(null);
    } finally {
      setAssemblingFilm(false);
    }
  }, [character, shared.activeLookId, slots]);

  const saveFilmToCast = useCallback(() => {
    if (!character) {
      setError('Pick a Cast character before saving the day film.');
      return;
    }
    const film = assembledFilmRef.current;
    upsertCharacter({
      ...character,
      name: character.name,
    });
    const next = getCharacter(character.id) ?? character;
    saveSharedSettings({
      ...loadSettingsCache().shared,
      ...applyCharacterRecord(next),
    });
    void import('@/lib/local-observability').then(({ noteSaveToCastMetric }) => {
      noteSaveToCastMetric();
    });
    if (!film) {
      setFilmNeedsCast(false);
      setFilmStatus(`Saved ${next.name} to Cast.`);
      return;
    }
    void (async () => {
      const stamped = await stampAssembledFilm({
        blob: new Blob([film.data.slice()]),
        filename: film.filename || filmDownloadFilename(next.name),
        characterId: next.id,
        characterName: next.name,
        lookId: next.activeLookId,
      });
      setFilmNeedsCast(false);
      setFilmStatus(
        stamped.persisted
          ? `Saved ${next.name} to Cast and stamped ${film.filename}.`
          : `Saved ${next.name} to Cast. Studio storage could not keep the film.`
      );
    })();
  }, [character]);

  const goRoleplay = useCallback(() => {
    if (character) {
      saveSharedSettings({
        ...loadSettingsCache().shared,
        ...applyCharacterRecord(character),
      });
      bumpPlayCampaignStep({ characterId: character.id, stepId: 'roleplay' });
      const pack = loadLookPack();
      if (pack) {
        const staged = { ...pack, characterId: character.id };
        saveLookPack(staged);
        router.push(lookPackRoleplayHref(staged));
        return;
      }
      router.push(`/roleplay?character=${encodeURIComponent(character.id)}`);
      return;
    }
    router.push('/roleplay');
  }, [character, router]);

  const completedShotCount = watchPlaylist.length;
  const fittingWardrobe = (activeSlot.wardrobeId || shared.lockedWardrobeId || '').trim();

  return {
    mounted,
    shared,
    toolSettings,
    updateShared,
    updateToolSettings,
    output,
    setOutput,
    copied,
    setCopied,
    error,
    setError,
    busy,
    activeSlotId,
    setActiveSlotId,
    wardrobeLabels,
    assemblingFilm,
    filmStatus,
    filmNeedsCast,
    slots,
    stills,
    watchPlaylist,
    activeSlot,
    character,
    selectedModel,
    plate,
    hasPlate,
    wardrobeOptions,
    wardrobeReady,
    wardrobeCategoryFilter,
    filteredWardrobeOptions,
    wardrobeKitCount,
    actions,
    updateSlot,
    wardrobeLabelFor,
    queueSlot,
    queueAll,
    animateSlot,
    animateAllClips,
    cutDayFilm,
    saveFilmToCast,
    goRoleplay,
    completedShotCount,
    fittingWardrobe,
    leanChrome,
  };
}
