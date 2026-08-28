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
import { useRoleplayLibraryPersist } from '@/hooks/useRoleplayLibraryPersist';
import { useRoleplayBioFlow } from '@/hooks/useRoleplayBioFlow';
import { useRoleplaySceneFlow } from '@/hooks/useRoleplaySceneFlow';
import { useRoleplaySessionActions } from '@/hooks/useRoleplaySessionActions';
import { getComfyModelDefinition } from '@/lib/comfy-models/client';
import { getReformatTargetModel } from '@/lib/reformat-target';
import { buildRoleplayRequestBody } from '@/lib/roleplay-play-core';
import { DEFAULT_ROLEPLAY_TOOL_CACHE } from '@/lib/settings-cache';
import {
  ROLEPLAY_ARCHETYPES,
  formatRoleplayStoryProgress,
  mergeRoleplayRejectedScenes,
  resolveRoleplayToneAndContent,
  type RoleplayScene,
} from '@/lib/roleplay';
import { lastRoleplayMotionSource, normalizeRoleplayBeatOutput } from '@/lib/roleplay-film';
import { isNsfwGeneratorEnabledClient } from '@/lib/nsfw-generator-env';
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
  const [error, setError] = useState<string | null>(null);
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
  const scenesRef = useRef<RoleplayScene[]>([]);
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

  useRoleplayLibraryPersist({ mounted, toolSettings, updateToolSettings });
  useRoleplayLookPackDeepLink({ mounted, updateShared, updateToolSettings });

  const {
    playAs: normalizedPlayAs,
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
    (
      action: 'bio' | 'scenes' | 'prompt',
      situation?: Parameters<typeof buildRoleplayRequestBody>[0]['situation']
    ) =>
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
        rejectedScenes: mergeRoleplayRejectedScenes(rejectedScenesMemory, scenesRef.current),
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

  const { scenes, setScenes, scenesLoading, playingId, rollScenes, playScene } =
    useRoleplaySceneFlow({
      storyRef,
      toolSettings,
      updateToolSettings,
      bio,
      rejectedScenesMemory,
      requestBody,
      commitStill,
      skipStillForClip,
      autoQueue,
      playAsResolved,
      hasReferenceImage,
      setError,
    });

  useEffect(() => {
    scenesRef.current = scenes;
  }, [scenes]);

  const { bioLoading, writeBio, applyOwnBible } = useRoleplayBioFlow({
    storyRef,
    updateToolSettings,
    requestBody,
    commitStill,
    skipStillForClip,
    autoQueue,
    playAsResolved,
    hasReferenceImage,
    setError,
    setScenes,
    setOwnBibleOpen,
  });

  const {
    exporting,
    selectStillTake,
    selectClipTake,
    copyBeatPrompt,
    downloadStory,
    shelfAndStartNew,
    restartStory,
    surpriseCast,
    continueLibrarySession,
    startLibrarySession,
  } = useRoleplaySessionActions({
    storyRef,
    toolSettings,
    updateToolSettings,
    bio,
    personaId,
    tone,
    content,
    assembledFilmRef,
    stampRoleplayCharacter,
    setScenes,
    setOwnBibleOpen,
    setError,
  });

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
