'use client';

import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SharedToolControls from '@/components/SharedToolControls';
import RoleplayLibraryPanel from '@/components/RoleplayLibraryPanel';
import RoleplayBeatOutputSection from '@/components/roleplay/RoleplayBeatOutputSection';
import RoleplayBioSection from '@/components/roleplay/RoleplayBioSection';
import RoleplayCastSection from '@/components/roleplay/RoleplayCastSection';
import RoleplayStorySection from '@/components/roleplay/RoleplayStorySection';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { useGalleryHandoff } from '@/hooks/useGalleryHandoff';
import { useSeedToolDraft } from '@/hooks/useSeedToolDraft';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import { useRoleplayStorySync } from '@/hooks/useRoleplayStorySync';
import { getComfyModelDefinition } from '@/lib/comfy-models/client';
import { getReformatTargetModel } from '@/lib/reformat-target';
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import { dispatchWebhook } from '@/lib/webhook-settings';
import {
  buildRoleplayQueueStillOptions,
  buildRoleplayRequestBody,
  type RoleplayApiPayload,
} from '@/lib/roleplay-play-core';
import {
  DEFAULT_ROLEPLAY_TOOL_CACHE,
  DEFAULT_VIDEO_TOOL_CACHE,
  loadSettingsCache,
  loadToolSettings,
  saveSharedSettings,
} from '@/lib/settings-cache';
import {
  isSceneGenerationModel,
  resolvePreferredVideoModel,
  resolveTxt2iCounterpartForGenerate,
} from '@/lib/queue-tool-model';
import { loadComfyGallery } from '@/lib/comfyui-gallery';
import { loadComfyUiSettings } from '@/lib/comfyui-settings';
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
import {
  CUSTOM_ROLEPLAY_PERSONA_ID,
  ROLEPLAY_ARCHETYPES,
  ROLEPLAY_CONTENT,
  ROLEPLAY_TONES,
  appendRoleplayStoryBeat,
  beginRoleplayClipRetryPatch,
  beginRoleplayStillRetryPatch,
  canRetryRoleplayStill,
  getRoleplayArchetype,
  formatRoleplayStoryProgress,
  lastCompletedRoleplayStillUrl,
  lastRoleplayPlotBeat,
  lastRoleplayStillImage,
  mergeRoleplayRejectedScenes,
  normalizeRoleplayPlayAs,
  normalizeRoleplayIsolateSubject,
  patchRoleplayStoryBeat,
  resolveRoleplayToneAndContent,
  roleplayIntroScene,
  roleplayClipQueueResultPatch,
  roleplayClipTakes,
  roleplayStillQueueResultPatch,
  roleplayStillTakes,
  roleplayStoryPhase,
  selectRoleplayClipTakePatch,
  selectRoleplayStillTakePatch,
  type RoleplayBio,
  type RoleplayScene,
  type RoleplayStoryBeat,
} from '@/lib/roleplay';
import {
  lastRoleplayMotionSource,
  looksLikeVideoUrl,
  nextRoleplayMotionKind,
  normalizeRoleplayBeatOutput,
  shouldAutoQueueRoleplayClip,
} from '@/lib/roleplay-film';
import { extractVideoLastFrame } from '@/lib/video-last-frame';
import { canFalExtendFromParentUrl } from '@/lib/video-clip-mode';
import { resolveFalExtendParentUrl } from '@/lib/fal-extend-upload';
import { loadEngineSettings } from '@/lib/engine-settings';
import { isNsfwGeneratorEnabledClient } from '@/lib/nsfw-generator-env';
import { downloadRoleplayStoryBundle } from '@/lib/roleplay-export';
import { useRoleplayFilmActions } from '@/hooks/useRoleplayFilmActions';
import {
  applyCharacterRecord,
  getCharacter,
  getCharacterLookPack,
  upsertCharacterFromRoleplaySession,
} from '@/lib/character-os';
import { applyLookPackToRoleplaySettings, loadLookPack, saveLookPack } from '@/lib/look-pack';
import {
  applyRoleplayLibrarySession,
  archiveAndStartNewRoleplaySession,
  persistRoleplayLibraryFromCache,
  snapshotRoleplaySession,
  type RoleplayLibrarySession,
} from '@/lib/roleplay-library';
import { Button } from '@/components/ui/Button';
import { resolveLocalImageFile, scanStillWithVision } from '@/lib/vision-still-scan-client';
import { ToolBadge, ToolLayout, ToolSection } from '@/components/ui/ToolPageShell';

const ACCENT = 'amber' as const;
const TOOL_ID = 'roleplay';

export default function RoleplayTool() {
  const description = useToolPageDescription(
    'Cast yourself as someone (or something). Clip mode turns each beat into motion — still, then I2V, then Fal extend-video or last-frame I2V.',
    'Pick a character, write a bio, tap a scene — clips extend on Fal or continue from the last frame.'
  );
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } = useCachedSettings(
    'roleplay',
    DEFAULT_ROLEPLAY_TOOL_CACHE
  );
  const [scenes, setScenes] = useState<RoleplayScene[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [bioLoading, setBioLoading] = useState(false);
  const [scenesLoading, setScenesLoading] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [referencePreviewUrl, setReferencePreviewUrl] = useState<string | null>(null);
  const [referenceUploading, setReferenceUploading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [isolateStatus, setIsolateStatus] = useState<string | null>(null);
  const [ownBibleOpen, setOwnBibleOpen] = useState(false);

  const personaId = toolSettings.personaId ?? ROLEPLAY_ARCHETYPES[0].id;
  const adultEnabled = isNsfwGeneratorEnabledClient();
  const { tone, content } = resolveRoleplayToneAndContent(toolSettings.tone, toolSettings.content, {
    adultEnabled,
  });
  const playAs = normalizeRoleplayPlayAs(toolSettings.playAs);
  const bio = toolSettings.bio;
  const story = toolSettings.story ?? [];
  const storyProgress = formatRoleplayStoryProgress(story);
  const rejectedScenesMemory = useMemo(
    () => toolSettings.rejectedScenes ?? [],
    [toolSettings.rejectedScenes]
  );
  const autoQueue = toolSettings.autoQueue !== false;
  const beatOutput = normalizeRoleplayBeatOutput(toolSettings.beatOutput);
  const storyRef = useRef(toolSettings.story ?? []);
  const autoClipQueuedRef = useRef(new Set<string>());
  const queueBeatMotionRef = useRef<
    (
      beat: RoleplayStoryBeat,
      options?: {
        source?: { imageUrl: string; parentPromptId?: string; fromClip: boolean };
        retry?: boolean;
      }
    ) => Promise<void>
  >(async () => undefined);
  const isolateGenRef = useRef(0);
  const autoIsolateAttemptedRef = useRef(false);
  const deepLinkHandled = useRef(false);
  useEffect(() => {
    storyRef.current = toolSettings.story ?? [];
  }, [toolSettings.story]);
  const {
    assemblingFilm,
    filmStatus,
    filmNeedsCast,
    filmCharacterId,
    cutRoleplayFilm,
    saveFilmToCast,
    filmError,
    assembledFilmRef,
  } = useRoleplayFilmActions({
    toolSettings,
    storyRef,
    bioName: bio?.name,
  });

  useEffect(() => {
    if (!mounted) {
      return;
    }
    const timer = window.setTimeout(() => {
      const persisted = persistRoleplayLibraryFromCache(toolSettings);
      if (!persisted) {
        return;
      }
      const character = upsertCharacterFromRoleplaySession(persisted.session);
      if (character) {
        saveSharedSettings({
          ...loadSettingsCache().shared,
          ...applyCharacterRecord(character),
        });
      }
      if (
        persisted.cache.activeSessionId &&
        persisted.cache.activeSessionId !== toolSettings.activeSessionId
      ) {
        updateToolSettings({ activeSessionId: persisted.cache.activeSessionId });
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [mounted, toolSettings, updateToolSettings]);

  useEffect(() => {
    if (!mounted || typeof window === 'undefined' || deepLinkHandled.current) {
      return;
    }
    deepLinkHandled.current = true;
    const params = new URLSearchParams(window.location.search);
    const characterId = params.get('character')?.trim();
    const wardrobeId = params.get('wardrobe')?.trim();
    const lookPackId = params.get('lookPack')?.trim();
    const fromLook = params.get('from')?.trim() === 'look';

    if (characterId) {
      const record = getCharacter(characterId);
      if (record) {
        updateShared(applyCharacterRecord(record));
      }
    }
    if (wardrobeId) {
      updateShared({ lockedWardrobeId: wardrobeId });
    }

    let pack = fromLook ? loadLookPack({ clear: true }) : null;
    if (!pack && lookPackId && characterId) {
      pack = getCharacterLookPack(characterId, lookPackId)?.pack ?? null;
      if (pack) {
        saveLookPack(pack);
      }
    }
    if (pack) {
      const applied = applyLookPackToRoleplaySettings(pack);
      updateShared(applied.shared);
      updateToolSettings(applied.tool);
      if (pack.wardrobeId?.trim() && !wardrobeId) {
        updateShared({ lockedWardrobeId: pack.wardrobeId.trim() });
      }
    }
  }, [mounted, updateShared, updateToolSettings]);

  const referenceImageUrl = toolSettings.referenceImageUrl?.trim() || '';
  const referenceImageFilename = toolSettings.referenceImageFilename?.trim() || '';
  const hasReferenceImage = Boolean(referenceImageUrl || referenceImageFilename);
  const lastStill = lastRoleplayStillImage(story);
  const isolateSubject = normalizeRoleplayIsolateSubject(toolSettings.isolateSubject);
  const referenceOriginalUrl = toolSettings.referenceOriginalUrl?.trim() || '';
  const referenceOriginalFilename = toolSettings.referenceOriginalFilename?.trim() || '';
  const photoReady = playAs !== 'photo' || hasReferenceImage;

  const clearReferencePreview = useCallback(() => {
    setReferencePreviewUrl(current => {
      if (current?.startsWith('blob:')) {
        URL.revokeObjectURL(current);
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
        const originalName = input.filename || file?.name || `roleplay-ref-${Date.now()}.png`;
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
          playAs: 'photo',
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
      playAs: 'text',
      referenceImageUrl: '',
      referenceImageFilename: '',
      referenceOriginalUrl: '',
      referenceOriginalFilename: '',
      referenceIsolated: false,
    });
  }, [clearReferencePreview, updateToolSettings]);

  useEffect(() => {
    if (!mounted || playAs !== 'text') {
      return;
    }
    if (isSceneGenerationModel(shared.model)) {
      return;
    }
    const next = resolveTxt2iCounterpartForGenerate(shared.model);
    if (next !== shared.model) {
      updateShared({ model: next });
    }
  }, [mounted, playAs, shared.model, updateShared]);

  const applyGalleryHandoff = useCallback(
    (handoff: {
      file: File | null;
      previewUrl: string | null;
      payload: { imageFilename?: string; imageUrl?: string };
    }) => {
      void applyReference({
        file: handoff.file,
        imageUrl: handoff.previewUrl || handoff.payload.imageUrl,
        filename: handoff.payload.imageFilename,
      }).catch(err => {
        setError(err instanceof Error ? err.message : 'Could not use that still.');
      });
    },
    [applyReference]
  );
  useGalleryHandoff('roleplay', applyGalleryHandoff);

  const scanWithVision = useCallback(async () => {
    const preview = referencePreviewUrl || referenceImageUrl;
    if (!preview && !referenceImageFilename) {
      setError('Add a photo first.');
      return;
    }
    setScanning(true);
    setError(null);
    try {
      const image = await resolveLocalImageFile(null, preview, 'roleplay-photo.png');
      const prompt = await scanStillWithVision({
        image,
        purpose: 'roleplay-photo',
        model: shared.model,
        detail: shared.detail,
        extraHints: toolSettings.extraHints?.trim() || undefined,
        shared,
      });
      updateToolSettings({ extraHints: prompt });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Vision scan failed.');
    } finally {
      setScanning(false);
    }
  }, [
    referenceImageFilename,
    referenceImageUrl,
    referencePreviewUrl,
    shared,
    toolSettings.extraHints,
    updateToolSettings,
  ]);

  useEffect(() => {
    if (!mounted || playAs !== 'photo' || referenceUploading) {
      return;
    }
    if (!isolateSubject) {
      autoIsolateAttemptedRef.current = false;
      return;
    }
    if (toolSettings.referenceIsolated === true) {
      autoIsolateAttemptedRef.current = false;
      return;
    }
    const originalUrl = referenceOriginalUrl || referenceImageUrl;
    const originalFilename = referenceOriginalFilename || referenceImageFilename;
    if (!originalUrl && !originalFilename) {
      autoIsolateAttemptedRef.current = false;
      return;
    }
    if (autoIsolateAttemptedRef.current) {
      return;
    }
    autoIsolateAttemptedRef.current = true;
    void applyReference({
      imageUrl: originalUrl || IDENTITY_MEDIA_URL,
      filename: originalFilename || 'roleplay-ref.png',
      isolate: true,
    }).catch(err => {
      setError(err instanceof Error ? err.message : 'Could not isolate that photo.');
    });
  }, [
    applyReference,
    isolateSubject,
    mounted,
    playAs,
    referenceImageFilename,
    referenceImageUrl,
    referenceOriginalFilename,
    referenceOriginalUrl,
    referenceUploading,
    toolSettings.referenceIsolated,
  ]);

  const displayReferenceUrl = referencePreviewUrl || referenceImageUrl;

  useSeedToolDraft(mounted, {
    toolKey: TOOL_ID,
    label: 'Roleplay',
    href: '/roleplay',
    fields: [bio?.name, toolSettings.customPersona, toolSettings.extraHints, toolSettings.setting],
  });

  const actions = usePromptResultActions({
    tool: TOOL_ID,
    model: shared.model,
    detail: shared.detail,
    hints: [bio?.name, toolSettings.extraHints, toolSettings.setting].filter(Boolean).join(' · '),
    autoFixRules: shared.autoFixRules !== false,
    reformatTarget: getReformatTargetModel(shared.model),
  });

  const selectedModel = getComfyModelDefinition(shared.model);
  const lastPrompt = [...story].reverse().find(beat => beat.prompt?.trim())?.prompt;

  const requestBody = useCallback(
    (action: 'bio' | 'scenes' | 'prompt', situation?: RoleplayScene) =>
      buildRoleplayRequestBody({
        action,
        situation,
        shared,
        personaId,
        customPersona: toolSettings.customPersona,
        characterName: toolSettings.characterName,
        extraHints: toolSettings.extraHints,
        setting: toolSettings.setting,
        tone,
        content,
        allowGore: toolSettings.allowGore,
        hasReferenceImage: playAs === 'photo' && hasReferenceImage,
        isolatedSubject:
          playAs === 'photo' && hasReferenceImage && toolSettings.referenceIsolated === true,
        bio,
        story: toolSettings.story,
        rejectedScenes: mergeRoleplayRejectedScenes(rejectedScenesMemory, scenes),
      }),
    [
      bio,
      personaId,
      shared,
      tone,
      content,
      playAs,
      hasReferenceImage,
      toolSettings.customPersona,
      toolSettings.characterName,
      toolSettings.extraHints,
      toolSettings.setting,
      toolSettings.referenceIsolated,
      toolSettings.allowGore,
      toolSettings.story,
      rejectedScenesMemory,
      scenes,
    ]
  );

  const stampRoleplayCharacter = useCallback(
    (cache?: Partial<typeof toolSettings>) => {
      const session = snapshotRoleplaySession({
        ...toolSettings,
        ...cache,
        story: cache?.story ?? storyRef.current,
        bio: cache?.bio ?? toolSettings.bio,
      });
      if (!session) {
        return undefined;
      }
      const character = upsertCharacterFromRoleplaySession(session);
      if (character) {
        saveSharedSettings({
          ...loadSettingsCache().shared,
          ...applyCharacterRecord(character),
        });
      }
      return character;
    },
    [toolSettings]
  );

  const roleplayCharacterQueueFields = useCallback(
    (cache?: Partial<typeof toolSettings>) => {
      const character = stampRoleplayCharacter(cache);
      if (!character) {
        return {};
      }
      return {
        characterId: character.id,
        lookId: character.activeLookId,
      };
    },
    [stampRoleplayCharacter]
  );

  const queueStillOptions = useCallback(
    () =>
      buildRoleplayQueueStillOptions({
        photoMode: playAs === 'photo',
        isolateSubject,
        referenceIsolated: toolSettings.referenceIsolated === true,
        filename: referenceImageFilename,
        imageUrl: referenceImageUrl,
        identityLockStrength: shared.ipAdapterStrength,
        identityKind: shared.identityKind,
      }),
    [
      isolateSubject,
      playAs,
      referenceImageFilename,
      referenceImageUrl,
      shared.identityKind,
      shared.ipAdapterStrength,
      toolSettings.referenceIsolated,
    ]
  );

  useRoleplayStorySync(storyRef, patch => updateToolSettings(patch));

  const skipStillForClip = beatOutput === 'clip' && autoQueue;

  const commitStill = useCallback(
    async (
      data: RoleplayApiPayload,
      beat: RoleplayStoryBeat,
      nextBio: RoleplayBio,
      currentStory: RoleplayStoryBeat[],
      options?: { queueStill?: boolean }
    ) => {
      if (!data.prompt?.trim()) {
        throw new Error(data.error ?? 'Could not write a still.');
      }
      const prompt = await actions.finalizePrompt(data.prompt, beat.title);
      rememberDraftFields({
        toolKey: TOOL_ID,
        label: 'Roleplay',
        href: '/roleplay',
        fields: [nextBio.name, beat.title, prompt],
      });
      void dispatchWebhook({
        event: 'prompt.generated',
        tool: TOOL_ID,
        model: shared.model,
        prompt: prompt.slice(0, 500),
        completedAt: Date.now(),
      });
      let stillPatch: Partial<RoleplayStoryBeat> = { prompt };
      const queueStill = options?.queueStill ?? autoQueue;
      if (queueStill) {
        const promptId = await actions.sendComfyUi(prompt, undefined, undefined, {
          ...(queueStillOptions() ?? {}),
          ...roleplayCharacterQueueFields({ bio: nextBio, story: currentStory }),
        });
        stillPatch = {
          prompt,
          ...roleplayStillQueueResultPatch({ ...beat, prompt }, promptId),
        };
      }
      const nextStory = patchRoleplayStoryBeat(currentStory, beat, stillPatch);
      updateToolSettings({ bio: nextBio, story: nextStory });
      return nextStory;
    },
    [
      actions,
      autoQueue,
      queueStillOptions,
      roleplayCharacterQueueFields,
      shared.model,
      updateToolSettings,
    ]
  );

  const beginStoryFromBio = useCallback(
    async (nextBio: RoleplayBio) => {
      const intro = roleplayIntroScene(nextBio);
      const writingStory = appendRoleplayStoryBeat([], intro, {
        stillStatus: skipStillForClip ? undefined : 'writing',
      });
      const introBeat = writingStory[writingStory.length - 1];
      updateToolSettings({
        bio: nextBio,
        story: writingStory,
        rejectedScenes: [],
      });
      rememberDraftFields({
        toolKey: TOOL_ID,
        label: 'Roleplay',
        href: '/roleplay',
        fields: [nextBio.name, nextBio.look],
      });
      if (!introBeat) {
        return;
      }
      try {
        const [stillResponse, scenesResponse] = await Promise.all([
          fetch('/api/roleplay', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...requestBody('prompt', intro),
              bio: nextBio,
              story: [],
              rejectedScenes: [],
            }),
          }),
          fetch('/api/roleplay', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...requestBody('scenes'),
              bio: nextBio,
              story: writingStory,
              rejectedScenes: [],
            }),
          }).catch(() => null),
        ]);
        const stillData = (await stillResponse.json()) as RoleplayApiPayload;
        if (!stillResponse.ok || !stillData.prompt?.trim()) {
          throw new Error(
            stillData.error ??
              (skipStillForClip
                ? 'Bio saved, but the first clip prompt failed.'
                : 'Bio saved, but the first still failed.')
          );
        }
        await commitStill(stillData, introBeat, nextBio, writingStory, {
          queueStill: autoQueue && !skipStillForClip,
        });
        if (scenesResponse) {
          const scenesData = (await scenesResponse.json()) as RoleplayApiPayload;
          setScenes(scenesResponse.ok && Array.isArray(scenesData.scenes) ? scenesData.scenes : []);
        } else {
          setScenes([]);
        }
      } catch (err) {
        updateToolSettings({
          story: patchRoleplayStoryBeat(
            writingStory,
            introBeat,
            skipStillForClip ? {} : { stillStatus: 'error' }
          ),
        });
        throw err;
      }
    },
    [autoQueue, commitStill, requestBody, skipStillForClip, updateToolSettings]
  );

  const writeBio = useCallback(async () => {
    if (playAs === 'photo' && !hasReferenceImage) {
      setError('Upload a photo or pick a gallery still first.');
      return;
    }
    setBioLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/roleplay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody('bio')),
      });
      const data = (await response.json()) as RoleplayApiPayload;
      if (!response.ok || !data.bio) {
        throw new Error(data.error ?? 'Could not write a bio.');
      }
      await beginStoryFromBio(data.bio);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not write a bio.');
    } finally {
      setBioLoading(false);
    }
  }, [beginStoryFromBio, hasReferenceImage, playAs, requestBody]);

  const applyOwnBible = useCallback(
    async (nextBio: RoleplayBio) => {
      if (playAs === 'photo' && !hasReferenceImage) {
        setError('Upload a photo or pick a gallery still first.');
        return;
      }
      setError(null);
      const hasPlot = Boolean(lastRoleplayPlotBeat(storyRef.current));
      if (hasPlot || storyRef.current.length > 0) {
        updateToolSettings({ bio: nextBio });
        setOwnBibleOpen(false);
        return;
      }
      setBioLoading(true);
      try {
        await beginStoryFromBio(nextBio);
        setOwnBibleOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not start from this bible.');
      } finally {
        setBioLoading(false);
      }
    },
    [beginStoryFromBio, hasReferenceImage, playAs, updateToolSettings]
  );

  const rememberRejectedScenes = useCallback(
    (offered: RoleplayScene[], chosen?: RoleplayScene | null) => {
      const next = mergeRoleplayRejectedScenes(rejectedScenesMemory, offered, chosen);
      updateToolSettings({ rejectedScenes: next });
      return next;
    },
    [rejectedScenesMemory, updateToolSettings]
  );

  const rollScenes = useCallback(async () => {
    if (!bio) {
      setError('Write a bio first — the scenes need someone to happen to.');
      return;
    }
    if (roleplayStoryPhase(storyRef.current) === 'complete') {
      setScenes([]);
      return;
    }
    setScenesLoading(true);
    setError(null);
    try {
      const rejectedScenes = rememberRejectedScenes(scenes);
      const response = await fetch('/api/roleplay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...requestBody('scenes'),
          rejectedScenes,
        }),
      });
      const data = (await response.json()) as RoleplayApiPayload;
      if (!response.ok) {
        throw new Error(data.error ?? 'Could not roll scenes.');
      }
      setScenes(Array.isArray(data.scenes) ? data.scenes : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not roll scenes.');
    } finally {
      setScenesLoading(false);
    }
  }, [bio, rememberRejectedScenes, requestBody, scenes]);

  const playScene = useCallback(
    async (scene: RoleplayScene) => {
      if (!bio) {
        setError('Write a bio first.');
        return;
      }
      if (playAs === 'photo' && !hasReferenceImage) {
        setError('Upload a photo or pick a gallery still first.');
        return;
      }
      if (roleplayStoryPhase(storyRef.current) === 'complete') {
        setError('This story already ended. Restart to play another.');
        return;
      }
      setPlayingId(scene.id);
      setError(null);
      const playing: RoleplayScene =
        roleplayStoryPhase(storyRef.current) === 'finale' ? { ...scene, kind: 'ending' } : scene;
      const rejectedScenes = rememberRejectedScenes(scenes, playing);
      const writingStory = appendRoleplayStoryBeat(storyRef.current, playing, {
        stillStatus: skipStillForClip ? undefined : 'writing',
      });
      const beat = writingStory[writingStory.length - 1];
      if (!beat) {
        setPlayingId(null);
        return;
      }
      updateToolSettings({ story: writingStory, rejectedScenes });
      try {
        const response = await fetch('/api/roleplay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody('prompt', playing)),
        });
        const data = (await response.json()) as RoleplayApiPayload;
        if (!response.ok || !data.prompt?.trim()) {
          throw new Error(data.error ?? 'Could not write a still.');
        }
        const nextStory = await commitStill(data, beat, bio, writingStory, {
          queueStill: autoQueue && !skipStillForClip,
        });
        if (roleplayStoryPhase(nextStory) === 'complete') {
          setScenes([]);
          return;
        }
        const nextScenes = await fetch('/api/roleplay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...requestBody('scenes'),
            story: nextStory,
            rejectedScenes,
          }),
        });
        const nextPayload = (await nextScenes.json()) as RoleplayApiPayload;
        if (nextScenes.ok && Array.isArray(nextPayload.scenes)) {
          setScenes(nextPayload.scenes);
        }
      } catch (err) {
        updateToolSettings({
          story: writingStory.filter(entry => entry.at !== beat.at || entry.prompt),
        });
        setError(err instanceof Error ? err.message : 'Could not play that scene.');
      } finally {
        setPlayingId(null);
      }
    },
    [
      autoQueue,
      bio,
      commitStill,
      hasReferenceImage,
      playAs,
      rememberRejectedScenes,
      requestBody,
      scenes,
      skipStillForClip,
      updateToolSettings,
    ]
  );

  const queueBeat = useCallback(
    async (beat: RoleplayStoryBeat, options?: { retry?: boolean }) => {
      const prompt = beat.prompt?.trim();
      if (!prompt) {
        return;
      }
      const latest =
        storyRef.current.find(entry => entry.id === beat.id && entry.at === beat.at) ?? beat;
      const retry = options?.retry === true || canRetryRoleplayStill(latest);
      setError(null);
      const startPatch = retry
        ? beginRoleplayStillRetryPatch(latest)
        : { stillStatus: 'writing' as const };
      updateToolSettings({
        story: patchRoleplayStoryBeat(storyRef.current, latest, startPatch),
      });
      const parentPromptId = retry
        ? roleplayStillTakes(latest)
            .map(take => take.promptId?.trim())
            .filter((id): id is string => Boolean(id))
            .at(-1)
        : undefined;
      const parentEntry = parentPromptId
        ? loadComfyGallery().find(entry => entry.promptId === parentPromptId)
        : undefined;
      let promptId: string | undefined;
      try {
        promptId = await actions.sendComfyUi(prompt, undefined, undefined, {
          ...(queueStillOptions() ?? {}),
          ...roleplayCharacterQueueFields(),
          ...(retry
            ? {
                derivedKind: 'variation' as const,
                parentGalleryEntryId: parentEntry?.id,
              }
            : {}),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not queue a still.');
      }
      const after = storyRef.current.find(
        entry => entry.id === latest.id && entry.at === latest.at
      ) ?? {
        ...latest,
        ...startPatch,
      };
      updateToolSettings({
        story: patchRoleplayStoryBeat(
          storyRef.current,
          latest,
          roleplayStillQueueResultPatch(after, promptId)
        ),
      });
    },
    [actions, queueStillOptions, roleplayCharacterQueueFields, updateToolSettings]
  );

  const queueBeatMotion = useCallback(
    async (
      beat: RoleplayStoryBeat,
      options?: {
        source?: { imageUrl: string; parentPromptId?: string; fromClip: boolean };
        retry?: boolean;
      }
    ) => {
      const latest =
        storyRef.current.find(entry => entry.id === beat.id && entry.at === beat.at) ?? beat;
      const retry = options?.retry === true;
      const stillUrl = lastCompletedRoleplayStillUrl(latest) || latest.imageUrl?.trim() || '';
      const source =
        retry || !options?.source
          ? stillUrl
            ? {
                imageUrl: stillUrl,
                parentPromptId: latest.promptId?.trim(),
                fromClip: false,
              }
            : playAs === 'photo' && referenceImageUrl
              ? { imageUrl: referenceImageUrl, fromClip: false }
              : null
          : options.source;
      const hasInit = Boolean(source?.imageUrl);
      if (!hasInit && !latest.prompt?.trim() && !latest.blurb?.trim()) {
        setError('Write a beat prompt, or add a still, before queueing a clip.');
        return;
      }

      const startPatch = retry
        ? beginRoleplayClipRetryPatch(latest)
        : { clipStatus: 'writing' as const };
      updateToolSettings({
        story: patchRoleplayStoryBeat(storyRef.current, latest, startPatch),
      });

      const engine = loadEngineSettings().engine;
      const parentClipUrl = source?.fromClip ? source.imageUrl : '';
      let extendUrl =
        engine === 'fal' && canFalExtendFromParentUrl(parentClipUrl) ? parentClipUrl : '';
      let falUploadNote: string | null = null;
      if (engine === 'fal' && !extendUrl && parentClipUrl && looksLikeVideoUrl(parentClipUrl)) {
        const resolved = await resolveFalExtendParentUrl({
          parentUrl: parentClipUrl,
          falApiKey: loadSettingsCache().shared.sessionFalApiKey,
        });
        if (resolved.url) {
          extendUrl = resolved.url;
        } else if (resolved.uploadAttempted) {
          falUploadNote =
            resolved.uploadError?.trim() ||
            'Could not upload that local clip to Fal for extend-video.';
        }
      }
      const useFalExtend = Boolean(extendUrl);
      if (falUploadNote && !useFalExtend) {
        setError(`${falUploadNote} Continuing from the last frame instead.`);
      }

      let inputImage: File | undefined;
      let inputImageUrl: string | undefined = useFalExtend ? undefined : source?.imageUrl;
      if (!useFalExtend && source?.imageUrl && looksLikeVideoUrl(source.imageUrl)) {
        try {
          const blob = await extractVideoLastFrame(source.imageUrl);
          inputImage = new File([blob], 'roleplay-last-frame.jpg', {
            type: blob.type || 'image/jpeg',
          });
          inputImageUrl = undefined;
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not read the last frame.');
          updateToolSettings({
            story: patchRoleplayStoryBeat(
              storyRef.current,
              latest,
              roleplayClipQueueResultPatch(
                storyRef.current.find(
                  entry => entry.id === latest.id && entry.at === latest.at
                ) ?? {
                  ...latest,
                  ...startPatch,
                },
                undefined
              )
            ),
          });
          return;
        }
      }

      const parentClipPromptId = retry
        ? roleplayClipTakes(latest)
            .map(take => take.clipPromptId?.trim())
            .filter((id): id is string => Boolean(id))
            .at(-1)
        : source?.parentPromptId;
      const parentEntry = parentClipPromptId
        ? loadComfyGallery().find(entry => entry.promptId === parentClipPromptId)
        : latest.promptId
          ? loadComfyGallery().find(entry => entry.promptId === latest.promptId)
          : undefined;
      const videoModel = resolvePreferredVideoModel({
        toolModel: loadToolSettings('video', DEFAULT_VIDEO_TOOL_CACHE).model,
        sharedModel: shared.model,
      });
      if (!falUploadNote) {
        setError(null);
      }
      let prompt = latest.prompt?.trim() || latest.blurb;
      try {
        const response = await fetch('/api/video-prompt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subject: latest.title,
            motion: latest.prompt?.trim() || latest.blurb,
            model: videoModel,
            durationSec: 4,
          }),
        });
        const data = (await response.json()) as { prompt?: string };
        if (data.prompt?.trim()) {
          prompt = data.prompt.trim();
        }
      } catch {
        /* use beat prompt */
      }
      let promptId: string | undefined;
      try {
        promptId = await actions.sendComfyUi(prompt, undefined, undefined, {
          queueTool: 'video',
          queueModel: videoModel,
          inputImage: hasInit ? inputImage : undefined,
          inputImageUrl: hasInit ? inputImageUrl : undefined,
          parentGalleryEntryId: parentEntry?.id,
          derivedKind: retry
            ? 'variation'
            : useFalExtend
              ? 'extend'
              : hasInit
                ? nextRoleplayMotionKind(parentEntry)
                : 't2v',
          clipMode: retry
            ? hasInit
              ? 'i2v'
              : 't2v'
            : useFalExtend
              ? 'extend'
              : hasInit
                ? 'i2v'
                : 't2v',
          videoUrl: retry || !useFalExtend ? undefined : extendUrl,
          qualityProfile: 'final',
          queueParamsBase: { videoFrames: 64, videoFps: 16 },
          ...roleplayCharacterQueueFields(),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not queue that clip.');
      }
      const after = storyRef.current.find(
        entry => entry.id === latest.id && entry.at === latest.at
      ) ?? {
        ...latest,
        ...startPatch,
      };
      updateToolSettings({
        story: patchRoleplayStoryBeat(
          storyRef.current,
          latest,
          roleplayClipQueueResultPatch(after, promptId)
        ),
      });
    },
    [
      actions,
      playAs,
      referenceImageUrl,
      roleplayCharacterQueueFields,
      shared.model,
      updateToolSettings,
    ]
  );

  useEffect(() => {
    queueBeatMotionRef.current = queueBeatMotion;
  }, [queueBeatMotion]);

  useEffect(() => {
    if (beatOutput !== 'clip' || !autoQueue) {
      return;
    }
    for (const beat of toolSettings.story ?? []) {
      const key = `${beat.id}:${beat.at}:${beat.imageUrl ?? ''}`;
      if (autoClipQueuedRef.current.has(key) || !shouldAutoQueueRoleplayClip(beat)) {
        continue;
      }
      autoClipQueuedRef.current.add(key);
      void queueBeatMotion(beat);
    }
  }, [autoQueue, beatOutput, queueBeatMotion, toolSettings.story]);

  const selectStillTake = useCallback(
    (beat: RoleplayStoryBeat, index: number) => {
      const latest =
        storyRef.current.find(entry => entry.id === beat.id && entry.at === beat.at) ?? beat;
      updateToolSettings({
        story: patchRoleplayStoryBeat(
          storyRef.current,
          latest,
          selectRoleplayStillTakePatch(latest, index)
        ),
      });
    },
    [updateToolSettings]
  );

  const selectClipTake = useCallback(
    (beat: RoleplayStoryBeat, index: number) => {
      const latest =
        storyRef.current.find(entry => entry.id === beat.id && entry.at === beat.at) ?? beat;
      updateToolSettings({
        story: patchRoleplayStoryBeat(
          storyRef.current,
          latest,
          selectRoleplayClipTakePatch(latest, index)
        ),
      });
    },
    [updateToolSettings]
  );

  const copyBeatPrompt = useCallback(async (beat: RoleplayStoryBeat) => {
    const prompt = beat.prompt?.trim();
    if (!prompt) {
      return;
    }
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      setError('Could not copy to clipboard.');
    }
  }, []);

  const downloadStory = useCallback(async () => {
    if (!bio && storyRef.current.length === 0) {
      setError('Write a bio or a beat first.');
      return;
    }
    setExporting(true);
    setError(null);
    try {
      const personaLabel =
        personaId === CUSTOM_ROLEPLAY_PERSONA_ID
          ? toolSettings.customPersona?.trim() || 'Custom'
          : (getRoleplayArchetype(personaId)?.label ?? personaId);
      const toneLabel = ROLEPLAY_TONES.find(entry => entry.id === tone)?.label ?? tone;
      const contentLabel = ROLEPLAY_CONTENT.find(entry => entry.id === content)?.label ?? content;
      await downloadRoleplayStoryBundle({
        bio,
        story: storyRef.current,
        tone: toneLabel,
        content: contentLabel,
        personaLabel,
        film: assembledFilmRef.current,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not download the story.');
    } finally {
      setExporting(false);
    }
  }, [assembledFilmRef, bio, content, personaId, tone, toolSettings.customPersona]);

  const shelfAndStartNew = useCallback(
    (patch?: Partial<typeof toolSettings>) => {
      const { next } = archiveAndStartNewRoleplaySession(toolSettings);
      updateToolSettings({ ...next, ...patch });
      setScenes([]);
      setOwnBibleOpen(false);
    },
    [toolSettings, updateToolSettings]
  );

  const restartStory = useCallback(() => {
    updateToolSettings({ story: [], rejectedScenes: [] });
    setScenes([]);
  }, [updateToolSettings]);

  const surpriseCast = useCallback(() => {
    const pick = ROLEPLAY_ARCHETYPES[Math.floor(Math.random() * ROLEPLAY_ARCHETYPES.length)];
    shelfAndStartNew({ personaId: pick.id, customPersona: undefined });
  }, [shelfAndStartNew]);

  const continueLibrarySession = useCallback(
    (session: RoleplayLibrarySession) => {
      persistRoleplayLibraryFromCache(toolSettings);
      updateToolSettings(applyRoleplayLibrarySession(session));
      stampRoleplayCharacter(applyRoleplayLibrarySession(session));
      setScenes([]);
      setOwnBibleOpen(false);
    },
    [stampRoleplayCharacter, toolSettings, updateToolSettings]
  );

  const startLibrarySession = useCallback(() => {
    shelfAndStartNew();
  }, [shelfAndStartNew]);

  if (!mounted) {
    return null;
  }

  const busy =
    bioLoading ||
    scenesLoading ||
    Boolean(playingId) ||
    exporting ||
    assemblingFilm ||
    scanning ||
    referenceUploading;

  return (
    <ToolLayout
      accent={ACCENT}
      badge={<ToolBadge accent={ACCENT}>Roleplay · {selectedModel.comfyNode}</ToolBadge>}
      title="Roleplay"
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
          recommendFromText={lastPrompt || bio?.look}
          toolId={TOOL_ID}
          preferEditModels={playAs === 'photo'}
          onSharedSettingsChange={updateShared}
          variant="roleplay"
        />
      }
    >
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.roleplay} />

      <RoleplayCastSection
        busy={busy}
        bioLoading={bioLoading}
        bio={bio}
        story={story}
        storyPhase={storyProgress.phase}
        personaId={personaId}
        playAs={playAs}
        tone={tone}
        content={content}
        adultEnabled={adultEnabled}
        autoQueue={autoQueue}
        beatOutput={beatOutput}
        photoReady={photoReady}
        ownBibleOpen={ownBibleOpen}
        toolSettings={toolSettings}
        isolateSubject={isolateSubject}
        hasReferenceImage={hasReferenceImage}
        scanning={scanning}
        referenceUploading={referenceUploading}
        isolateStatus={isolateStatus}
        displayReferenceUrl={displayReferenceUrl}
        referenceOriginalFilename={referenceOriginalFilename}
        referenceOriginalUrl={referenceOriginalUrl}
        referenceImageFilename={referenceImageFilename}
        referenceImageUrl={referenceImageUrl}
        lastStill={lastStill}
        onOwnBibleOpenChange={setOwnBibleOpen}
        onUpdateToolSettings={updateToolSettings}
        onShelfAndStartNew={shelfAndStartNew}
        onApplyOwnBible={nextBio => void applyOwnBible(nextBio)}
        onClearReference={clearReference}
        onApplyReference={applyReference}
        onReferencePreviewUrlChange={setReferencePreviewUrl}
        onIsolateStatusChange={setIsolateStatus}
        onError={setError}
        onScanWithVision={() => void scanWithVision()}
        onWriteBio={() => void writeBio()}
        onSurpriseCast={surpriseCast}
        onRestartStory={restartStory}
      />

      <ToolSection title="Library">
        <RoleplayLibraryPanel
          activeSessionId={toolSettings.activeSessionId}
          busy={busy}
          onContinue={continueLibrarySession}
          onNew={startLibrarySession}
          onDeleted={id => {
            if (id === toolSettings.activeSessionId) {
              updateToolSettings({ activeSessionId: undefined });
            }
          }}
        />
      </ToolSection>

      {bio ? (
        <RoleplayBioSection
          bio={bio}
          ownBibleOpen={ownBibleOpen}
          characterName={toolSettings.characterName}
          busy={busy}
          onOpenEditor={() => setOwnBibleOpen(true)}
          onApplyBible={nextBio => void applyOwnBible(nextBio)}
        />
      ) : null}

      <RoleplayStorySection
        beatOutput={beatOutput}
        autoQueue={autoQueue}
        assemblingFilm={assemblingFilm}
        busy={busy}
        story={story}
        filmNeedsCast={filmNeedsCast}
        filmCharacterId={filmCharacterId}
        filmStatus={filmStatus}
        downloadAction={
          <Button
            variant="secondary"
            loading={exporting}
            loadingLabel="Packing story"
            disabled={(!bio && story.length === 0) || (busy && !exporting)}
            onClick={() => void downloadStory()}
          >
            Download story + stills + clips
          </Button>
        }
        onCutFilm={() => void cutRoleplayFilm()}
        onSaveToCast={saveFilmToCast}
        onQueue={beat => void queueBeat(beat)}
        onRetry={beat => void queueBeat(beat, { retry: true })}
        onRetryClip={beat => void queueBeatMotion(beat, { retry: true })}
        onAnimate={beat => void queueBeatMotion(beat)}
        onExtend={beat => {
          const source =
            beat.clipStatus === 'completed' && beat.clipUrl?.trim()
              ? {
                  imageUrl: beat.clipUrl.trim(),
                  parentPromptId: beat.clipPromptId?.trim() || beat.promptId?.trim(),
                  fromClip: true,
                }
              : (lastRoleplayMotionSource(storyRef.current) ?? undefined);
          void queueBeatMotion(beat, source ? { source } : undefined);
        }}
        onSelectTake={selectStillTake}
        onSelectClipTake={selectClipTake}
        onCopy={beat => void copyBeatPrompt(beat)}
      />

      <RoleplayBeatOutputSection
        storyProgress={storyProgress}
        beatOutput={beatOutput}
        autoQueue={autoQueue}
        busy={busy}
        bioPresent={Boolean(bio)}
        scenesLoading={scenesLoading}
        scenes={scenes}
        playingId={playingId}
        error={error}
        filmError={filmError}
        onRestartStory={restartStory}
        onBeatOutputChange={next => updateToolSettings({ beatOutput: next })}
        onAutoQueueChange={next => updateToolSettings({ autoQueue: next })}
        onRollScenes={() => void rollScenes()}
        onPlayScene={scene => void playScene(scene)}
      />
    </ToolLayout>
  );
}
