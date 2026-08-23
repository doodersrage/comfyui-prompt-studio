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
  ToolActionRow,
  ToolBadge,
  ToolLayout,
  ToolSection,
  accentFocusClass,
} from '@/components/ui/ToolPageShell';
import { useCachedSettings } from '@/hooks/useCachedSettings';
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
import { getComfyModelDefinition } from '@/lib/comfy-models/client';
import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import { buildFittingOutfitPrompt, resolveFittingPlateFromCharacter } from '@/lib/fitting-room';
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
import { resolveQueueInputImage } from '@/lib/queue-input-image';
import { getReformatTargetModel } from '@/lib/reformat-target';
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import { buildRoleplayQueueStillOptions } from '@/lib/roleplay-play-core';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import {
  DEFAULT_FITTING_TOOL_CACHE,
  loadSettingsCache,
  saveSharedSettings,
} from '@/lib/settings-cache';

const ACCENT = 'rose' as const;
const TOOL_ID = 'fitting' as const;

type ClothingOption = { value: string; label: string; group?: string };

export default function FittingRoomTool() {
  const router = useRouter();
  const description = useToolPageDescription(
    'Lock a Cast plate, pick a catalog kit, queue an outfit try-on still.',
    'Try outfits on a Cast character — plate + wardrobe kit → img2img still.'
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
  const [wardrobeOptions, setWardrobeOptions] = useState<ClothingOption[]>([
    { value: '', label: 'Pick a kit…' },
  ]);
  const [wardrobeLoadedKey, setWardrobeLoadedKey] = useState<string | null>(null);
  const wardrobeOptionsKey = `wardrobeCatalog:${clothingGender}`;
  const wardrobeReady = wardrobeLoadedKey === wardrobeOptionsKey;
  const [lockedWardrobeLabel, setLockedWardrobeLabel] = useState<string | undefined>();
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const isolateGenRef = useRef(0);
  const deepLinkHandled = useRef(false);

  const isolateSubject = toolSettings.isolateSubject !== false;
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
  }, [applyReference, mounted, updateShared]);

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

  const queueTryOn = useCallback(async () => {
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
      await actions.sendComfyUi(finalized, undefined, undefined, {
        ...(queueOptions ?? {}),
        characterId: shared.activeCharacterId,
        lookId: shared.activeLookId ?? character?.activeLookId,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not queue the try-on.');
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
    toolSettings.referenceIsolated,
  ]);

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
    }
    router.push('/roleplay');
  }, [character, router]);

  const wardrobeGroups = useMemo(() => {
    const groups = new Map<string, ClothingOption[]>();
    for (const option of wardrobeOptions) {
      if (!option.group) {
        continue;
      }
      if (!groups.has(option.group)) {
        groups.set(option.group, []);
      }
      groups.get(option.group)!.push(option);
    }
    return groups;
  }, [wardrobeOptions]);

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
        description="Catalog outfit locked for this try-on and Cast."
      >
        <label className="space-y-2">
          <FieldLabel>Outfit</FieldLabel>
          <SelectInput
            value={shared.lockedWardrobeId ?? ''}
            disabled={!wardrobeReady || busy}
            className={accentFocusClass(ACCENT)}
            onChange={event => {
              const value = event.target.value.trim();
              updateShared({ lockedWardrobeId: value || undefined });
            }}
          >
            {wardrobeOptions
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
      </ToolSection>

      <ToolActionRow>
        <Button
          size="sm"
          variant="primary"
          disabled={queueBlocked}
          onClick={() => void queueTryOn()}
        >
          {busy ? 'Queueing…' : 'Queue try-on'}
        </Button>
        <Button size="sm" variant="secondary" disabled={busy} onClick={saveKitToCast}>
          Save kit to Cast
        </Button>
        <Button size="sm" variant="secondary" disabled={busy} onClick={goRoleplay}>
          Continue in Roleplay
        </Button>
        {character ? (
          <>
            <ButtonLink
              href={`/day?character=${encodeURIComponent(character.id)}`}
              size="sm"
              variant="secondary"
            >
              Plan a day
            </ButtonLink>
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
