'use client';

import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import CharacterOsPicker from '@/components/CharacterOsPicker';
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
  CollapsibleSection,
  ToolActionRow,
  ToolBadge,
  ToolLayout,
  ToolSection,
  accentFocusClass,
} from '@/components/ui/ToolPageShell';
import { useCachedSettings } from '@/hooks/useCachedSettings';
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
  toggleLookKeeper,
  upsertCharacter,
} from '@/lib/character-os';
import { subjectGenderToClothingGender } from '@/lib/clothing-gender';
import {
  fetchClothingLabels,
  fetchClothingSelectOptions,
  getCachedClothingLabel,
} from '@/lib/clothing-catalog-client';
import {
  COMFYUI_GALLERY_UPDATED_EVENT,
  galleryEntryPrimaryThumbUrl,
  galleryEntryPrimaryViewUrl,
  loadComfyGallery,
} from '@/lib/comfyui-gallery';
import {
  buildFittingKitPreviewPrompt,
  buildFittingOutfitPrompt,
  buildFittingSwipeDeck,
  fittingSwipeIndex,
  fittingSwipeNeighbor,
  pushFittingCompareTryOn,
  resolveFittingDeckWardrobeId,
  resolveFittingPlateFromCharacter,
  type FittingCompareTryOn,
} from '@/lib/fitting-room';
import {
  countInFlightFittingKitPreviews,
  FITTING_KIT_PREVIEW_CONCURRENCY,
  FITTING_KIT_PREVIEW_MAX,
  FITTING_KIT_PREVIEW_HEIGHT,
  FITTING_KIT_PREVIEW_PROMPT_VERSION,
  FITTING_KIT_PREVIEW_WIDTH,
  fittingKitPreviewQueueParams,
  fittingKitPreviewQueueResolveOptions,
  fittingKitsNeedingPreview,
  getFittingKitPreview,
  mergeFittingKitPreviewsFromGallery,
  normalizeFittingKitPreviews,
  resolveFittingKitPreviewModel,
  upsertFittingKitPreview,
} from '@/lib/fitting-kit-previews';
import {
  countWardrobeOptionsForFilter,
  filterWardrobeSelectOptions,
  normalizeWardrobeCategoryFilter,
  wardrobeCategoryFilterOptions,
} from '@/lib/wardrobe-catalog-ui';
import { getComfyModelDefinition } from '@/lib/comfy-models/client';
import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import { galleryPickPath } from '@/lib/gallery-handoff';
import {
  cacheBustIdentityMediaUrl,
  IDENTITY_MEDIA_URL,
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
  applyLookPackToDaySlots,
  applyLookPackToFittingState,
  loadLookPack,
  lookPackDayHref,
  lookPackNotes,
  lookPackRoleplayHref,
  saveLookPack,
} from '@/lib/look-pack';
import { bumpPlayCampaignStep } from '@/lib/play-campaign';
import { seedDaySlotsFromKeeperWardrobes } from '@/lib/day-planner';
import { resolveQueueInputImage } from '@/lib/queue-input-image';
import { getReformatTargetModel } from '@/lib/reformat-target';
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import { buildRoleplayQueueStillOptions } from '@/lib/roleplay-play-core';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import {
  DEFAULT_DAY_TOOL_CACHE,
  DEFAULT_FITTING_TOOL_CACHE,
  loadSettingsCache,
  loadToolSettings,
  saveSharedSettings,
  saveToolSettings,
} from '@/lib/settings-cache';
import { EMPTY_WARDROBE_OPTIONS, type FittingClothingOption } from '@/lib/fitting-clothing-options';

const ACCENT = 'rose' as const;
const TOOL_ID = 'fitting' as const;

export default function FittingRoomTool() {
  const router = useRouter();
  const workspaceMode = useWorkspaceMode();
  const leanChrome = isLeanWorkspaceMode(workspaceMode);
  const description = useToolPageDescription(
    'Lock a Cast plate, swipe catalog kits with draft thumbs, queue outfit try-on stills.',
    'Try outfits on a Cast character — swipe kits on a locked plate with draft previews.'
  );
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } = useCachedSettings(
    'fitting',
    DEFAULT_FITTING_TOOL_CACHE
  );

  const [output, setOutput] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [referenceUploading, setReferenceUploading] = useState(false);
  const [isolateStatus, setIsolateStatus] = useState<string | null>(null);
  const [referencePreviewUrl, setReferencePreviewUrl] = useState<string | null>(null);
  const [lockedWardrobeLabel, setLockedWardrobeLabel] = useState<string | undefined>();
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [compareTryOns, setCompareTryOns] = useState<FittingCompareTryOn[]>([]);
  const [continueDayHref, setContinueDayHref] = useState<string | null>(null);
  const [previewStatus, setPreviewStatus] = useState<string | null>(null);
  const pendingTryOnRef = useRef<{
    promptId: string;
    wardrobeId: string;
    wardrobeLabel?: string;
  } | null>(null);
  const previewQueueBusyRef = useRef(false);
  const kitPreviewsRef = useRef(normalizeFittingKitPreviews(toolSettings.kitPreviews));
  const isolateGenRef = useRef(0);
  const deepLinkHandled = useRef(false);

  const isolateSubject = toolSettings.isolateSubject !== false;
  const autoKitPreviews = toolSettings.autoKitPreviews === true;
  const kitPreviews = useMemo(
    () => normalizeFittingKitPreviews(toolSettings.kitPreviews),
    [toolSettings.kitPreviews]
  );
  kitPreviewsRef.current = kitPreviews;
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

  const buildPrompt = useCallback(() => {
    const outfitLabel = lockedWardrobeLabel?.trim() || shared.lockedWardrobeId?.trim() || '';
    if (!outfitLabel) {
      throw new Error('Pick a wardrobe kit first.');
    }
    if (!hasReference) {
      throw new Error('Add a plate — Cast look, upload, or Gallery still.');
    }
    return buildFittingOutfitPrompt({
      outfitLabel,
      characterName: character?.name,
      characterDescriptor: character?.descriptor || character?.hints,
      notes: toolSettings.notes,
      isolated: toolSettings.referenceIsolated === true,
    });
  }, [
    character?.descriptor,
    character?.hints,
    character?.name,
    hasReference,
    lockedWardrobeLabel,
    shared.lockedWardrobeId,
    toolSettings.notes,
    toolSettings.referenceIsolated,
  ]);

  const queueTryOn = useCallback(async (): Promise<boolean> => {
    setBusy(true);
    setError(null);
    setCopied(false);
    actions.resetStatuses();
    try {
      const prompt = buildPrompt();
      const finalized = await actions.finalizePrompt(prompt, character?.name || 'Fitting');
      setOutput(finalized);
      rememberDraftFields({
        toolKey: TOOL_ID,
        label: 'Fitting Room',
        href: '/fitting',
        fields: [character?.name ?? '', shared.lockedWardrobeId ?? '', finalized],
      });
      const queueOptions = buildRoleplayQueueStillOptions({
        photoMode: true,
        isolateSubject,
        referenceIsolated: toolSettings.referenceIsolated === true,
        filename: referenceImageFilename,
        imageUrl: referenceImageUrl,
        identityLockStrength: shared.ipAdapterStrength,
        identityKind: shared.identityKind,
      });
      const promptId = await actions.sendComfyUi(finalized, undefined, undefined, {
        ...(queueOptions ?? {}),
        characterId: shared.activeCharacterId,
        lookId: shared.activeLookId ?? character?.activeLookId,
      });
      if (typeof promptId === 'string' && promptId.trim()) {
        pendingTryOnRef.current = {
          promptId: promptId.trim(),
          wardrobeId: shared.lockedWardrobeId?.trim() || '',
          wardrobeLabel: lockedWardrobeLabel,
        };
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not queue the try-on.');
      return false;
    } finally {
      setBusy(false);
    }
  }, [
    actions,
    buildPrompt,
    character,
    isolateSubject,
    referenceImageFilename,
    referenceImageUrl,
    shared.activeCharacterId,
    shared.activeLookId,
    shared.identityKind,
    shared.ipAdapterStrength,
    shared.lockedWardrobeId,
    lockedWardrobeLabel,
    toolSettings.referenceIsolated,
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
        updateToolSettings({ kitPreviews: merged.previews });
      }
    };
    window.addEventListener(COMFYUI_GALLERY_UPDATED_EVENT, syncGallery);
    syncGallery();
    return () => window.removeEventListener(COMFYUI_GALLERY_UPDATED_EVENT, syncGallery);
  }, [updateToolSettings]);

  const queueKitPreview = useCallback(
    async (wardrobeId: string, wardrobeLabel: string) => {
      const lookId = (shared.activeLookId ?? character?.activeLookId ?? '').trim();
      if (!lookId || !hasReference || !wardrobeId.trim()) {
        return false;
      }
      if (isolateSubject && toolSettings.referenceIsolated !== true) {
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
        if (!previewModel) {
          setError(
            'Install Boogu Edit Turbo or Qwen Edit Lightning 4 for fast kit previews. Queue try-on still uses your sidebar model.'
          );
          return false;
        }
        const prompt = buildFittingKitPreviewPrompt({
          outfitLabel: wardrobeLabel.trim() || wardrobeId,
        });
        const queueOptions = buildRoleplayQueueStillOptions({
          photoMode: true,
          isolateSubject,
          referenceIsolated: toolSettings.referenceIsolated === true,
          filename: referenceImageFilename,
          imageUrl: referenceImageUrl,
          identityLockStrength: shared.ipAdapterStrength,
          identityKind: shared.identityKind,
        });
        const promptId = await actions.sendComfyUi(prompt, undefined, undefined, {
          ...(queueOptions ?? {}),
          identityLock: false,
          queueModel: previewModel,
          qualityProfile: 'draft',
          queueParamsBase: previewQueueParams,
          ...previewQueueResolveOptions,
          figurePixelSize: {
            width: FITTING_KIT_PREVIEW_WIDTH,
            height: FITTING_KIT_PREVIEW_HEIGHT,
          },
          draftPreviewLite: true,
          queueHints: '',
          characterId: shared.activeCharacterId,
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
        updateToolSettings({ kitPreviews: next });
        return Boolean(promptId);
      } catch {
        const next = upsertFittingKitPreview(kitPreviewsRef.current, {
          wardrobeId,
          lookId,
          status: 'error',
          updatedAt: Date.now(),
        });
        kitPreviewsRef.current = next;
        updateToolSettings({ kitPreviews: next });
        return false;
      }
    },
    [
      actions,
      character?.activeLookId,
      hasReference,
      isolateSubject,
      previewModel,
      previewQueueParams,
      previewQueueResolveOptions,
      referenceImageFilename,
      referenceImageUrl,
      shared.activeCharacterId,
      shared.activeLookId,
      shared.identityKind,
      shared.ipAdapterStrength,
      toolSettings.referenceIsolated,
      updateToolSettings,
    ]
  );

  const fillKitPreviews = useCallback(async () => {
    const lookId = (shared.activeLookId ?? character?.activeLookId ?? '').trim();
    if (
      !lookId ||
      !hasReference ||
      !previewModel ||
      previewQueueBusyRef.current ||
      (isolateSubject && toolSettings.referenceIsolated !== true)
    ) {
      return;
    }
    const needed = fittingKitsNeedingPreview(
      swipeDeck,
      kitPreviewsRef.current,
      lookId,
      FITTING_KIT_PREVIEW_MAX,
      deckSelectionId
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
        const kit = swipeDeck.find(entry => entry.id === wardrobeId);
        const label = kit?.label || getCachedClothingLabel(wardrobeId) || wardrobeId;
        await queueKitPreview(wardrobeId, label);
      }
      const remaining = fittingKitsNeedingPreview(
        swipeDeck,
        kitPreviewsRef.current,
        lookId,
        FITTING_KIT_PREVIEW_MAX,
        deckSelectionId
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
    character?.activeLookId,
    deckSelectionId,
    hasReference,
    isolateSubject,
    previewModel,
    queueKitPreview,
    shared.activeLookId,
    swipeDeck,
    toolSettings.referenceIsolated,
  ]);

  useEffect(() => {
    if (!mounted || !autoKitPreviews) {
      return;
    }
    const timer = window.setTimeout(() => {
      void fillKitPreviews();
    }, 600);
    return () => window.clearTimeout(timer);
  }, [
    activeLookId,
    autoKitPreviews,
    fillKitPreviews,
    hasReference,
    inFlightPreviewCount,
    mounted,
    swipeDeck,
  ]);

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

  const keepTryOn = useCallback(
    (tryOn: FittingCompareTryOn) => {
      const characterId = shared.activeCharacterId?.trim();
      const lookId = shared.activeLookId ?? character?.activeLookId;
      const entryId = tryOn.galleryEntryId?.trim();
      if (!characterId || !lookId || !entryId) {
        setError('Pick a Cast character with a look before keeping a try-on.');
        return;
      }
      const updated = toggleLookKeeper(characterId, lookId, entryId);
      const wardrobeId = tryOn.wardrobeId?.trim();
      if (wardrobeId) {
        updateShared({ lockedWardrobeId: wardrobeId });
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
          toolSettings.notes?.trim() ||
          lookPackNotes(nextPack) ||
          daySettings.notes,
      });
      const dayHref = lookPackDayHref({
        ...nextPack,
        characterId,
        wardrobeId: wardrobeId || nextPack.wardrobeId,
      });
      setContinueDayHref(dayHref);
      bumpPlayCampaignStep({ characterId, stepId: 'day', lookPackId: undefined });
      void import('@/lib/local-observability').then(({ noteKeepTryOnMetric }) => {
        noteKeepTryOnMetric();
      });
      const kitCount = keeperWardrobes.length || 1;
      setSaveStatus(
        kitCount > 1
          ? `Kept ${tryOn.wardrobeLabel || tryOn.wardrobeId || 'try-on'} · ${kitCount} keeper kits mapped to Day slots.`
          : `Kept ${tryOn.wardrobeLabel || tryOn.wardrobeId || 'try-on'} as a Cast keeper · Day slots seeded.`
      );
      setError(null);
    },
    [
      character?.activeLookId,
      compareTryOns,
      shared.activeCharacterId,
      shared.activeLookId,
      toolSettings.notes,
      updateShared,
    ]
  );

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

  const skipKit = useCallback(() => {
    swipeKit(1);
    setSaveStatus('Skipped to next kit.');
  }, [swipeKit]);

  const queueTryOnAndSwipe = useCallback(async () => {
    const ok = await queueTryOn();
    if (ok) {
      swipeKit(1);
    }
  }, [queueTryOn, swipeKit]);

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

  if (!mounted) {
    return null;
  }

  const queueBlocked =
    !hasReference ||
    !shared.lockedWardrobeId?.trim() ||
    referenceUploading ||
    busy ||
    (isolateSubject && toolSettings.referenceIsolated !== true && !error);

  return (
    <ToolLayout
      accent={ACCENT}
      badge={
        <ToolBadge accent={ACCENT}>
          Fitting Room · {selectedModel?.comfyNode ?? selectedModel?.label ?? 'model'}
        </ToolBadge>
      }
      title="Fitting Room"
      description={description}
      sidebar={
        <SharedToolControls
          shared={shared}
          onModelChange={model => updateShared({ model })}
          onDetailChange={detail => updateShared({ detail })}
          onWorkflowPresetChange={id => updateShared({ selectedWorkflowFileId: id })}
          showWardrobeOption={false}
          seedLlmWithIngredients={false}
          lockedWardrobeId={shared.lockedWardrobeId}
          lockedWardrobeLabel={
            shared.lockedWardrobeId ? (lockedWardrobeLabel ?? shared.lockedWardrobeId) : undefined
          }
          onClearLockedWardrobe={() => updateShared({ lockedWardrobeId: undefined })}
          autoFixRules={shared.autoFixRules !== false}
          onAutoFixRulesChange={value => updateShared({ autoFixRules: value })}
          recommendFromText={output}
          toolId={TOOL_ID}
          preferEditModels
          onSharedSettingsChange={updateShared}
          variant="roleplay"
        />
      }
    >
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.fitting} />

      <ToolSection
        title="Character"
        description="Same Character OS id as Cast and Roleplay — try-ons stamp that record."
        data-testid="fitting-character"
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
      </ToolSection>

      <ToolSection
        title="Plate"
        description="Identity still for img2img. Isolate on white so the photo’s clothes and scene do not leak."
        data-testid="fitting-plate"
      >
        <div className="flex flex-wrap gap-2">
          <ChipButton
            active={isolateSubject}
            disabled={busy || referenceUploading}
            onClick={() => {
              const next = !isolateSubject;
              if (!next) {
                updateToolSettings({
                  isolateSubject: false,
                  referenceIsolated: false,
                  referenceImageFilename: referenceOriginalFilename || referenceImageFilename,
                  referenceImageUrl: referenceOriginalUrl || referenceImageUrl,
                });
                if (referenceOriginalUrl || referenceImageUrl) {
                  setReferencePreviewUrl(
                    cacheBustIdentityMediaUrl(referenceOriginalUrl || referenceImageUrl)
                  );
                }
                setIsolateStatus(null);
                return;
              }
              updateToolSettings({ isolateSubject: next });
              const originalUrl = referenceOriginalUrl || referenceImageUrl;
              const originalFilename = referenceOriginalFilename || referenceImageFilename;
              if (!originalUrl && !originalFilename) {
                return;
              }
              void applyReference({
                imageUrl: originalUrl || IDENTITY_MEDIA_URL,
                filename: originalFilename || 'fitting-ref.png',
                isolate: next,
              }).catch(err => {
                setError(err instanceof Error ? err.message : 'Could not update the reference.');
              });
            }}
          >
            Isolate on white
          </ChipButton>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="file"
            accept="image/*"
            disabled={busy || referenceUploading}
            className="ui-file-input block min-w-0 flex-1"
            onChange={event => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) {
                return;
              }
              void applyReference({ file }).catch(err => {
                setError(err instanceof Error ? err.message : 'Could not upload that photo.');
              });
            }}
          />
          <ButtonLink href={galleryPickPath('fitting')} variant="secondary" size="sm">
            Choose from Gallery
          </ButtonLink>
          {hasReference ? (
            <Button variant="ghost" size="sm" disabled={busy} onClick={clearReference}>
              Clear
            </Button>
          ) : null}
        </div>
        {isolateStatus ? (
          <p className="type-caption mt-2 text-[var(--text-muted)]">{isolateStatus}</p>
        ) : null}
        {referencePreviewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={referencePreviewUrl}
            alt="Fitting plate"
            className="mt-3 max-h-64 rounded-[var(--radius-md)] border border-[var(--border-subtle)] object-contain"
          />
        ) : (
          <p className="type-caption mt-2 text-[var(--text-muted)]">
            No plate yet — open a Cast character with a look, or upload / pick from Gallery.
          </p>
        )}
      </ToolSection>

      <ToolSection
        title="Wardrobe kit"
        description="Filter by clothing type, swipe kits on the locked plate, or pick from the catalog."
        data-testid="fitting-kit-strip"
      >
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
              Showing {wardrobeKitCount} kit{wardrobeKitCount === 1 ? '' : 's'} in this type.
            </p>
          ) : null}
        </label>
        <FieldDivider />
        {swipeDeck.length > 0 ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={!wardrobeReady || busy || swipeDeck.length < 2}
                onClick={() => swipeKit(-1)}
              >
                Prev
              </Button>
              <span className="type-caption min-w-0 flex-1 text-center text-[var(--text-muted)]">
                {activeSwipeKit ? (
                  <>
                    <span className="block truncate">
                      {activeSwipeKit.label}
                      {activeSwipeKit.group ? ` · ${activeSwipeKit.group}` : ''}
                    </span>
                    {swipeDeck.length > 1 ? (
                      <span className="mt-0.5 block text-[var(--text-muted)]">
                        {deckSelectionIndex + 1} / {swipeDeck.length}
                      </span>
                    ) : null}
                  </>
                ) : (
                  'Pick a kit to swipe'
                )}
              </span>
              <Button
                size="sm"
                variant="secondary"
                disabled={!wardrobeReady || busy || swipeDeck.length < 2}
                onClick={() => swipeKit(1)}
              >
                Next
              </Button>
            </div>
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {swipeDeck.map(kit => {
                const preview = activeLookId
                  ? getFittingKitPreview(kitPreviews, kit.id, activeLookId)
                  : undefined;
                const thumb = preview?.status === 'completed' ? preview.imageUrl?.trim() : '';
                const pending = preview?.status === 'queued' || preview?.status === 'running';
                const selected = deckSelectionId === kit.id;
                return (
                  <button
                    key={kit.id}
                    ref={selected ? activeThumbRef : undefined}
                    type="button"
                    data-active={selected ? 'true' : 'false'}
                    disabled={busy}
                    title={kit.label}
                    aria-label={kit.label}
                    aria-current={selected ? 'true' : undefined}
                    onClick={() => selectKit(kit.id)}
                    className={`shrink-0 rounded-md border p-1 transition ${
                      selected
                        ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] shadow-[0_0_0_1px_var(--accent-border)]'
                        : 'border-[var(--border-default)] bg-transparent hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" className="block h-20 w-16 rounded object-cover" />
                    ) : (
                      <span
                        className={`flex h-20 w-16 items-center justify-center rounded border border-[var(--border-subtle)] type-caption ${
                          pending ? 'text-[var(--text-muted)]' : 'text-[var(--text-muted)]'
                        }`}
                      >
                        {pending ? '…' : '—'}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <CollapsibleSection
              title="Draft previews & catalog"
              summary="Auto draft thumbs, full catalog pick, and optional notes."
              defaultOpen={!leanChrome}
              persistKey="fitting-kit-advanced"
            >
              <div className="flex flex-wrap items-center gap-2">
                <ChipButton
                  active={autoKitPreviews}
                  disabled={busy || !hasReference}
                  onClick={() => updateToolSettings({ autoKitPreviews: !autoKitPreviews })}
                >
                  Auto draft previews
                </ChipButton>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={
                    busy ||
                    !hasReference ||
                    !activeLookId ||
                    !previewModel ||
                    swipeDeck.length === 0 ||
                    (isolateSubject && toolSettings.referenceIsolated !== true)
                  }
                  onClick={() => void fillKitPreviews()}
                >
                  Preview kits
                </Button>
                {completedPreviewCount > 0 || inFlightPreviewCount > 0 ? (
                  <span className="type-caption text-[var(--text-muted)]">
                    {completedPreviewCount} preview{completedPreviewCount === 1 ? '' : 's'}
                    {inFlightPreviewCount > 0 ? ` · ${inFlightPreviewCount} rendering` : ''}
                  </span>
                ) : null}
              </div>
              {previewStatus ? (
                <p className="type-caption text-[var(--text-muted)]">{previewStatus}</p>
              ) : hasReference && autoKitPreviews ? (
                <p className="type-caption text-[var(--text-muted)]">
                  Draft previews use {previewModelLabel ?? 'a fast edit model'} · 4-step draft ·
                  256×384 (3 at a time). Queue try-on keeps your sidebar model and settings.
                </p>
              ) : previewModelLabel ? (
                <p className="type-caption text-[var(--text-muted)]">
                  Preview kits: {previewModelLabel} · 4-step draft · 256×384 · 3 concurrent. Queue
                  try-on uses {selectedModel?.label ?? shared.model}.
                </p>
              ) : null}
              <label className="mt-3 space-y-2">
                <FieldLabel>Full catalog</FieldLabel>
                <SelectInput
                  value={shared.lockedWardrobeId ?? ''}
                  disabled={!wardrobeReady || busy}
                  className={accentFocusClass(ACCENT)}
                  onChange={event => {
                    selectKit(event.target.value);
                  }}
                >
                  {filteredWardrobeOptions
                    .filter(option => !option.group)
                    .map(option => (
                      <option key={option.value || 'default'} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  {[...wardrobeGroups.entries()].map(([group, groupOptions]) => (
                    <optgroup key={group} label={group}>
                      {groupOptions.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </SelectInput>
              </label>
              <label className="mt-3 space-y-2">
                <FieldLabel>Notes (optional)</FieldLabel>
                <TextArea
                  data-testid="fitting-notes"
                  rows={2}
                  value={toolSettings.notes ?? ''}
                  className={accentFocusClass(ACCENT)}
                  placeholder="e.g. slightly oversized blazer, sneakers untied"
                  onChange={event => updateToolSettings({ notes: event.target.value })}
                />
              </label>
            </CollapsibleSection>
          </div>
        ) : null}
        {swipeDeck.length === 0 ? (
          <>
            <label className="mt-3 space-y-2">
              <FieldLabel>Full catalog</FieldLabel>
              <SelectInput
                value={shared.lockedWardrobeId ?? ''}
                disabled={!wardrobeReady || busy}
                className={accentFocusClass(ACCENT)}
                onChange={event => {
                  selectKit(event.target.value);
                }}
              >
                {filteredWardrobeOptions
                  .filter(option => !option.group)
                  .map(option => (
                    <option key={option.value || 'default'} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                {[...wardrobeGroups.entries()].map(([group, groupOptions]) => (
                  <optgroup key={group} label={group}>
                    {groupOptions.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </SelectInput>
            </label>
            <FieldDivider />
            <label className="space-y-2">
              <FieldLabel>Notes (optional)</FieldLabel>
              <TextArea
                rows={2}
                value={toolSettings.notes ?? ''}
                className={accentFocusClass(ACCENT)}
                placeholder="e.g. slightly oversized blazer, sneakers untied"
                onChange={event => updateToolSettings({ notes: event.target.value })}
              />
            </label>
          </>
        ) : null}
      </ToolSection>

      {compareTryOns.length > 0 ? (
        <ToolSection
          title="Compare try-ons"
          description="Keep a winner as a Cast keeper, or skip to the next kit."
          data-testid="fitting-compare"
        >
          <CollapsibleSection
            title="Recent try-ons"
            summary="Side-by-side Keep / Skip for the last completed kits."
            defaultOpen={!leanChrome}
            persistKey="fitting-compare"
          >
            <div className="flex gap-3 overflow-x-auto pb-1">
              {compareTryOns.map(tryOn => (
                <figure
                  key={tryOn.promptId}
                  className="min-w-[7.5rem] shrink-0 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-2"
                >
                  {tryOn.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={tryOn.imageUrl}
                      alt={tryOn.wardrobeLabel || tryOn.wardrobeId || 'Try-on'}
                      className="mb-2 h-28 w-full rounded object-cover"
                    />
                  ) : null}
                  <figcaption className="type-caption truncate text-[var(--text-muted)]">
                    {tryOn.wardrobeLabel || tryOn.wardrobeId || 'Try-on'}
                  </figcaption>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={busy}
                      data-testid="fitting-keep"
                      onClick={() => keepTryOn(tryOn)}
                    >
                      Keep
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={skipKit}>
                      Skip
                    </Button>
                  </div>
                </figure>
              ))}
            </div>
            {continueDayHref ? (
              <div className="mt-3">
                <ButtonLink href={continueDayHref} size="sm" variant="primary">
                  Continue in Day
                </ButtonLink>
              </div>
            ) : null}
          </CollapsibleSection>
        </ToolSection>
      ) : null}

      <ToolActionRow>
        {continueDayHref ? (
          <ButtonLink
            href={continueDayHref}
            size="sm"
            variant="primary"
            data-testid="fitting-continue-day"
          >
            Continue in Day
          </ButtonLink>
        ) : null}
        <Button
          size="sm"
          variant="secondary"
          disabled={queueBlocked || swipeDeck.length < 2}
          onClick={skipKit}
        >
          Skip kit
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={queueBlocked}
          onClick={() => void queueTryOn()}
        >
          {busy ? 'Queueing…' : 'Queue try-on'}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={queueBlocked || swipeDeck.length < 2}
          onClick={() => void queueTryOnAndSwipe()}
        >
          Queue & next
        </Button>
        <Button size="sm" variant="secondary" disabled={busy} onClick={saveKitToCast}>
          Save kit to Cast
        </Button>
        <Button size="sm" variant="secondary" disabled={busy} onClick={goRoleplay}>
          Continue in Roleplay
        </Button>
        {character ? (
          <>
            {!continueDayHref ? (
              <ButtonLink
                href={dayPlannerHref}
                size="sm"
                variant="secondary"
                data-testid="fitting-plan-day"
                onClick={() => {
                  if (!character) {
                    return;
                  }
                  bumpPlayCampaignStep({ characterId: character.id, stepId: 'day' });
                }}
              >
                Plan a day
              </ButtonLink>
            ) : null}
            <ButtonLink
              href={`/moodboard?character=${encodeURIComponent(character.id)}`}
              size="sm"
              variant="secondary"
            >
              Set look (Moodboard)
            </ButtonLink>
            <ButtonLink
              href={`/gallery?character=${encodeURIComponent(character.id)}`}
              size="sm"
              variant="ghost"
            >
              Open in Gallery
            </ButtonLink>
          </>
        ) : null}
      </ToolActionRow>
      {saveStatus ? <p className="type-caption text-[var(--text-muted)]">{saveStatus}</p> : null}
      {error ? <FieldError>{error}</FieldError> : null}
      {isolateSubject && hasReference && toolSettings.referenceIsolated !== true && !error ? (
        <p className="type-caption text-[var(--text-muted)]">{ISOLATE_QUEUE_BLOCKED_MESSAGE}</p>
      ) : null}

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
        queueLabel="Queue try-on"
        onSendComfyUi={() => void queueTryOn()}
      />
    </ToolLayout>
  );
}
