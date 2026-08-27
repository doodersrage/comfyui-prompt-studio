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
import { applyCharacterRecord, addCharacterLookPack, getCharacter } from '@/lib/character-os';
import { getComfyModelDefinition } from '@/lib/comfy-models/client';
import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import { galleryPickPath } from '@/lib/gallery-handoff';
import { resolveFittingPlateFromCharacter } from '@/lib/fitting-room';
import { collectIsolateSourceUrls, loadImageBlobFromUrls } from '@/lib/isolate-subject';
import { sharedLlmRequestBody } from '@/lib/llm-request-options';
import {
  buildLookPackFromMoodboard,
  downloadLookPackFile,
  loadLookPack,
  lookPackDayHref,
  lookPackFittingHref,
  lookPackRoleplayHref,
  saveLookPack,
} from '@/lib/look-pack';
import { markOnboardingFirstPlayCampaign } from '@/lib/onboarding-hooks';
import { playCampaignHref } from '@/lib/play-campaign';
import {
  MOODBOARD_TEMPLATE_OPTIONS,
  MOODBOARD_TILE_ROLES,
  newMoodboardTileId,
  normalizeMoodboardTemplateId,
  normalizeMoodboardTiles,
  synthesizeMoodboardPrompt,
  type MoodboardTile,
  type MoodboardTileRole,
} from '@/lib/moodboard-scene';
import { resolveQueueInputImage } from '@/lib/queue-input-image';
import { getReformatTargetModel } from '@/lib/reformat-target';
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import { buildRoleplayQueueStillOptions } from '@/lib/roleplay-play-core';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import {
  DEFAULT_MOODBOARD_TOOL_CACHE,
  loadSettingsCache,
  saveSharedSettings,
} from '@/lib/settings-cache';

const ACCENT = 'cyan' as const;
const TOOL_ID = 'moodboard' as const;
const MAX_TILES = 4;

export default function MoodboardTool() {
  const router = useRouter();
  const description = useToolPageDescription(
    'Stack reference tiles, extract a look pack for Fitting / Day, or queue one scene still.',
    'Moodboard → look pack or scene still.'
  );
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } = useCachedSettings(
    'moodboard',
    DEFAULT_MOODBOARD_TOOL_CACHE
  );

  const [output, setOutput] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [lookStatus, setLookStatus] = useState<string | null>(null);
  const [activeTileId, setActiveTileId] = useState<string | null>(null);
  const [uploadingTileId, setUploadingTileId] = useState<string | null>(null);
  const deepLinkHandled = useRef(false);

  const tiles = useMemo(() => normalizeMoodboardTiles(toolSettings.tiles), [toolSettings.tiles]);
  const templateId = normalizeMoodboardTemplateId(toolSettings.templateId);
  const character = getCharacter(shared.activeCharacterId);
  const selectedModel = getComfyModelDefinition(shared.model);
  const plate = useMemo(() => resolveFittingPlateFromCharacter(character), [character]);
  const hasPlate = Boolean(plate?.filename || plate?.imageUrl);
  const activeTile = tiles.find(tile => tile.id === activeTileId) ?? tiles[0] ?? null;

  useEffect(() => {
    if (tiles.length === 0) {
      return;
    }
    if (!activeTileId || !tiles.some(tile => tile.id === activeTileId)) {
      scheduleAfterCommit(() => setActiveTileId(tiles[0]!.id));
    }
  }, [activeTileId, tiles]);

  useSeedToolDraft(mounted, {
    toolKey: TOOL_ID,
    label: 'Moodboard',
    href: '/moodboard',
    fields: [character?.name, toolSettings.instruction, tiles.map(tile => tile.label).join(', ')],
  });

  const actions = usePromptResultActions({
    tool: TOOL_ID,
    model: shared.model,
    detail: shared.detail,
    hints: toolSettings.instruction,
    autoFixRules: shared.autoFixRules !== false,
    reformatTarget: getReformatTargetModel(shared.model),
  });

  const persistTiles = useCallback(
    (next: MoodboardTile[]) => {
      updateToolSettings({ tiles: normalizeMoodboardTiles(next) });
    },
    [updateToolSettings]
  );

  const updateTile = useCallback(
    (tileId: string, patch: Partial<MoodboardTile>) => {
      persistTiles(tiles.map(tile => (tile.id === tileId ? { ...tile, ...patch } : tile)));
    },
    [persistTiles, tiles]
  );

  const addTile = useCallback(() => {
    if (tiles.length >= MAX_TILES) {
      return;
    }
    const id = newMoodboardTileId();
    persistTiles([...tiles, { id, role: 'mood' }]);
    setActiveTileId(id);
  }, [persistTiles, tiles]);

  const removeTile = useCallback(
    (tileId: string) => {
      const next = tiles.filter(tile => tile.id !== tileId);
      persistTiles(next);
      if (activeTileId === tileId) {
        setActiveTileId(next[0]?.id ?? null);
      }
    },
    [activeTileId, persistTiles, tiles]
  );

  const applyImageToTile = useCallback(
    async (tileId: string, input: { file?: File | null; imageUrl?: string; filename?: string }) => {
      const imageUrl = input.imageUrl?.trim() || '';
      const file = input.file ?? null;
      if (!file && !imageUrl && !input.filename?.trim()) {
        throw new Error('Choose a photo or gallery still first.');
      }
      setUploadingTileId(tileId);
      setError(null);
      try {
        const originalName = input.filename || file?.name || `moodboard-${tileId}.png`;
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
        const uploaded = await resolveQueueInputImage({
          file: sourceFile,
          filename: originalName,
          model: shared.model,
        });
        const filename = uploaded?.filename?.trim();
        if (!filename) {
          throw new Error('Upload did not return a filename.');
        }
        const viewUrl =
          collectIsolateSourceUrls({
            filename,
            comfyUrl,
          }).find(url => url.includes('/api/comfyui/view?')) ?? imageUrl;
        updateTile(tileId, {
          imageFilename: filename,
          imageUrl: viewUrl || imageUrl || undefined,
        });
      } finally {
        setUploadingTileId(null);
      }
    },
    [shared.model, updateTile]
  );

  useEffect(() => {
    if (!mounted || typeof window === 'undefined' || deepLinkHandled.current) {
      return;
    }
    deepLinkHandled.current = true;
    const characterId = new URLSearchParams(window.location.search).get('character')?.trim();
    if (!characterId) {
      return;
    }
    const record = getCharacter(characterId);
    if (!record) {
      return;
    }
    try {
      updateShared(applyCharacterRecord(record));
    } catch (err) {
      scheduleAfterCommit(() =>
        setError(err instanceof Error ? err.message : 'Could not apply that character.')
      );
    }
  }, [mounted, updateShared]);

  useGalleryHandoff('moodboard', handoff => {
    const tileId = activeTileId ?? tiles[0]?.id;
    if (!tileId) {
      const id = newMoodboardTileId();
      persistTiles([{ id, role: 'mood' }]);
      setActiveTileId(id);
      void applyImageToTile(id, {
        imageUrl: handoff.previewUrl ?? handoff.payload.imageUrl,
        filename: handoff.payload.imageFilename,
      }).catch(err => {
        setError(err instanceof Error ? err.message : 'Could not apply gallery still.');
      });
      return;
    }
    void applyImageToTile(tileId, {
      imageUrl: handoff.previewUrl ?? handoff.payload.imageUrl,
      filename: handoff.payload.imageFilename,
    }).catch(err => {
      setError(err instanceof Error ? err.message : 'Could not apply gallery still.');
    });
  });

  const buildPrompt = useCallback(() => {
    return synthesizeMoodboardPrompt({
      tiles,
      templateId,
      characterName: character?.name,
      characterDescriptor: character?.descriptor || character?.hints,
      instruction: toolSettings.instruction,
    });
  }, [
    character?.descriptor,
    character?.hints,
    character?.name,
    templateId,
    tiles,
    toolSettings.instruction,
  ]);

  const queueScene = useCallback(async () => {
    setBusy(true);
    setError(null);
    setCopied(false);
    actions.resetStatuses();
    try {
      const prompt = buildPrompt();
      const finalized = await actions.finalizePrompt(prompt, character?.name || 'Moodboard scene');
      setOutput(finalized);
      rememberDraftFields({
        toolKey: TOOL_ID,
        label: 'Moodboard',
        href: '/moodboard',
        fields: [character?.name ?? '', finalized],
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
      await actions.sendComfyUi(finalized, undefined, undefined, {
        ...(queueOptions ?? {}),
        characterId: shared.activeCharacterId,
        lookId: shared.activeLookId ?? character?.activeLookId,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not queue that scene.');
    } finally {
      setBusy(false);
    }
  }, [
    actions,
    buildPrompt,
    character,
    hasPlate,
    plate,
    shared.activeCharacterId,
    shared.activeLookId,
    shared.identityKind,
    shared.ipAdapterStrength,
  ]);

  const previewPrompt = useCallback(() => {
    setError(null);
    try {
      setOutput(buildPrompt());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not build prompt.');
    }
  }, [buildPrompt]);

  const blobToDataUrl = useCallback(async (blob: Blob): Promise<string> => {
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(new Error('Could not read image data.'));
      reader.readAsDataURL(blob);
    });
  }, []);

  const extractLookPack = useCallback(async () => {
    setExtracting(true);
    setError(null);
    setLookStatus(null);
    try {
      if (tiles.length === 0 && !toolSettings.instruction?.trim()) {
        throw new Error('Add at least one tile or a scene instruction before extracting a look.');
      }

      let vibePrompt = '';
      const imageTiles = tiles.filter(tile => tile.imageUrl?.trim() || tile.imageFilename?.trim());
      if (imageTiles.length > 0) {
        setLookStatus('Reading reference tiles…');
        const comfyUrl = loadComfyUiSettings().apiUrl?.trim() || undefined;
        const images = await Promise.all(
          imageTiles.slice(0, 4).map(async tile => {
            const blob = await loadImageBlobFromUrls(
              collectIsolateSourceUrls({
                imageUrl: tile.imageUrl,
                filename: tile.imageFilename,
                comfyUrl,
              })
            );
            return {
              image: await blobToDataUrl(blob),
              mimeType: blob.type || 'image/jpeg',
              role: tile.role,
              focus: 'style' as const,
            };
          })
        );
        const response = await fetch('/api/image-prompt/multi', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            images,
            model: shared.model,
            detail: shared.detail,
            descriptionPreset: 'standard',
            extraHints: toolSettings.instruction?.trim() || undefined,
            ...sharedLlmRequestBody(shared),
          }),
        });
        const data = (await response.json()) as { prompt?: string; error?: string };
        if (!response.ok || !data.prompt?.trim()) {
          throw new Error(data.error ?? 'Could not extract a look from the board.');
        }
        vibePrompt = data.prompt.trim();
      } else {
        vibePrompt = synthesizeMoodboardPrompt({
          tiles,
          templateId,
          characterName: character?.name,
          characterDescriptor: character?.descriptor || character?.hints,
          instruction: toolSettings.instruction,
        });
      }

      const pack = buildLookPackFromMoodboard({
        tiles,
        templateId,
        characterId: character?.id ?? shared.activeCharacterId,
        instruction: toolSettings.instruction,
        vibePrompt,
        wardrobeId: shared.lockedWardrobeId,
      });
      saveLookPack(pack);
      setOutput(vibePrompt);
      setLookStatus('Look pack ready — send it to Fitting or Day.');
      return pack;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not extract look pack.');
      return null;
    } finally {
      setExtracting(false);
    }
  }, [
    blobToDataUrl,
    character?.descriptor,
    character?.hints,
    character?.id,
    character?.name,
    shared,
    templateId,
    tiles,
    toolSettings.instruction,
  ]);

  const sendLookToFitting = useCallback(async () => {
    const pack = await extractLookPack();
    if (!pack) {
      return;
    }
    markOnboardingFirstPlayCampaign();
    router.push(lookPackFittingHref(pack));
  }, [extractLookPack, router]);

  const sendLookToDay = useCallback(async () => {
    const pack = await extractLookPack();
    if (!pack) {
      return;
    }
    markOnboardingFirstPlayCampaign();
    router.push(lookPackDayHref(pack));
  }, [extractLookPack, router]);

  const sendLookToRoleplay = useCallback(async () => {
    const pack = await extractLookPack();
    if (!pack) {
      return;
    }
    router.push(lookPackRoleplayHref(pack));
  }, [extractLookPack, router]);

  const saveLookPackToCast = useCallback(async () => {
    const pack = await extractLookPack();
    if (!pack || !character) {
      if (!character) {
        setError('Pick a Cast character before saving a look pack.');
      }
      return;
    }
    const defaultName = `Look ${new Date().toLocaleDateString()}`;
    const name =
      typeof window !== 'undefined'
        ? window.prompt('Name this look pack on Cast', defaultName)?.trim() || defaultName
        : defaultName;
    addCharacterLookPack(character.id, name, pack);
    setLookStatus(`Saved "${name}" on ${character.name}.`);
    markOnboardingFirstPlayCampaign();
  }, [character, extractLookPack]);

  const goRoleplay = useCallback(() => {
    if (character) {
      saveSharedSettings({
        ...loadSettingsCache().shared,
        ...applyCharacterRecord(character),
      });
      const staged = loadLookPack();
      if (staged) {
        router.push(lookPackRoleplayHref({ ...staged, characterId: character.id }));
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

  return (
    <ToolLayout
      accent={ACCENT}
      badge={
        <ToolBadge accent={ACCENT}>Moodboard · {selectedModel?.comfyNode ?? 'model'}</ToolBadge>
      }
      title="Moodboard → Scene"
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
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.moodboard} />

      <ToolSection
        title="Character (optional)"
        description="Attach a Cast character for subject notes and identity lock when a plate exists."
        data-testid="moodboard-character"
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
        title="Template"
        description="How the moodboard cues merge into the scene prompt."
      >
        <div className="flex flex-wrap gap-2">
          {MOODBOARD_TEMPLATE_OPTIONS.map(option => (
            <ChipButton
              key={option.id}
              active={templateId === option.id}
              disabled={busy}
              onClick={() => updateToolSettings({ templateId: option.id })}
            >
              {option.label}
            </ChipButton>
          ))}
        </div>
        <p className="type-caption mt-2 text-[var(--text-muted)]">
          {MOODBOARD_TEMPLATE_OPTIONS.find(entry => entry.id === templateId)?.hint}
        </p>
      </ToolSection>

      <ToolSection
        title="Reference tiles"
        description={`Up to ${MAX_TILES} tiles — role, notes, and optional still per tile.`}
        data-testid="moodboard-tiles"
      >
        {tiles.length === 0 ? (
          <p className="type-caption text-[var(--text-muted)]">
            No tiles yet — add one to start building the board.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tiles.map((tile, index) => (
              <ChipButton
                key={tile.id}
                active={activeTileId === tile.id}
                disabled={busy}
                onClick={() => setActiveTileId(tile.id)}
              >
                {tile.label?.trim() ||
                  MOODBOARD_TILE_ROLES.find(entry => entry.id === tile.role)?.label ||
                  `Tile ${index + 1}`}
              </ChipButton>
            ))}
          </div>
        )}
        <ToolActionRow className="mt-3">
          <Button
            size="sm"
            variant="secondary"
            disabled={busy || tiles.length >= MAX_TILES}
            onClick={addTile}
          >
            Add tile
          </Button>
          {activeTile ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => removeTile(activeTile.id)}
            >
              Remove tile
            </Button>
          ) : null}
        </ToolActionRow>

        {activeTile ? (
          <>
            <FieldDivider />
            <label className="space-y-2">
              <FieldLabel>Role</FieldLabel>
              <SelectInput
                value={activeTile.role}
                disabled={busy}
                className={accentFocusClass(ACCENT)}
                onChange={event =>
                  updateTile(activeTile.id, { role: event.target.value as MoodboardTileRole })
                }
              >
                {MOODBOARD_TILE_ROLES.map(role => (
                  <option key={role.id} value={role.id}>
                    {role.label}
                  </option>
                ))}
              </SelectInput>
            </label>
            <label className="mt-3 space-y-2">
              <FieldLabel>Label (optional)</FieldLabel>
              <TextArea
                rows={1}
                value={activeTile.label ?? ''}
                className={accentFocusClass(ACCENT)}
                placeholder="e.g. rainy neon alley"
                onChange={event => updateTile(activeTile.id, { label: event.target.value })}
              />
            </label>
            <label className="mt-3 space-y-2">
              <FieldLabel>Notes</FieldLabel>
              <TextArea
                rows={3}
                value={activeTile.notes ?? ''}
                className={accentFocusClass(ACCENT)}
                placeholder="What should this reference contribute?"
                onChange={event => updateTile(activeTile.id, { notes: event.target.value })}
              />
            </label>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                type="file"
                accept="image/*"
                disabled={busy || uploadingTileId === activeTile.id}
                className="ui-file-input block min-w-0 flex-1"
                onChange={event => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (!file) {
                    return;
                  }
                  void applyImageToTile(activeTile.id, { file }).catch(err => {
                    setError(err instanceof Error ? err.message : 'Could not upload that photo.');
                  });
                }}
              />
              <ButtonLink href={galleryPickPath('moodboard')} variant="secondary" size="sm">
                Choose from Gallery
              </ButtonLink>
            </div>
            {activeTile.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={activeTile.imageUrl}
                alt={activeTile.label || 'Moodboard reference'}
                className="mt-3 max-h-48 rounded-[var(--radius-md)] border border-[var(--border-subtle)] object-contain"
              />
            ) : (
              <p className="type-caption mt-2 text-[var(--text-muted)]">
                Optional reference still — used when extracting a look pack via vision; text notes
                always feed the scene prompt.
              </p>
            )}
          </>
        ) : null}
      </ToolSection>

      <ToolSection
        title="Scene direction"
        description="Optional instruction layered on top of the board."
      >
        <TextArea
          rows={3}
          value={toolSettings.instruction ?? ''}
          className={accentFocusClass(ACCENT)}
          placeholder="e.g. cinematic wide shot, subject centered, soft rim light"
          onChange={event => updateToolSettings({ instruction: event.target.value })}
        />
      </ToolSection>

      <ToolActionRow>
        <Button size="sm" variant="secondary" disabled={busy || extracting} onClick={previewPrompt}>
          Preview prompt
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={busy || extracting}
          onClick={() => void queueScene()}
        >
          {busy ? 'Queueing…' : 'Queue scene'}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy || extracting}
          data-testid="moodboard-extract-look"
          onClick={() => void extractLookPack()}
        >
          {extracting ? 'Extracting…' : 'Extract look'}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy || extracting}
          onClick={() => void sendLookToFitting()}
        >
          Use in Fitting
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy || extracting}
          onClick={() => void sendLookToDay()}
        >
          Use in Day
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy || extracting}
          onClick={() => void sendLookToRoleplay()}
        >
          Use in Roleplay
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy || extracting || !character}
          onClick={() => void saveLookPackToCast()}
        >
          Save on Cast
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy || extracting}
          onClick={() => {
            const pack = loadLookPack();
            if (!pack) {
              setLookStatus('Extract a look first.');
              return;
            }
            downloadLookPackFile({
              pack,
              name: character?.name ? `${character.name} look` : 'look-pack',
            });
            setLookStatus('Downloaded look pack JSON.');
          }}
        >
          Export JSON
        </Button>
        {character ? (
          <>
            <ButtonLink href={playCampaignHref(character.id)} size="sm" variant="ghost">
              Play campaign
            </ButtonLink>
            <ButtonLink
              href={`/day?character=${encodeURIComponent(character.id)}`}
              size="sm"
              variant="ghost"
            >
              Plan a day
            </ButtonLink>
            <ButtonLink
              href={`/fitting?character=${encodeURIComponent(character.id)}`}
              size="sm"
              variant="ghost"
            >
              Try on in Fitting
            </ButtonLink>
          </>
        ) : null}
        <Button size="sm" variant="secondary" disabled={busy || extracting} onClick={goRoleplay}>
          Continue in Roleplay
        </Button>
      </ToolActionRow>
      {lookStatus ? <p className="type-caption text-[var(--text-muted)]">{lookStatus}</p> : null}
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
        hints={toolSettings.instruction}
        queueLabel="Queue scene"
        onSendComfyUi={() => void queueScene()}
      />
    </ToolLayout>
  );
}
