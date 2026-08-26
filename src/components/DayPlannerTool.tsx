'use client';

import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import CharacterOsPicker from '@/components/CharacterOsPicker';
import FilmWatchPlayer from '@/components/FilmWatchPlayer';
import SharedToolControls from '@/components/SharedToolControls';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import ScenePromptResultPanel from '@/components/scene-tool/ScenePromptResultPanel';
import { Button, ButtonLink } from '@/components/ui/Button';
import {
  ChipButton,
  FieldDivider,
  FieldError,
  FieldLabel,
  SelectInput,
  TextArea,
} from '@/components/ui/Field';
import {
  ToolActionRow,
  ToolBadge,
  ToolLayout,
  ToolSection,
  accentFocusClass,
} from '@/components/ui/ToolPageShell';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import { useSeedToolDraft } from '@/hooks/useSeedToolDraft';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import { parseCharacterHints } from '@/lib/character-hints';
import {
  assembleAndStampFilm,
  downloadFilmBlob,
  stampAssembledFilm,
} from '@/lib/character-film-assemble';
import { filmDownloadFilename } from '@/lib/character-film';
import { applyCharacterRecord, getCharacter, upsertCharacter } from '@/lib/character-os';
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
  wardrobeCategoryFilterOptions,
} from '@/lib/wardrobe-catalog-ui';
import {
  applyLookPackToDaySlots,
  loadLookPack,
  lookPackNotes,
  lookPackRoleplayHref,
  saveLookPack,
} from '@/lib/look-pack';
import { getReformatTargetModel } from '@/lib/reformat-target';
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import { buildRoleplayQueueStillOptions } from '@/lib/roleplay-play-core';
import { isGalleryClipEntry } from '@/lib/roleplay-film';
import { ROLEPLAY_SETTING_PRESETS } from '@/lib/roleplay';
import { resolvePreferredVideoModel } from '@/lib/queue-tool-model';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import {
  DEFAULT_DAY_TOOL_CACHE,
  DEFAULT_VIDEO_TOOL_CACHE,
  loadSettingsCache,
  loadToolSettings,
  saveSharedSettings,
} from '@/lib/settings-cache';

const ACCENT = 'teal' as const;
const TOOL_ID = 'day' as const;

type ClothingOption = { value: string; label: string; group?: string };

export default function DayPlannerTool() {
  const router = useRouter();
  const description = useToolPageDescription(
    'Plan morning through night, queue stills, then Cut a day-in-the-life reel.',
    'Character day — four slots → stills → Cut film.'
  );
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
      const pack = loadLookPack({ clear: true });
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
    async (slot: DaySlot) => {
      setBusy(true);
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
        setBusy(false);
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
    for (const slot of slots) {
      await queueSlot(slot);
    }
  }, [queueSlot, slots]);

  const animateSlot = useCallback(
    async (slot: DaySlot) => {
      const still = stillsRef.current.find(entry => entry.slotId === slot.id);
      const imageUrl = still?.status === 'completed' ? still.imageUrl?.trim() : '';
      if (!imageUrl) {
        setError(`Queue and wait for the ${slot.label.toLowerCase()} still before animating.`);
        return;
      }
      setBusy(true);
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
        setBusy(false);
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
    for (const slot of slots) {
      const still = stillsRef.current.find(entry => entry.slotId === slot.id);
      if (still?.status !== 'completed' || still.clipStatus === 'completed') {
        continue;
      }
      await animateSlot(slot);
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

  if (!mounted) {
    return null;
  }

  const completedShotCount = watchPlaylist.length;
  const fittingWardrobe = (activeSlot.wardrobeId || shared.lockedWardrobeId || '').trim();

  return (
    <ToolLayout
      accent={ACCENT}
      badge={
        <ToolBadge accent={ACCENT}>Day Planner · {selectedModel?.comfyNode ?? 'model'}</ToolBadge>
      }
      title="Day Planner"
      description={description}
      sidebar={
        <SharedToolControls
          shared={shared}
          onModelChange={model => updateShared({ model })}
          onDetailChange={detail => updateShared({ detail })}
          onWorkflowPresetChange={id => updateShared({ selectedWorkflowFileId: id })}
          showWardrobeOption={false}
          seedLlmWithIngredients={false}
          autoFixRules={shared.autoFixRules !== false}
          onAutoFixRulesChange={value => updateShared({ autoFixRules: value })}
          recommendFromText={output}
          toolId={TOOL_ID}
          onSharedSettingsChange={updateShared}
          variant="roleplay"
        />
      }
    >
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.day} />

      <ToolSection
        title="Character"
        description="Same Character OS id as Cast, Fitting, and Roleplay."
      >
        <CharacterOsPicker
          shared={shared}
          hints={character?.hints}
          onApply={patch => {
            try {
              updateShared(patch);
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Could not apply that character.');
            }
          }}
        />
        {hasPlate ? (
          <p className="type-caption mt-2 text-[var(--text-muted)]">
            Cast plate detected — queues use identity lock when available.
          </p>
        ) : (
          <p className="type-caption mt-2 text-[var(--text-muted)]">
            No Cast plate yet — stills queue as text scenes. Add a look in Cast or open Fitting
            Room.
          </p>
        )}
      </ToolSection>

      <ToolSection
        title="Day slots"
        description="Morning → night. Pick kit, setting, and beat per slot."
      >
        <div className="flex flex-wrap gap-2">
          {slots.map(slot => {
            const still = stills.find(entry => entry.slotId === slot.id);
            const stillStatus =
              still?.status === 'completed'
                ? ' · still'
                : still?.status === 'queued' || still?.status === 'running'
                  ? ' · queued'
                  : still?.status === 'error'
                    ? ' · failed'
                    : '';
            const clipStatus =
              still?.clipStatus === 'completed'
                ? ' · clip'
                : still?.clipStatus === 'queued' || still?.clipStatus === 'running'
                  ? ' · animating'
                  : '';
            const status = `${stillStatus}${clipStatus}`;
            return (
              <ChipButton
                key={slot.id}
                active={activeSlotId === slot.id}
                disabled={busy}
                onClick={() => setActiveSlotId(slot.id)}
              >
                {slot.label}
                {status}
              </ChipButton>
            );
          })}
        </div>
        <FieldDivider />
        <label className="space-y-2">
          <FieldLabel>Clothing type</FieldLabel>
          <SelectInput
            value={wardrobeCategoryFilter}
            disabled={!wardrobeReady || busy}
            className={accentFocusClass(ACCENT)}
            onChange={event =>
              updateToolSettings({
                wardrobeCategoryFilter: normalizeWardrobeCategoryFilter(event.target.value),
              })
            }
          >
            {wardrobeCategoryFilterOptions().map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
                {option.value !== 'all' && wardrobeReady
                  ? ` (${countWardrobeOptionsForFilter(wardrobeOptions, option.value)})`
                  : option.value === 'all' && wardrobeReady
                    ? ` (${countWardrobeOptionsForFilter(wardrobeOptions, 'all')})`
                    : ''}
              </option>
            ))}
          </SelectInput>
          {wardrobeReady && wardrobeCategoryFilter !== 'all' ? (
            <p className="type-caption text-[var(--text-muted)]">
              Showing {wardrobeKitCount} kit{wardrobeKitCount === 1 ? '' : 's'} for{' '}
              {activeSlot.label.toLowerCase()}.
            </p>
          ) : null}
        </label>
        <label className="mt-3 space-y-2">
          <FieldLabel>Outfit kit</FieldLabel>
          <SelectInput
            value={activeSlot.wardrobeId ?? ''}
            disabled={!wardrobeReady || busy}
            className={accentFocusClass(ACCENT)}
            onChange={event => {
              const value = event.target.value.trim();
              updateSlot(activeSlot.id, { wardrobeId: value || undefined });
            }}
          >
            {filteredWardrobeOptions.map(option => (
              <option key={option.value || 'default'} value={option.value}>
                {option.group ? `${option.label} · ${option.group}` : option.label}
              </option>
            ))}
          </SelectInput>
        </label>
        <label className="mt-3 space-y-2">
          <FieldLabel>Setting</FieldLabel>
          <SelectInput
            value=""
            disabled={busy}
            className={accentFocusClass(ACCENT)}
            onChange={event => {
              const preset = ROLEPLAY_SETTING_PRESETS.find(
                entry => entry.id === event.target.value
              );
              if (preset) {
                updateSlot(activeSlot.id, { location: preset.setting });
              }
            }}
          >
            <option value="">Insert preset…</option>
            {ROLEPLAY_SETTING_PRESETS.map(preset => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </SelectInput>
          <TextArea
            rows={2}
            value={activeSlot.location ?? ''}
            className={accentFocusClass(ACCENT)}
            placeholder="e.g. sunlit café terrace, rainy commute, rooftop at dusk"
            onChange={event => updateSlot(activeSlot.id, { location: event.target.value })}
          />
        </label>
        <label className="mt-3 space-y-2">
          <FieldLabel>Beat</FieldLabel>
          <TextArea
            rows={3}
            value={activeSlot.sceneHints ?? ''}
            className={accentFocusClass(ACCENT)}
            placeholder="What happens in this part of the day?"
            onChange={event => updateSlot(activeSlot.id, { sceneHints: event.target.value })}
          />
        </label>
        <ToolActionRow>
          <Button
            size="sm"
            variant="primary"
            disabled={busy}
            onClick={() => void queueSlot(activeSlot)}
          >
            {busy ? 'Queueing…' : `Queue ${activeSlot.label.toLowerCase()}`}
          </Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void queueAll()}>
            Queue all slots
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => void animateSlot(activeSlot)}
          >
            Animate slot
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => void animateAllClips()}
          >
            Animate all
          </Button>
        </ToolActionRow>
      </ToolSection>

      <ToolSection title="Day notes" description="Optional notes layered onto every slot prompt.">
        <TextArea
          rows={2}
          value={toolSettings.notes ?? ''}
          className={accentFocusClass(ACCENT)}
          placeholder="e.g. cozy autumn day, light rain in the evening"
          onChange={event => updateToolSettings({ notes: event.target.value })}
        />
      </ToolSection>

      <ToolSection
        title="Day reel"
        description="Completed clips play first; otherwise stills. Cut film uses the same playlist."
      >
        <FilmWatchPlayer
          shots={watchPlaylist}
          emptyLabel="Queue slot stills and wait for gallery completion to preview the day reel."
        />
        <ToolActionRow>
          <Button
            size="sm"
            variant="primary"
            disabled={busy || assemblingFilm || completedShotCount === 0}
            onClick={() => void cutDayFilm()}
          >
            {assemblingFilm ? 'Cutting…' : 'Cut film'}
          </Button>
          {filmNeedsCast ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || assemblingFilm}
              onClick={saveFilmToCast}
            >
              Save film to Cast
            </Button>
          ) : null}
          {character && completedShotCount > 0 ? (
            <ButtonLink
              href={`/gallery?character=${encodeURIComponent(character.id)}`}
              size="sm"
              variant="ghost"
            >
              Open in Gallery
            </ButtonLink>
          ) : null}
        </ToolActionRow>
        {filmStatus ? <p className="type-caption text-[var(--text-muted)]">{filmStatus}</p> : null}
      </ToolSection>

      <ToolActionRow>
        {character ? (
          <>
            <ButtonLink
              href={`/fitting?character=${encodeURIComponent(character.id)}${
                fittingWardrobe ? `&wardrobe=${encodeURIComponent(fittingWardrobe)}` : ''
              }`}
              size="sm"
              variant="secondary"
            >
              Try on in Fitting
            </ButtonLink>
            <ButtonLink
              href={`/moodboard?character=${encodeURIComponent(character.id)}`}
              size="sm"
              variant="secondary"
            >
              Set look (Moodboard)
            </ButtonLink>
          </>
        ) : null}
        <Button size="sm" variant="secondary" disabled={busy} onClick={goRoleplay}>
          Continue in Roleplay
        </Button>
      </ToolActionRow>
      {error ? <FieldError>{error}</FieldError> : null}

      <ScenePromptResultPanel
        output={output}
        onOutputChange={setOutput}
        result={null}
        copied={copied}
        onCopy={() => {
          if (!output) {
            return;
          }
          void navigator.clipboard.writeText(output).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
          });
        }}
        actions={actions}
        shared={shared}
        selectedComfyNode={selectedModel?.comfyNode ?? 'model'}
        hints={toolSettings.notes}
        queueLabel="Queue slot"
        onSendComfyUi={() => void queueSlot(activeSlot)}
      />
    </ToolLayout>
  );
}
