'use client';

import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';

import { useCallback, useEffect, useRef, useState } from 'react';
import SharedToolControls from '@/components/SharedToolControls';
import RoleplayStoryReel from '@/components/RoleplayStoryReel';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import { useCachedSettings } from '@/hooks/useCachedSettings';
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
import {
  COMFYUI_GALLERY_UPDATED_EVENT,
  galleryEntryPrimaryViewUrl,
  loadComfyGallery,
} from '@/lib/comfyui-gallery';
import {
  CUSTOM_ROLEPLAY_PERSONA_ID,
  ROLEPLAY_ARCHETYPES,
  ROLEPLAY_CONTENT,
  ROLEPLAY_TONES,
  appendRoleplayStoryBeat,
  formatRoleplayBio,
  getRoleplayArchetype,
  mergeRoleplayStoryStills,
  patchRoleplayStoryBeat,
  resolveRoleplayToneAndContent,
  roleplayIntroScene,
  type RoleplayBio,
  type RoleplayScene,
  type RoleplayStoryBeat,
} from '@/lib/roleplay';
import { downloadRoleplayStoryBundle } from '@/lib/roleplay-export';
import type { EnrichedToolGenerateResult } from '@/lib/specialized/types';
import { ChipButton, FieldError, TextArea } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
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
    'Cast yourself as someone (or something). The bio and each story beat render a still inline while ComfyUI works.',
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

  const personaId = toolSettings.personaId ?? ROLEPLAY_ARCHETYPES[0].id;
  const { tone, content } = resolveRoleplayToneAndContent(toolSettings.tone, toolSettings.content);
  const bio = toolSettings.bio;
  const story = toolSettings.story ?? [];
  const autoQueue = toolSettings.autoQueue !== false;
  const storyRef = useRef(toolSettings.story ?? []);
  useEffect(() => {
    storyRef.current = toolSettings.story ?? [];
  }, [toolSettings.story]);

  useSeedToolDraft(mounted, {
    toolKey: TOOL_ID,
    label: 'Roleplay',
    href: '/roleplay',
    fields: [bio?.name, toolSettings.customPersona, toolSettings.extraHints],
  });

  const actions = usePromptResultActions({
    tool: TOOL_ID,
    model: shared.model,
    detail: shared.detail,
    hints: [bio?.name, toolSettings.extraHints].filter(Boolean).join(' · '),
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
      extraHints: toolSettings.extraHints,
      tone,
      content,
      allowGore: toolSettings.allowGore === true,
      bio,
      story: toolSettings.story,
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
      toolSettings.customPersona,
      toolSettings.extraHints,
      toolSettings.allowGore,
      toolSettings.story,
    ]
  );

  useEffect(() => {
    const sync = () => {
      const current = storyRef.current;
      if (current.length === 0) {
        return;
      }
      const wanted = new Set(
        current.map(beat => beat.promptId?.trim()).filter((id): id is string => Boolean(id))
      );
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
      let promptId: string | undefined;
      let stillStatus: RoleplayStoryBeat['stillStatus'];
      if (autoQueue) {
        promptId = await actions.sendComfyUi(prompt);
        stillStatus = promptId ? 'queued' : 'error';
      }
      const nextStory = patchRoleplayStoryBeat(currentStory, beat, {
        prompt,
        promptId,
        stillStatus,
      });
      updateToolSettings({ bio: nextBio, story: nextStory });
      return nextStory;
    },
    [actions, autoQueue, shared.model, updateToolSettings]
  );

  const writeBio = useCallback(async () => {
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
  }, [commitStill, requestBody, updateToolSettings]);

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
    [bio, commitStill, requestBody, updateToolSettings]
  );

  const queueBeat = useCallback(
    async (beat: RoleplayStoryBeat) => {
      const prompt = beat.prompt?.trim();
      if (!prompt) {
        return;
      }
      setError(null);
      updateToolSettings({
        story: patchRoleplayStoryBeat(storyRef.current, beat, { stillStatus: 'writing' }),
      });
      const promptId = await actions.sendComfyUi(prompt);
      updateToolSettings({
        story: patchRoleplayStoryBeat(storyRef.current, beat, {
          promptId,
          stillStatus: promptId ? 'queued' : 'error',
        }),
      });
    },
    [actions, updateToolSettings]
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
    const pick = ROLEPLAY_ARCHETYPES[Math.floor(Math.random() * ROLEPLAY_ARCHETYPES.length)];
    updateToolSettings({
      personaId: pick.id,
      customPersona: undefined,
      bio: undefined,
      story: [],
    });
    setScenes([]);
  }, [updateToolSettings]);

  if (!mounted) {
    return null;
  }

  const busy = bioLoading || scenesLoading || Boolean(playingId) || exporting;

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
          onSharedSettingsChange={updateShared}
        />
      }
    >
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.roleplay} />

      <ToolSection title="Cast yourself">
        <p className="text-sm text-[var(--text-muted)]">
          Pick a part — raccoon pirate, sentient toaster, bad-at-haunting ghost — or type your own.
          The bio is the character bible for every still.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {ROLEPLAY_ARCHETYPES.map(entry => (
            <ChipButton
              key={entry.id}
              active={personaId === entry.id}
              disabled={busy}
              onClick={() =>
                updateToolSettings({
                  personaId: entry.id,
                  bio: undefined,
                  story: [],
                })
              }
            >
              {entry.label}
            </ChipButton>
          ))}
          <ChipButton
            active={personaId === CUSTOM_ROLEPLAY_PERSONA_ID}
            disabled={busy}
            onClick={() =>
              updateToolSettings({
                personaId: CUSTOM_ROLEPLAY_PERSONA_ID,
                bio: undefined,
                story: [],
              })
            }
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
            disabled={busy && !bioLoading}
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
                updateToolSettings({ bio: undefined, story: [] });
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
