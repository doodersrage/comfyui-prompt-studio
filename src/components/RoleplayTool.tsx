'use client';

import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';

import { useCallback, useEffect, useRef, useState } from 'react';
import SharedToolControls from '@/components/SharedToolControls';
import RoleplayLibraryPanel from '@/components/RoleplayLibraryPanel';
import RoleplayStoryReel from '@/components/RoleplayStoryReel';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { useGalleryHandoff } from '@/hooks/useGalleryHandoff';
import { useSeedToolDraft } from '@/hooks/useSeedToolDraft';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import { getComfyModelDefinition } from '@/lib/comfy-models/client';
import { getReformatTargetModel } from '@/lib/reformat-target';
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import { avoidedTokensRequestBody } from '@/lib/avoided-tokens';
import { sharedLlmRequestBody } from '@/lib/llm-request-options';
import { dispatchWebhook } from '@/lib/webhook-settings';
import { DEFAULT_ROLEPLAY_TOOL_CACHE } from '@/lib/settings-cache';
import { isSceneGenerationModel, resolveTxt2iCounterpartForGenerate } from '@/lib/queue-tool-model';
import {
  COMFYUI_GALLERY_UPDATED_EVENT,
  galleryEntryPrimaryViewUrl,
  loadComfyGallery,
} from '@/lib/comfyui-gallery';
import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import {
  cacheBustIdentityMediaUrl,
  IDENTITY_MEDIA_URL,
  isIdentityMediaUrl,
  persistIdentityImage,
} from '@/lib/gallery-media-client';
import { galleryPickPath } from '@/lib/gallery-handoff';
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
  ROLEPLAY_PLAY_AS,
  ROLEPLAY_SETTING_PRESETS,
  ROLEPLAY_TONES,
  appendRoleplayStoryBeat,
  beginRoleplayStillRetryPatch,
  canRetryRoleplayStill,
  applyRoleplayCharacterName,
  formatRoleplayBio,
  getRoleplayArchetype,
  MAX_ROLEPLAY_CHARACTER_NAME,
  lastRoleplayStillImage,
  mergeRoleplayStoryStills,
  normalizeRoleplayPlayAs,
  normalizeRoleplayIsolateSubject,
  patchRoleplayStoryBeat,
  resolveRoleplayToneAndContent,
  roleplayIntroScene,
  roleplayStillQueueResultPatch,
  roleplayStillTakes,
  roleplayStoryPromptIds,
  rollRoleplaySetting,
  selectRoleplayStillTakePatch,
  type RoleplayBio,
  type RoleplayScene,
  type RoleplayStoryBeat,
} from '@/lib/roleplay';
import { downloadRoleplayStoryBundle } from '@/lib/roleplay-export';
import {
  applyRoleplayLibrarySession,
  persistRoleplayLibraryFromCache,
  startNewRoleplaySession,
  type RoleplayLibrarySession,
} from '@/lib/roleplay-library';
import type { EnrichedToolGenerateResult } from '@/lib/specialized/types';
import { ChipButton, FieldError, TextArea, TextInput } from '@/components/ui/Field';
import { Button, ButtonLink } from '@/components/ui/Button';
import {
  ToolBadge,
  ToolLayout,
  ToolSection,
  accentFocusClass,
} from '@/components/ui/ToolPageShell';

const ACCENT = 'amber' as const;
const TOOL_ID = 'roleplay';

type RoleplayApiPayload = EnrichedToolGenerateResult & {
  error?: string;
  bio?: RoleplayBio;
  scenes?: RoleplayScene[];
  provider?: 'llm' | 'template';
};

export default function RoleplayTool() {
  const description = useToolPageDescription(
    'Cast yourself as someone (or something). Upload a photo to play as yourself, or pick a generated still.',
    'Pick a character, write a bio, tap a scene — stills show up in the story as they render.'
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
  const [isolateStatus, setIsolateStatus] = useState<string | null>(null);

  const personaId = toolSettings.personaId ?? ROLEPLAY_ARCHETYPES[0].id;
  const { tone, content } = resolveRoleplayToneAndContent(toolSettings.tone, toolSettings.content);
  const playAs = normalizeRoleplayPlayAs(toolSettings.playAs);
  const bio = toolSettings.bio;
  const story = toolSettings.story ?? [];
  const autoQueue = toolSettings.autoQueue !== false;
  const storyRef = useRef(toolSettings.story ?? []);
  const isolateGenRef = useRef(0);
  const autoIsolateAttemptedRef = useRef(false);
  useEffect(() => {
    storyRef.current = toolSettings.story ?? [];
  }, [toolSettings.story]);

  useEffect(() => {
    if (!mounted) {
      return;
    }
    const timer = window.setTimeout(() => {
      const persisted = persistRoleplayLibraryFromCache(toolSettings);
      if (
        persisted &&
        persisted.cache.activeSessionId &&
        persisted.cache.activeSessionId !== toolSettings.activeSessionId
      ) {
        updateToolSettings({ activeSessionId: persisted.cache.activeSessionId });
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [mounted, toolSettings, updateToolSettings]);

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
    (action: 'bio' | 'scenes' | 'prompt', situation?: RoleplayScene) => ({
      action,
      model: shared.model,
      detail: shared.detail,
      personaId,
      customPersona: toolSettings.customPersona,
      characterName: toolSettings.characterName,
      extraHints: toolSettings.extraHints,
      setting: toolSettings.setting,
      lockedLocation: shared.lockedLocation,
      isolatedSubject:
        playAs === 'photo' && hasReferenceImage && toolSettings.referenceIsolated === true,
      tone,
      content,
      allowGore: toolSettings.allowGore === true,
      hasReferenceImage: playAs === 'photo' && hasReferenceImage,
      bio,
      story: toolSettings.story,
      rejectedScenes: action === 'scenes' ? scenes : undefined,
      situation,
      ...avoidedTokensRequestBody(),
      ...sharedLlmRequestBody(shared),
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
      scenes,
    ]
  );

  const queueStillOptions = useCallback(() => {
    if (playAs !== 'photo') {
      return undefined;
    }
    if (isolateSubject && toolSettings.referenceIsolated !== true) {
      throw new Error(ISOLATE_QUEUE_BLOCKED_MESSAGE);
    }
    const filename = referenceImageFilename;
    const imageUrl = referenceImageUrl;
    if (!filename && !imageUrl) {
      return undefined;
    }
    return {
      inputImageFilename: filename || undefined,
      inputImageUrl: imageUrl || undefined,
      identityLock: true,
      identityLockStrength: shared.ipAdapterStrength,
      identityKind: shared.identityKind,
    };
  }, [
    isolateSubject,
    playAs,
    referenceImageFilename,
    referenceImageUrl,
    shared.identityKind,
    shared.ipAdapterStrength,
    toolSettings.referenceIsolated,
  ]);

  useEffect(() => {
    const sync = () => {
      const current = storyRef.current;
      if (current.length === 0) {
        return;
      }
      const wanted = new Set(roleplayStoryPromptIds(current));
      if (wanted.size === 0) {
        return;
      }
      const stills = loadComfyGallery()
        .filter(entry => wanted.has(entry.promptId))
        .map(entry => ({
          promptId: entry.promptId,
          status: entry.status,
          imageUrl: galleryEntryPrimaryViewUrl(entry),
        }));
      const merged = mergeRoleplayStoryStills(current, stills);
      if (merged.changed) {
        updateToolSettings({ story: merged.story });
      }
    };
    window.addEventListener(COMFYUI_GALLERY_UPDATED_EVENT, sync);
    sync();
    return () => window.removeEventListener(COMFYUI_GALLERY_UPDATED_EVENT, sync);
  }, [updateToolSettings]);

  const commitStill = useCallback(
    async (
      data: RoleplayApiPayload,
      beat: RoleplayStoryBeat,
      nextBio: RoleplayBio,
      currentStory: RoleplayStoryBeat[]
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
      if (autoQueue) {
        const promptId = await actions.sendComfyUi(
          prompt,
          undefined,
          undefined,
          queueStillOptions()
        );
        stillPatch = {
          prompt,
          ...roleplayStillQueueResultPatch({ ...beat, prompt }, promptId),
        };
      }
      const nextStory = patchRoleplayStoryBeat(currentStory, beat, stillPatch);
      updateToolSettings({ bio: nextBio, story: nextStory });
      return nextStory;
    },
    [actions, autoQueue, queueStillOptions, shared.model, updateToolSettings]
  );

  const writeBio = useCallback(async () => {
    if (playAs === 'photo' && !hasReferenceImage) {
      setError('Upload a photo or pick a gallery still first.');
      return;
    }
    setBioLoading(true);
    setError(null);
    let introBeat: RoleplayStoryBeat | undefined;
    let writingStory: RoleplayStoryBeat[] = [];
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
      const nextBio = data.bio;
      const intro = roleplayIntroScene(nextBio);
      writingStory = appendRoleplayStoryBeat([], intro, { stillStatus: 'writing' });
      introBeat = writingStory[writingStory.length - 1];
      updateToolSettings({ bio: nextBio, story: writingStory });
      rememberDraftFields({
        toolKey: TOOL_ID,
        label: 'Roleplay',
        href: '/roleplay',
        fields: [nextBio.name, nextBio.look],
      });

      const [stillResponse, scenesResponse] = await Promise.all([
        fetch('/api/roleplay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...requestBody('prompt', intro),
            bio: nextBio,
            story: [],
          }),
        }),
        fetch('/api/roleplay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...requestBody('scenes'),
            bio: nextBio,
            story: writingStory,
          }),
        }).catch(() => null),
      ]);
      const stillData = (await stillResponse.json()) as RoleplayApiPayload;
      if (!stillResponse.ok || !stillData.prompt?.trim() || !introBeat) {
        throw new Error(stillData.error ?? 'Bio written, but the first still failed.');
      }
      await commitStill(stillData, introBeat, nextBio, writingStory);
      if (scenesResponse) {
        const scenesData = (await scenesResponse.json()) as RoleplayApiPayload;
        setScenes(scenesResponse.ok && Array.isArray(scenesData.scenes) ? scenesData.scenes : []);
      } else {
        setScenes([]);
      }
    } catch (err) {
      if (introBeat) {
        updateToolSettings({
          story: patchRoleplayStoryBeat(writingStory, introBeat, { stillStatus: 'error' }),
        });
      }
      setError(err instanceof Error ? err.message : 'Could not write a bio.');
    } finally {
      setBioLoading(false);
    }
  }, [commitStill, hasReferenceImage, playAs, requestBody, updateToolSettings]);

  const rollScenes = useCallback(async () => {
    if (!bio) {
      setError('Write a bio first — the scenes need someone to happen to.');
      return;
    }
    setScenesLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/roleplay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody('scenes')),
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
  }, [bio, requestBody]);

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
      setPlayingId(scene.id);
      setError(null);
      const writingStory = appendRoleplayStoryBeat(storyRef.current, scene, {
        stillStatus: 'writing',
      });
      const beat = writingStory[writingStory.length - 1];
      if (!beat) {
        setPlayingId(null);
        return;
      }
      updateToolSettings({ story: writingStory });
      try {
        const response = await fetch('/api/roleplay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody('prompt', scene)),
        });
        const data = (await response.json()) as RoleplayApiPayload;
        if (!response.ok || !data.prompt?.trim()) {
          throw new Error(data.error ?? 'Could not write a still.');
        }
        const nextStory = await commitStill(data, beat, bio, writingStory);
        const nextScenes = await fetch('/api/roleplay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...requestBody('scenes'),
            story: nextStory,
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
    [bio, commitStill, hasReferenceImage, playAs, requestBody, updateToolSettings]
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
    [actions, queueStillOptions, updateToolSettings]
  );

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
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not download the story.');
    } finally {
      setExporting(false);
    }
  }, [bio, content, personaId, tone, toolSettings.customPersona]);

  const surpriseCast = useCallback(() => {
    persistRoleplayLibraryFromCache(toolSettings);
    const pick = ROLEPLAY_ARCHETYPES[Math.floor(Math.random() * ROLEPLAY_ARCHETYPES.length)];
    updateToolSettings({
      ...startNewRoleplaySession(toolSettings),
      personaId: pick.id,
      customPersona: undefined,
    });
    setScenes([]);
  }, [toolSettings, updateToolSettings]);

  const continueLibrarySession = useCallback(
    (session: RoleplayLibrarySession) => {
      persistRoleplayLibraryFromCache(toolSettings);
      updateToolSettings(applyRoleplayLibrarySession(session));
      setScenes([]);
    },
    [toolSettings, updateToolSettings]
  );

  const startLibrarySession = useCallback(() => {
    persistRoleplayLibraryFromCache(toolSettings);
    updateToolSettings(startNewRoleplaySession(toolSettings));
    setScenes([]);
  }, [toolSettings, updateToolSettings]);

  if (!mounted) {
    return null;
  }

  const busy = bioLoading || scenesLoading || Boolean(playingId) || exporting || referenceUploading;

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
        />
      }
    >
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.roleplay} />

      <ToolSection title="Cast yourself">
        <p className="text-sm text-[var(--text-muted)]">
          Pick a part — raccoon pirate, sentient toaster, bad-at-haunting ghost — or type your own.
          Optional: play as yourself from a photo, or lock an existing generated still.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {ROLEPLAY_ARCHETYPES.map(entry => (
            <ChipButton
              key={entry.id}
              active={personaId === entry.id}
              disabled={busy}
              onClick={() => {
                persistRoleplayLibraryFromCache(toolSettings);
                updateToolSettings({
                  ...startNewRoleplaySession(toolSettings),
                  personaId: entry.id,
                  customPersona: undefined,
                });
                setScenes([]);
              }}
            >
              {entry.label}
            </ChipButton>
          ))}
          <ChipButton
            active={personaId === CUSTOM_ROLEPLAY_PERSONA_ID}
            disabled={busy}
            onClick={() => {
              persistRoleplayLibraryFromCache(toolSettings);
              updateToolSettings({
                ...startNewRoleplaySession(toolSettings),
                personaId: CUSTOM_ROLEPLAY_PERSONA_ID,
              });
              setScenes([]);
            }}
          >
            Custom…
          </ChipButton>
        </div>
        {personaId === CUSTOM_ROLEPLAY_PERSONA_ID ? (
          <TextArea
            value={toolSettings.customPersona ?? ''}
            disabled={busy}
            placeholder="e.g. a shy lighthouse that wants to be a DJ"
            onChange={event => updateToolSettings({ customPersona: event.target.value })}
            className={accentFocusClass(ACCENT)}
            rows={2}
          />
        ) : null}
        <label className="block space-y-1.5 text-sm">
          <span className="type-caption text-[var(--text-muted)]">Character name</span>
          <TextInput
            value={toolSettings.characterName ?? ''}
            disabled={busy}
            maxLength={MAX_ROLEPLAY_CHARACTER_NAME}
            placeholder="Leave blank to let the writer name them"
            onChange={event => {
              const characterName = event.target.value;
              updateToolSettings({
                characterName,
                bio: bio ? applyRoleplayCharacterName(bio, characterName) : bio,
              });
            }}
            className={accentFocusClass(ACCENT)}
          />
        </label>
        <div className="space-y-2">
          <p className="type-caption text-[var(--text-muted)]">Play as</p>
          <div className="flex flex-wrap gap-1.5">
            {ROLEPLAY_PLAY_AS.map(entry => (
              <ChipButton
                key={entry.id}
                active={playAs === entry.id}
                disabled={busy}
                title={entry.hint}
                onClick={() => {
                  if (entry.id === 'text') {
                    clearReference();
                    return;
                  }
                  updateToolSettings({ playAs: 'photo' });
                }}
              >
                {entry.label}
              </ChipButton>
            ))}
          </div>
          {playAs === 'photo' ? (
            <div className="space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-muted)]/40 p-3">
              <p className="text-xs text-[var(--text-muted)]">
                Every still queues img2img from this reference so you stay the same person. Isolate
                on white (default) cuts the subject out so the model does not keep the photo&apos;s
                street or room. Scene and part clothing replace the photo&apos;s outfit — face,
                hair, and body stay. Pair with Setting to place them somewhere new.
              </p>
              <div className="flex flex-wrap gap-1.5">
                <ChipButton
                  active={isolateSubject}
                  disabled={busy}
                  title="Cut the subject out and place them on a white backdrop before queueing. First use downloads a small on-device model."
                  onClick={() => {
                    const next = !isolateSubject;
                    if (!next && (referenceOriginalFilename || referenceOriginalUrl)) {
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
                      filename: originalFilename || 'roleplay-ref.png',
                      isolate: next,
                    }).catch(err => {
                      setError(
                        err instanceof Error ? err.message : 'Could not update the reference.'
                      );
                    });
                  }}
                >
                  Isolate on white
                </ChipButton>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="file"
                  accept="image/*"
                  disabled={busy}
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
                <ButtonLink href={galleryPickPath('roleplay')} variant="secondary" size="sm">
                  Choose from Gallery
                </ButtonLink>
                {lastStill ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      void applyReference({
                        imageUrl: lastStill.url,
                        filename: `roleplay-${lastStill.title}.png`,
                      }).catch(err => {
                        setError(err instanceof Error ? err.message : 'Could not use that still.');
                      });
                    }}
                  >
                    Use last still
                  </Button>
                ) : null}
                {hasReferenceImage ? (
                  <Button variant="ghost" size="sm" disabled={busy} onClick={clearReference}>
                    Clear
                  </Button>
                ) : null}
              </div>
              {displayReferenceUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- session blob / comfy preview
                <img
                  key={displayReferenceUrl}
                  src={displayReferenceUrl}
                  alt="Roleplay reference"
                  className="h-24 w-24 rounded-lg border border-[var(--border-subtle)] bg-white object-contain"
                />
              ) : null}
              {referenceUploading ? (
                <p className="text-xs text-[var(--text-muted)]">
                  {isolateStatus ?? 'Uploading reference…'}
                </p>
              ) : isolateStatus ? (
                <p className="text-xs text-[var(--text-muted)]">{isolateStatus}</p>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="space-y-2">
          <p className="type-caption text-[var(--text-muted)]">Tone</p>
          <div className="flex flex-wrap gap-1.5">
            {ROLEPLAY_TONES.map(entry => (
              <ChipButton
                key={entry.id}
                active={tone === entry.id}
                disabled={busy}
                title={entry.hint}
                onClick={() => updateToolSettings({ tone: entry.id, content })}
              >
                {entry.label}
              </ChipButton>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <p className="type-caption text-[var(--text-muted)]">Content</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="type-caption w-12 shrink-0 text-[var(--text-muted)]">SFW</span>
            {ROLEPLAY_CONTENT.filter(entry => entry.group === 'sfw').map(entry => (
              <ChipButton
                key={entry.id}
                active={content === entry.id}
                disabled={busy}
                title={entry.hint}
                onClick={() => updateToolSettings({ content: entry.id, tone })}
              >
                {entry.label}
              </ChipButton>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="type-caption w-12 shrink-0 text-[var(--text-muted)]">Adult</span>
            {ROLEPLAY_CONTENT.filter(entry => entry.group === 'adult').map(entry => (
              <ChipButton
                key={entry.id}
                active={content === entry.id}
                disabled={busy}
                title={entry.hint}
                onClick={() => updateToolSettings({ content: entry.id, tone })}
              >
                {entry.label}
              </ChipButton>
            ))}
          </div>
          <ChipButton
            active={toolSettings.allowGore === true}
            disabled={busy}
            title="Horror stills: blood, wounds, viscera. Stacks with any rating."
            onClick={() =>
              updateToolSettings({
                allowGore: toolSettings.allowGore !== true,
                tone,
                content,
              })
            }
          >
            Gore
          </ChipButton>
        </div>
        <div className="space-y-2">
          <p className="type-caption text-[var(--text-muted)]">Setting</p>
          <p className="text-xs text-[var(--text-muted)]">
            {playAs === 'photo'
              ? 'Stills replace the photo background with this place. Leave blank to invent a new scene per beat. Write a new bio or roll scenes after changing it.'
              : 'Opening beats and stills happen here. Leave blank to let the story pick places. Write a new bio or roll scenes after changing it.'}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {ROLEPLAY_SETTING_PRESETS.map(entry => (
              <ChipButton
                key={entry.id}
                active={(toolSettings.setting ?? '').trim() === entry.setting}
                disabled={busy}
                title={entry.setting}
                onClick={() =>
                  updateToolSettings({
                    setting:
                      (toolSettings.setting ?? '').trim() === entry.setting ? '' : entry.setting,
                  })
                }
              >
                {entry.label}
              </ChipButton>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <TextInput
              value={toolSettings.setting ?? ''}
              disabled={busy}
              placeholder="e.g. flooded cathedral, your kitchen, a moonlit pier"
              onChange={event => updateToolSettings({ setting: event.target.value })}
              className={`min-w-0 flex-1 ${accentFocusClass(ACCENT)}`}
            />
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() =>
                updateToolSettings({ setting: rollRoleplaySetting(toolSettings.setting) })
              }
            >
              Roll
            </Button>
            {(toolSettings.setting ?? '').trim() ? (
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => updateToolSettings({ setting: '' })}
              >
                Clear
              </Button>
            ) : null}
          </div>
        </div>
        <label className="block space-y-1.5 text-sm">
          <span className="type-caption text-[var(--text-muted)]">Optional notes</span>
          <TextArea
            value={toolSettings.extraHints ?? ''}
            disabled={busy}
            placeholder="Must include a yellow umbrella. Allergic to plot armor."
            onChange={event => updateToolSettings({ extraHints: event.target.value })}
            className={accentFocusClass(ACCENT)}
            rows={2}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            loading={bioLoading}
            loadingLabel={autoQueue ? 'Writing bio and queueing still' : 'Writing bio and still'}
            disabled={(busy && !bioLoading) || !photoReady}
            onClick={() => void writeBio()}
          >
            Write my bio
          </Button>
          <Button variant="secondary" disabled={busy} onClick={surpriseCast}>
            Surprise cast
          </Button>
          {bio ? (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                persistRoleplayLibraryFromCache(toolSettings);
                updateToolSettings({ bio: undefined, story: [], activeSessionId: undefined });
                setScenes([]);
              }}
            >
              Clear bio
            </Button>
          ) : null}
          {story.length > 0 ? (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                updateToolSettings({ story: [] });
                setScenes([]);
              }}
            >
              Restart story
            </Button>
          ) : null}
        </div>
      </ToolSection>

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
        <ToolSection title={`${bio.name} · character bible`}>
          <p className="text-sm whitespace-pre-wrap text-[var(--text-secondary)]">
            {formatRoleplayBio(bio)}
          </p>
        </ToolSection>
      ) : null}

      <ToolSection title="Story">
        <p className="text-sm text-[var(--text-muted)]">
          Stills land here as they render
          {autoQueue ? ' — queued automatically from the bio and each pick' : ''}.
        </p>
        <Button
          variant="secondary"
          loading={exporting}
          loadingLabel="Packing story"
          disabled={(!bio && story.length === 0) || (busy && !exporting)}
          onClick={() => void downloadStory()}
        >
          Download story
        </Button>
        <RoleplayStoryReel
          story={story}
          busy={busy}
          onQueue={beat => void queueBeat(beat)}
          onRetry={beat => void queueBeat(beat, { retry: true })}
          onSelectTake={selectStillTake}
          onCopy={beat => void copyBeatPrompt(beat)}
        />
      </ToolSection>

      <ToolSection title="What happens next?">
        <p className="text-sm text-[var(--text-muted)]">
          Tap a beat to continue the story. The next four options fork from that pick.
        </p>
        <label className="flex cursor-pointer items-start gap-3 text-sm text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={autoQueue}
            disabled={busy}
            onChange={event => updateToolSettings({ autoQueue: event.target.checked })}
            className={`mt-1 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-base)] ${accentFocusClass(ACCENT)}`}
          />
          <span>
            Queue a still when I write a bio or pick a scene
            <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
              Uses the model and Fast/Good/Best from the sidebar. Turn off to write the prompt
              first.
            </span>
          </span>
        </label>
        <Button
          variant="secondary"
          loading={scenesLoading}
          loadingLabel="Rolling scenes"
          disabled={!bio || busy}
          onClick={() => void rollScenes()}
        >
          {scenes.length > 0 ? 'Reroll four scenes' : 'Roll four scenes'}
        </Button>
        {scenes.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {scenes.map(scene => (
              <button
                key={scene.id}
                type="button"
                disabled={busy}
                onClick={() => void playScene(scene)}
                className={`rounded-[var(--radius-lg)] border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${
                  playingId === scene.id
                    ? 'border-[var(--accent-border)] bg-[var(--accent-soft)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                <span className="block text-sm font-medium text-[var(--text-primary)]">
                  {scene.title}
                </span>
                <span className="type-caption mt-1 block text-[var(--text-muted)]">
                  {scene.blurb}
                </span>
                {playingId === scene.id ? (
                  <span className="type-caption mt-2 block text-[var(--accent-text)]">
                    Writing still…
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
        {error ? <FieldError>{error}</FieldError> : null}
      </ToolSection>
    </ToolLayout>
  );
}
