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
import { useSeedToolDraft } from '@/hooks/useSeedToolDraft';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import { useRoleplayBeatQueue, useRoleplayPhotoModelGuard } from '@/hooks/useRoleplayBeatQueue';
import { useRoleplayLookPackDeepLink } from '@/hooks/useRoleplayLookPackDeepLink';
import { useRoleplayReferenceImage } from '@/hooks/useRoleplayReferenceImage';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import { useRoleplayStorySync } from '@/hooks/useRoleplayStorySync';
import { useRoleplayFilmActions } from '@/hooks/useRoleplayFilmActions';
import { getComfyModelDefinition } from '@/lib/comfy-models/client';
import { getReformatTargetModel } from '@/lib/reformat-target';
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import { buildRoleplayRequestBody, type RoleplayApiPayload } from '@/lib/roleplay-play-core';
import { DEFAULT_ROLEPLAY_TOOL_CACHE } from '@/lib/settings-cache';
import {
  CUSTOM_ROLEPLAY_PERSONA_ID,
  ROLEPLAY_ARCHETYPES,
  ROLEPLAY_CONTENT,
  ROLEPLAY_TONES,
  appendRoleplayStoryBeat,
  formatRoleplayStoryProgress,
  getRoleplayArchetype,
  lastRoleplayPlotBeat,
  mergeRoleplayRejectedScenes,
  patchRoleplayStoryBeat,
  resolveRoleplayToneAndContent,
  roleplayIntroScene,
  roleplayStoryPhase,
  selectRoleplayClipTakePatch,
  selectRoleplayStillTakePatch,
  type RoleplayBio,
  type RoleplayScene,
  type RoleplayStoryBeat,
} from '@/lib/roleplay';
import { lastRoleplayMotionSource, normalizeRoleplayBeatOutput } from '@/lib/roleplay-film';
import { isNsfwGeneratorEnabledClient } from '@/lib/nsfw-generator-env';
import { downloadRoleplayStoryBundle } from '@/lib/roleplay-export';
import {
  applyRoleplayLibrarySession,
  archiveAndStartNewRoleplaySession,
  persistRoleplayLibraryFromCache,
  type RoleplayLibrarySession,
} from '@/lib/roleplay-library';
import { applyCharacterRecord, upsertCharacterFromRoleplaySession } from '@/lib/character-os';
import { loadSettingsCache, saveSharedSettings } from '@/lib/settings-cache';
import { Button } from '@/components/ui/Button';
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
  const [ownBibleOpen, setOwnBibleOpen] = useState(false);

  const personaId = toolSettings.personaId ?? ROLEPLAY_ARCHETYPES[0].id;
  const adultEnabled = isNsfwGeneratorEnabledClient();
  const { tone, content } = resolveRoleplayToneAndContent(toolSettings.tone, toolSettings.content, {
    adultEnabled,
  });
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

  useRoleplayLookPackDeepLink({ mounted, updateShared, updateToolSettings });

  const {
    playAs: normalizedPlayAs,
    referencePreviewUrl,
    setReferencePreviewUrl,
    referenceUploading,
    scanning,
    isolateStatus,
    setIsolateStatus,
    referenceImageUrl,
    referenceImageFilename,
    hasReferenceImage,
    referenceOriginalUrl,
    referenceOriginalFilename,
    isolateSubject,
    photoReady,
    lastStill,
    displayReferenceUrl,
    clearReference,
    applyReference,
    scanWithVision,
  } = useRoleplayReferenceImage({
    mounted,
    story,
    shared,
    toolSettings,
    updateToolSettings,
    setError,
  });

  useRoleplayPhotoModelGuard({
    mounted,
    playAs: normalizedPlayAs,
    sharedModel: shared.model,
    updateShared,
  });

  const playAsResolved = normalizedPlayAs;

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
        hasReferenceImage: playAsResolved === 'photo' && hasReferenceImage,
        isolatedSubject:
          playAsResolved === 'photo' &&
          hasReferenceImage &&
          toolSettings.referenceIsolated === true,
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
      playAsResolved,
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

  const { skipStillForClip, commitStill, queueBeat, queueBeatMotion, stampRoleplayCharacter } =
    useRoleplayBeatQueue({
      storyRef,
      toolSettings,
      updateToolSettings,
      shared,
      actions,
      playAs: playAsResolved,
      referenceImageUrl,
      isolateSubject,
      referenceImageFilename,
      autoQueue,
      beatOutput,
      setError,
    });

  useRoleplayStorySync(storyRef, patch => updateToolSettings(patch));

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
    if (playAsResolved === 'photo' && !hasReferenceImage) {
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
  }, [beginStoryFromBio, hasReferenceImage, playAsResolved, requestBody]);

  const applyOwnBible = useCallback(
    async (nextBio: RoleplayBio) => {
      if (playAsResolved === 'photo' && !hasReferenceImage) {
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
    [beginStoryFromBio, hasReferenceImage, playAsResolved, updateToolSettings]
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
      if (playAsResolved === 'photo' && !hasReferenceImage) {
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
      playAsResolved,
      rememberRejectedScenes,
      requestBody,
      scenes,
      skipStillForClip,
      updateToolSettings,
    ]
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
          preferEditModels={playAsResolved === 'photo'}
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
        playAs={playAsResolved}
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
