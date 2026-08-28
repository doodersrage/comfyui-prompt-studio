'use client';

import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import FittingCharacterSection from '@/components/fitting/FittingCharacterSection';
import FittingCompareSection from '@/components/fitting/FittingCompareSection';
import FittingActionRow from '@/components/fitting/FittingActionRow';
import FittingPlateSection from '@/components/fitting/FittingPlateSection';
import FittingWardrobeKitSection from '@/components/fitting/FittingWardrobeKitSection';
import SharedToolControls from '@/components/SharedToolControls';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import ScenePromptResultPanel from '@/components/scene-tool/ScenePromptResultPanel';
import { FieldError } from '@/components/ui/Field';
import { ToolBadge, ToolLayout } from '@/components/ui/ToolPageShell';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { useFittingRoomQueue } from '@/hooks/useFittingRoomQueue';
import { useWorkspaceMode } from '@/hooks/useWorkspaceMode';
import { isLeanWorkspaceMode } from '@/lib/workspace-mode';
import { useGalleryHandoff } from '@/hooks/useGalleryHandoff';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import { useSeedToolDraft } from '@/hooks/useSeedToolDraft';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import { parseCharacterHints } from '@/lib/character-hints';
import {
  activeLook,
  applyCharacterRecord,
  characterFromShared,
  getCharacter,
  upsertCharacter,
} from '@/lib/character-os';
import { subjectGenderToClothingGender } from '@/lib/clothing-gender';
import {
  fetchClothingLabels,
  fetchClothingSelectOptions,
  getCachedClothingLabel,
} from '@/lib/clothing-catalog-client';
import {
  buildFittingSwipeDeck,
  fittingSwipeIndex,
  fittingSwipeNeighbor,
  resolveFittingDeckWardrobeId,
  resolveFittingPlateFromCharacter,
} from '@/lib/fitting-room';
import {
  countInFlightFittingKitPreviews,
  fittingKitPreviewQueueParams,
  fittingKitPreviewQueueResolveOptions,
  getFittingKitPreview,
  normalizeFittingKitPreviews,
  resolveFittingKitPreviewModel,
} from '@/lib/fitting-kit-previews';
import {
  countWardrobeOptionsForFilter,
  filterWardrobeSelectOptions,
  normalizeWardrobeCategoryFilter,
} from '@/lib/wardrobe-catalog-ui';
import { getComfyModelDefinition } from '@/lib/comfy-models/client';
import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import {
  cacheBustIdentityMediaUrl,
  isIdentityMediaUrl,
  persistIdentityImage,
} from '@/lib/gallery-media-client';
import {
  collectIsolateSourceUrls,
  isolateSubjectOnWhite,
  ISOLATE_QUEUE_BLOCKED_MESSAGE,
  loadImageBlobFromUrls,
} from '@/lib/isolate-subject';
import {
  applyLookPackToFittingState,
  loadLookPack,
  lookPackDayHref,
  lookPackRoleplayHref,
  saveLookPack,
} from '@/lib/look-pack';
import { bumpPlayCampaignStep } from '@/lib/play-campaign';
import { resolveQueueInputImage } from '@/lib/queue-input-image';
import { getReformatTargetModel } from '@/lib/reformat-target';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import {
  DEFAULT_FITTING_TOOL_CACHE,
  loadSettingsCache,
  saveSharedSettings,
} from '@/lib/settings-cache';
import { EMPTY_WARDROBE_OPTIONS, type FittingClothingOption } from '@/lib/fitting-clothing-options';

const ACCENT = 'rose' as const;
const TOOL_ID = 'fitting' as const;

export function useFittingRoomToolOrchestration() {
  const router = useRouter();
  const workspaceMode = useWorkspaceMode();
  const leanChrome = isLeanWorkspaceMode(workspaceMode);
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } = useCachedSettings(
    'fitting',
    DEFAULT_FITTING_TOOL_CACHE
  );

  const [output, setOutput] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [referenceUploading, setReferenceUploading] = useState(false);
  const [isolateStatus, setIsolateStatus] = useState<string | null>(null);
  const [referencePreviewUrl, setReferencePreviewUrl] = useState<string | null>(null);
  const [lockedWardrobeLabel, setLockedWardrobeLabel] = useState<string | undefined>();
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [continueDayHref, setContinueDayHref] = useState<string | null>(null);
  const isolateGenRef = useRef(0);
  const deepLinkHandled = useRef(false);

  const isolateSubject = toolSettings.isolateSubject !== false;
  const autoKitPreviews = toolSettings.autoKitPreviews === true;
  const kitPreviews = useMemo(
    () => normalizeFittingKitPreviews(toolSettings.kitPreviews),
    [toolSettings.kitPreviews]
  );
  const referenceImageFilename = toolSettings.referenceImageFilename?.trim() || '';
  const referenceImageUrl = toolSettings.referenceImageUrl?.trim() || '';
  const referenceOriginalFilename = toolSettings.referenceOriginalFilename?.trim() || '';
  const referenceOriginalUrl = toolSettings.referenceOriginalUrl?.trim() || '';
  const hasReference = Boolean(referenceImageFilename || referenceImageUrl);
  const character = getCharacter(shared.activeCharacterId);
  const selectedModel = getComfyModelDefinition(shared.model);

  const clothingGender = useMemo(
    () =>
      subjectGenderToClothingGender(
        parseCharacterHints(character?.hints || character?.descriptor).gender
      ),
    [character?.descriptor, character?.hints]
  );

  const [wardrobeOptions, setWardrobeOptions] =
    useState<FittingClothingOption[]>(EMPTY_WARDROBE_OPTIONS);
  const [wardrobeLoadedKey, setWardrobeLoadedKey] = useState<string | null>(null);
  const wardrobeOptionsKey = `wardrobeCatalog:${clothingGender}`;
  const wardrobeReady = wardrobeLoadedKey === wardrobeOptionsKey;
  const wardrobeCategoryFilter = normalizeWardrobeCategoryFilter(
    toolSettings.wardrobeCategoryFilter
  );
  const prevCategoryFilterRef = useRef(wardrobeCategoryFilter);
  const filteredWardrobeOptions = useMemo(
    () =>
      filterWardrobeSelectOptions(wardrobeOptions, wardrobeCategoryFilter, shared.lockedWardrobeId),
    [shared.lockedWardrobeId, wardrobeCategoryFilter, wardrobeOptions]
  );
  const wardrobeKitCount = useMemo(
    () => countWardrobeOptionsForFilter(wardrobeOptions, wardrobeCategoryFilter),
    [wardrobeCategoryFilter, wardrobeOptions]
  );

  const swipeDeck = useMemo(
    () => buildFittingSwipeDeck(filteredWardrobeOptions),
    [filteredWardrobeOptions]
  );
  const deckSelectionId = useMemo(
    () => resolveFittingDeckWardrobeId(swipeDeck, shared.lockedWardrobeId),
    [swipeDeck, shared.lockedWardrobeId]
  );
  const activeSwipeKit = useMemo(() => {
    if (!deckSelectionId) {
      return swipeDeck[0] ?? null;
    }
    return swipeDeck.find(kit => kit.id === deckSelectionId) ?? swipeDeck[0] ?? null;
  }, [deckSelectionId, swipeDeck]);
  const deckSelectionIndex = useMemo(
    () => fittingSwipeIndex(swipeDeck, deckSelectionId),
    [deckSelectionId, swipeDeck]
  );
  const activeThumbRef = useRef<HTMLButtonElement>(null);

  const activeLookId = (shared.activeLookId ?? character?.activeLookId ?? '').trim();
  const previewModel = useMemo(() => resolveFittingKitPreviewModel(shared.model), [shared.model]);
  const previewModelLabel = previewModel
    ? (getComfyModelDefinition(previewModel)?.label ?? previewModel)
    : null;
  const previewQueueParams = useMemo(() => fittingKitPreviewQueueParams(), []);
  const previewQueueResolveOptions = useMemo(() => fittingKitPreviewQueueResolveOptions(), []);
  const inFlightPreviewCount = useMemo(
    () => countInFlightFittingKitPreviews(kitPreviews, activeLookId),
    [activeLookId, kitPreviews]
  );
  const completedPreviewCount = useMemo(() => {
    if (!activeLookId) {
      return 0;
    }
    return swipeDeck.filter(kit => {
      const preview = getFittingKitPreview(kitPreviews, kit.id, activeLookId);
      return preview?.status === 'completed' && Boolean(preview.imageUrl?.trim());
    }).length;
  }, [activeLookId, kitPreviews, swipeDeck]);

  useSeedToolDraft(mounted, {
    toolKey: TOOL_ID,
    label: 'Fitting Room',
    href: '/fitting',
    fields: [shared.lockedWardrobeId, toolSettings.notes, character?.name],
  });

  const actions = usePromptResultActions({
    tool: TOOL_ID,
    model: shared.model,
    detail: shared.detail,
    hints: toolSettings.notes,
    autoFixRules: shared.autoFixRules !== false,
    reformatTarget: getReformatTargetModel(shared.model),
  });

  const clearReferencePreview = useCallback(() => {
    setReferencePreviewUrl(previous => {
      if (previous?.startsWith('blob:')) {
        URL.revokeObjectURL(previous);
      }
      return null;
    });
  }, []);

  const applyReference = useCallback(
    async (input: {
      file?: File | null;
      imageUrl?: string;
      filename?: string;
      isolate?: boolean;
    }) => {
      const imageUrl = input.imageUrl?.trim() || '';
      const file = input.file ?? null;
      if (!file && !imageUrl && !input.filename?.trim()) {
        throw new Error('Choose a photo or a gallery still first.');
      }
      const shouldIsolate = input.isolate ?? isolateSubject;
      isolateGenRef.current += 1;
      const gen = isolateGenRef.current;
      setReferenceUploading(true);
      setIsolateStatus(null);
      setError(null);
      const localPreview = file ? URL.createObjectURL(file) : imageUrl || null;
      if (localPreview) {
        setReferencePreviewUrl(previous => {
          if (previous?.startsWith('blob:') && previous !== localPreview) {
            URL.revokeObjectURL(previous);
          }
          return localPreview;
        });
      }
      try {
        const originalName = input.filename || file?.name || `fitting-ref-${Date.now()}.png`;
        const comfyUrl = loadComfyUiSettings().apiUrl?.trim() || undefined;
        const sourceFile =
          file ??
          (await (async () => {
            const blob = await loadImageBlobFromUrls(
              collectIsolateSourceUrls({
                imageUrl,
                filename: originalName,
                comfyUrl,
              })
            );
            return new File([blob], originalName, {
              type: blob.type || 'image/png',
              lastModified: Date.now(),
            });
          })());
        if (gen !== isolateGenRef.current) {
          return;
        }
        const originalUploaded = await resolveQueueInputImage({
          file: sourceFile,
          filename: originalName,
          model: shared.model,
        });
        if (gen !== isolateGenRef.current) {
          return;
        }
        const originalFilename = originalUploaded?.filename?.trim();
        if (!originalFilename) {
          throw new Error('Upload did not return a filename.');
        }
        const incomingDurable =
          imageUrl && !imageUrl.startsWith('blob:') && !isIdentityMediaUrl(imageUrl)
            ? imageUrl
            : '';
        const originalViewUrl =
          collectIsolateSourceUrls({
            filename: originalFilename,
            comfyUrl,
          }).find(url => url.includes('/api/comfyui/view?')) ?? '';
        const originalUrl = incomingDurable || originalViewUrl || imageUrl;

        let queueFilename = originalFilename;
        let queueUrl = originalUrl;
        let isolated = false;

        if (!shouldIsolate) {
          const originalDurable = await persistIdentityImage({
            file: sourceFile,
            filename: originalFilename,
          });
          if (gen !== isolateGenRef.current) {
            return;
          }
          queueUrl = originalDurable || originalUrl;
        } else {
          setIsolateStatus('Isolating subject on white…');
          try {
            const cutout = await isolateSubjectOnWhite(sourceFile, originalName);
            if (gen !== isolateGenRef.current) {
              return;
            }
            const cutoutUploaded = await resolveQueueInputImage({
              file: cutout,
              filename: cutout.name,
              model: shared.model,
            });
            const cutoutFilename = cutoutUploaded?.filename?.trim();
            if (!cutoutFilename) {
              throw new Error('Cut-out upload did not return a filename.');
            }
            const cutoutDurable = await persistIdentityImage({
              file: cutout,
              filename: cutoutFilename,
            });
            if (gen !== isolateGenRef.current) {
              return;
            }
            const cutoutPreview = URL.createObjectURL(cutout);
            setReferencePreviewUrl(previous => {
              if (previous?.startsWith('blob:') && previous !== cutoutPreview) {
                URL.revokeObjectURL(previous);
              }
              return cutoutPreview;
            });
            queueFilename = cutoutFilename;
            queueUrl = cutoutDurable || cutoutPreview;
            isolated = true;
          } catch (err) {
            isolated = false;
            setIsolateStatus(null);
            setError(
              err instanceof Error
                ? `${err.message} ${ISOLATE_QUEUE_BLOCKED_MESSAGE}`
                : ISOLATE_QUEUE_BLOCKED_MESSAGE
            );
            const originalDurable = await persistIdentityImage({
              file: sourceFile,
              filename: originalFilename,
            });
            queueUrl = originalDurable || originalUrl;
          }
        }

        if (gen !== isolateGenRef.current) {
          return;
        }
        if (isolated && localPreview?.startsWith('blob:')) {
          URL.revokeObjectURL(localPreview);
        }
        updateToolSettings({
          isolateSubject: shouldIsolate,
          referenceOriginalFilename: originalFilename,
          referenceOriginalUrl: originalUrl.startsWith('blob:')
            ? incomingDurable || originalViewUrl
            : originalUrl,
          referenceImageFilename: queueFilename,
          referenceImageUrl: queueUrl,
          referenceIsolated: isolated,
          previewPlateFilename: undefined,
          previewPlateUrl: undefined,
          previewPlateSourceKey: undefined,
        });
        if (!isolated && !queueUrl.startsWith('blob:')) {
          setReferencePreviewUrl(cacheBustIdentityMediaUrl(queueUrl));
        }
        setIsolateStatus(isolated ? 'Subject isolated on white.' : null);
      } catch (err) {
        if (gen !== isolateGenRef.current) {
          return;
        }
        clearReferencePreview();
        setIsolateStatus(null);
        throw err;
      } finally {
        if (gen === isolateGenRef.current) {
          setReferenceUploading(false);
        }
      }
    },
    [clearReferencePreview, isolateSubject, shared.model, updateToolSettings]
  );

  const clearReference = useCallback(() => {
    clearReferencePreview();
    updateToolSettings({
      referenceImageUrl: '',
      referenceImageFilename: '',
      referenceOriginalUrl: '',
      referenceOriginalFilename: '',
      referenceIsolated: false,
      previewPlateFilename: undefined,
      previewPlateUrl: undefined,
      previewPlateSourceKey: undefined,
    });
  }, [clearReferencePreview, updateToolSettings]);

  useGalleryHandoff('fitting', handoff => {
    void applyReference({
      file: handoff.file,
      imageUrl: handoff.previewUrl || handoff.payload.imageUrl,
      filename: handoff.payload.imageFilename,
    }).catch(err => {
      setError(err instanceof Error ? err.message : 'Could not use that still.');
    });
  });

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
        try {
          const resolvedPlate = resolveFittingPlateFromCharacter(record);
          if (resolvedPlate?.filename || resolvedPlate?.imageUrl) {
            scheduleAfterCommit(() => {
              void applyReference({
                imageUrl: resolvedPlate.imageUrl,
                filename: resolvedPlate.filename,
                isolate: resolvedPlate.isolateSubject !== false,
              }).catch(err => {
                setError(err instanceof Error ? err.message : 'Could not load character plate.');
              });
            });
          }
        } catch (err) {
          scheduleAfterCommit(() =>
            setError(err instanceof Error ? err.message : 'Could not resolve character plate.')
          );
        }
        if (record.lockedWardrobeId?.trim() && !wardrobeId) {
          updateShared({ lockedWardrobeId: record.lockedWardrobeId.trim() });
        }
      }
    }
    if (wardrobeId) {
      updateShared({ lockedWardrobeId: wardrobeId });
    }
    if (fromLook) {
      // Keep the session pack for Day / Roleplay handoffs; Roleplay clears on apply.
      const pack = loadLookPack();
      if (pack) {
        const applied = applyLookPackToFittingState(pack);
        if (applied.shared.lockedWardrobeId && !wardrobeId) {
          updateShared({ lockedWardrobeId: applied.shared.lockedWardrobeId });
        }
        if (applied.tool.notes) {
          updateToolSettings({ notes: applied.tool.notes });
        }
        scheduleAfterCommit(() => setSaveStatus('Applied Moodboard look pack.'));
      }
    }
  }, [applyReference, mounted, updateShared, updateToolSettings]);

  useEffect(() => {
    if (!mounted || hasReference || !shared.activeCharacterId) {
      return;
    }
    const record = getCharacter(shared.activeCharacterId);
    let resolvedPlate;
    try {
      resolvedPlate = resolveFittingPlateFromCharacter(record);
    } catch {
      return;
    }
    if (!resolvedPlate?.filename && !resolvedPlate?.imageUrl) {
      return;
    }
    scheduleAfterCommit(() => {
      void applyReference({
        imageUrl: resolvedPlate.imageUrl,
        filename: resolvedPlate.filename,
        isolate: resolvedPlate.isolateSubject !== false,
      }).catch(() => {
        /* plate may be missing — user can upload */
      });
    });
  }, [applyReference, hasReference, mounted, shared.activeCharacterId]);

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
    const id = shared.lockedWardrobeId?.trim();
    if (!id) {
      scheduleAfterCommit(() => setLockedWardrobeLabel(undefined));
      return;
    }
    const cached = getCachedClothingLabel(id);
    if (cached) {
      scheduleAfterCommit(() => setLockedWardrobeLabel(cached));
      return;
    }
    let cancelled = false;
    void fetchClothingLabels([id]).then(labels => {
      if (cancelled) {
        return;
      }
      setLockedWardrobeLabel(labels.get(id) ?? id);
    });
    return () => {
      cancelled = true;
    };
  }, [shared.lockedWardrobeId]);

  useEffect(() => {
    if (!referenceImageUrl) {
      return;
    }
    if (referenceImageUrl.startsWith('blob:')) {
      scheduleAfterCommit(() => setReferencePreviewUrl(referenceImageUrl));
      return;
    }
    scheduleAfterCommit(() => setReferencePreviewUrl(cacheBustIdentityMediaUrl(referenceImageUrl)));
  }, [referenceImageUrl]);

  const selectKit = useCallback(
    (wardrobeId: string) => {
      updateShared({ lockedWardrobeId: wardrobeId.trim() || undefined });
    },
    [updateShared]
  );

  const swipeKit = useCallback(
    (delta: number) => {
      const next = fittingSwipeNeighbor(swipeDeck, shared.lockedWardrobeId, delta);
      if (next) {
        selectKit(next.id);
      }
    },
    [selectKit, shared.lockedWardrobeId, swipeDeck]
  );

  const {
    busy,
    compareTryOns,
    previewStatus,
    queueTryOn,
    fillKitPreviews,
    keepTryOn,
    queueTryOnAndSwipe,
  } = useFittingRoomQueue({
    mounted,
    actions,
    shared,
    toolSettings,
    updateShared,
    updateToolSettings,
    character,
    hasReference,
    isolateSubject,
    referenceImageFilename,
    referenceImageUrl,
    lockedWardrobeLabel,
    swipeDeck,
    deckSelectionId,
    activeLookId,
    kitPreviews,
    autoKitPreviews,
    inFlightPreviewCount,
    previewModel,
    previewQueueParams,
    previewQueueResolveOptions,
    swipeKit,
    setOutput,
    setError,
    setCopied,
    setSaveStatus,
    setContinueDayHref,
  });

  useEffect(() => {
    if (prevCategoryFilterRef.current === wardrobeCategoryFilter) {
      return;
    }
    prevCategoryFilterRef.current = wardrobeCategoryFilter;
    if (!wardrobeReady || swipeDeck.length === 0) {
      return;
    }
    const locked = shared.lockedWardrobeId?.trim();
    if (locked && swipeDeck.some(kit => kit.id === locked)) {
      return;
    }
    const first = swipeDeck[0]?.id;
    if (first) {
      updateShared({ lockedWardrobeId: first });
    }
  }, [shared.lockedWardrobeId, swipeDeck, updateShared, wardrobeCategoryFilter, wardrobeReady]);

  useEffect(() => {
    activeThumbRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'nearest',
    });
  }, [deckSelectionId]);

  const skipKit = useCallback(() => {
    swipeKit(1);
    setSaveStatus('Skipped to next kit.');
  }, [swipeKit]);

  const saveKitToCast = useCallback(() => {
    setSaveStatus(null);
    const wardrobeId = shared.lockedWardrobeId?.trim();
    if (!wardrobeId) {
      setError('Pick a kit before saving to Cast.');
      return;
    }
    const activeId = shared.activeCharacterId?.trim();
    if (!activeId) {
      setError('Select a Cast character first.');
      return;
    }
    const existing = getCharacter(activeId);
    const base =
      existing ??
      characterFromShared(shared, {
        name: character?.name || 'Untitled character',
        hints: character?.hints,
        notes: character?.notes,
      });
    if (existing) {
      base.id = existing.id;
    }
    base.lockedWardrobeId = wardrobeId;
    const look = activeLook(base);
    base.looks = (base.looks ?? [look]).map(entry =>
      entry.id === look.id ? { ...entry, lockedWardrobeId: wardrobeId } : entry
    );
    base.activeLookId = look.id;
    upsertCharacter(base);
    saveSharedSettings({
      ...loadSettingsCache().shared,
      ...applyCharacterRecord(getCharacter(base.id) ?? base),
    });
    setSaveStatus(`Saved kit on ${base.name}.`);
  }, [character?.hints, character?.name, character?.notes, shared]);

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

  const dayPlannerHref = (() => {
    if (typeof window === 'undefined') {
      return character ? `/day?character=${encodeURIComponent(character.id)}` : '/day';
    }
    const pack = loadLookPack();
    if (pack && character) {
      return lookPackDayHref({
        ...pack,
        characterId: character.id,
        wardrobeId: shared.lockedWardrobeId?.trim() || pack.wardrobeId,
      });
    }
    if (!character) {
      return '/day';
    }
    const params = new URLSearchParams();
    params.set('character', character.id);
    if (shared.lockedWardrobeId?.trim()) {
      params.set('wardrobe', shared.lockedWardrobeId.trim());
    }
    return `/day?${params.toString()}`;
  })();

  const wardrobeGroups = useMemo(() => {
    const groups = new Map<string, FittingClothingOption[]>();
    for (const option of filteredWardrobeOptions) {
      if (!option.group) {
        continue;
      }
      if (!groups.has(option.group)) {
        groups.set(option.group, []);
      }
      groups.get(option.group)!.push(option);
    }
    return groups;
  }, [filteredWardrobeOptions]);

  const queueBlocked =
    !hasReference ||
    !shared.lockedWardrobeId?.trim() ||
    referenceUploading ||
    busy ||
    (isolateSubject && toolSettings.referenceIsolated !== true && !error);

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
    referenceUploading,
    isolateStatus,
    setIsolateStatus,
    referencePreviewUrl,
    setReferencePreviewUrl,
    lockedWardrobeLabel,
    saveStatus,
    continueDayHref,
    isolateSubject,
    autoKitPreviews,
    kitPreviews,
    referenceImageFilename,
    referenceImageUrl,
    referenceOriginalFilename,
    referenceOriginalUrl,
    hasReference,
    character,
    selectedModel,
    wardrobeReady,
    wardrobeCategoryFilter,
    wardrobeOptions,
    wardrobeKitCount,
    filteredWardrobeOptions,
    wardrobeGroups,
    swipeDeck,
    activeSwipeKit,
    deckSelectionId,
    deckSelectionIndex,
    activeThumbRef,
    activeLookId,
    previewModel,
    previewModelLabel,
    completedPreviewCount,
    inFlightPreviewCount,
    actions,
    applyReference,
    clearReference,
    selectKit,
    swipeKit,
    busy,
    compareTryOns,
    previewStatus,
    queueTryOn,
    fillKitPreviews,
    keepTryOn,
    queueTryOnAndSwipe,
    skipKit,
    saveKitToCast,
    goRoleplay,
    dayPlannerHref,
    queueBlocked,
    leanChrome,
  };
}
