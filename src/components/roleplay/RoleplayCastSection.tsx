'use client';

import RoleplayBibleEditor from '@/components/RoleplayBibleEditor';
import VisionScanButton from '@/components/VisionScanButton';
import { Button, ButtonLink } from '@/components/ui/Button';
import { ChipButton, TextArea, TextInput } from '@/components/ui/Field';
import { ToolSection, accentFocusClass } from '@/components/ui/ToolPageShell';
import { cacheBustIdentityMediaUrl, IDENTITY_MEDIA_URL } from '@/lib/gallery-media-client';
import { galleryPickPath } from '@/lib/gallery-handoff';
import {
  CUSTOM_ROLEPLAY_PERSONA_ID,
  ROLEPLAY_ARCHETYPES,
  ROLEPLAY_CONTENT,
  ROLEPLAY_PLAY_AS,
  ROLEPLAY_SETTING_PRESETS,
  ROLEPLAY_TONES,
  applyRoleplayCharacterName,
  MAX_ROLEPLAY_CHARACTER_NAME,
  rollRoleplaySetting,
  type RoleplayBio,
  type RoleplayContentId,
  type RoleplayPlayAs,
  type RoleplayStoryBeat,
  type RoleplayStoryPhase,
  type RoleplayTone,
} from '@/lib/roleplay';
import type { RoleplayBeatOutput } from '@/lib/roleplay-film';
import type { RoleplayToolCache } from '@/lib/settings-cache';

const ACCENT = 'amber' as const;

export type RoleplayCastApplyReferenceInput = {
  file?: File | null;
  imageUrl?: string;
  filename?: string;
  isolate?: boolean;
};

export type RoleplayCastSectionProps = {
  busy: boolean;
  bioLoading: boolean;
  bio: RoleplayBio | undefined;
  story: RoleplayStoryBeat[];
  storyPhase: RoleplayStoryPhase;
  personaId: string;
  playAs: RoleplayPlayAs;
  tone: RoleplayTone;
  content: RoleplayContentId;
  adultEnabled: boolean;
  autoQueue: boolean;
  beatOutput: RoleplayBeatOutput;
  photoReady: boolean;
  ownBibleOpen: boolean;
  toolSettings: RoleplayToolCache;
  isolateSubject: boolean;
  hasReferenceImage: boolean;
  scanning: boolean;
  referenceUploading: boolean;
  isolateStatus: string | null;
  displayReferenceUrl: string;
  referenceOriginalFilename: string;
  referenceOriginalUrl: string;
  referenceImageFilename: string;
  referenceImageUrl: string;
  lastStill: { url: string; title: string } | null;
  onOwnBibleOpenChange: (open: boolean | ((prev: boolean) => boolean)) => void;
  onUpdateToolSettings: (partial: Partial<RoleplayToolCache>) => void;
  onShelfAndStartNew: (patch?: Partial<RoleplayToolCache>) => void;
  onApplyOwnBible: (nextBio: RoleplayBio) => void;
  onClearReference: () => void;
  onApplyReference: (input: RoleplayCastApplyReferenceInput) => Promise<void>;
  onReferencePreviewUrlChange: (
    url: string | null | ((prev: string | null) => string | null)
  ) => void;
  onIsolateStatusChange: (status: string | null) => void;
  onError: (message: string) => void;
  onScanWithVision: () => void;
  onWriteBio: () => void;
  onSurpriseCast: () => void;
  onRestartStory: () => void;
};

export default function RoleplayCastSection({
  busy,
  bioLoading,
  bio,
  story,
  storyPhase,
  personaId,
  playAs,
  tone,
  content,
  adultEnabled,
  autoQueue,
  beatOutput,
  photoReady,
  ownBibleOpen,
  toolSettings,
  isolateSubject,
  hasReferenceImage,
  scanning,
  referenceUploading,
  isolateStatus,
  displayReferenceUrl,
  referenceOriginalFilename,
  referenceOriginalUrl,
  referenceImageFilename,
  referenceImageUrl,
  lastStill,
  onOwnBibleOpenChange,
  onUpdateToolSettings,
  onShelfAndStartNew,
  onApplyOwnBible,
  onClearReference,
  onApplyReference,
  onReferencePreviewUrlChange,
  onIsolateStatusChange,
  onError,
  onScanWithVision,
  onWriteBio,
  onSurpriseCast,
  onRestartStory,
}: RoleplayCastSectionProps) {
  return (
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
              if (personaId === entry.id) {
                return;
              }
              onShelfAndStartNew({ personaId: entry.id, customPersona: undefined });
            }}
          >
            {entry.label}
          </ChipButton>
        ))}
        <ChipButton
          active={personaId === CUSTOM_ROLEPLAY_PERSONA_ID}
          disabled={busy}
          onClick={() => {
            if (personaId === CUSTOM_ROLEPLAY_PERSONA_ID) {
              return;
            }
            onShelfAndStartNew({ personaId: CUSTOM_ROLEPLAY_PERSONA_ID });
          }}
        >
          Custom…
        </ChipButton>
        <ChipButton
          active={ownBibleOpen}
          disabled={busy}
          onClick={() => onOwnBibleOpenChange(open => !open)}
        >
          Your bible
        </ChipButton>
      </div>
      {ownBibleOpen && !bio ? (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-muted)]/30 p-3">
          <p className="mb-3 text-sm text-[var(--text-muted)]">
            Write or paste a character bible. No LLM rewrite — this is the person who walks into the
            story.
          </p>
          <RoleplayBibleEditor
            characterName={toolSettings.characterName}
            disabled={busy}
            accentClass={accentFocusClass(ACCENT)}
            onApply={nextBio => void onApplyOwnBible(nextBio)}
          />
        </div>
      ) : null}
      {personaId === CUSTOM_ROLEPLAY_PERSONA_ID ? (
        <TextArea
          value={toolSettings.customPersona ?? ''}
          disabled={busy}
          placeholder="e.g. a shy lighthouse that wants to be a DJ"
          onChange={event => onUpdateToolSettings({ customPersona: event.target.value })}
          className={accentFocusClass(ACCENT)}
          rows={2}
        />
      ) : null}
      <label className="block space-y-1.5 text-sm">
        <span className="type-caption text-[var(--text-muted)]">Character name</span>
        <TextInput
          name="roleplay-character-lock"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={toolSettings.characterName ?? ''}
          disabled={busy}
          maxLength={MAX_ROLEPLAY_CHARACTER_NAME}
          placeholder="Leave blank to let the writer name them"
          onChange={event => {
            const characterName = event.target.value;
            onUpdateToolSettings({
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
                  onClearReference();
                  return;
                }
                onUpdateToolSettings({ playAs: 'photo' });
              }}
            >
              {entry.label}
            </ChipButton>
          ))}
        </div>
        {playAs === 'photo' ? (
          <div className="space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-muted)]/40 p-3">
            <p className="text-xs text-[var(--text-muted)]">
              Every still queues img2img from this reference so you stay the same person. Isolate on
              white (default) cuts the subject out so the model does not keep the photo&apos;s
              street or room. Scene and part clothing replace the photo&apos;s outfit — face, hair,
              and body stay. Pair with Setting to place them somewhere new.
            </p>
            <div className="flex flex-wrap gap-1.5">
              <ChipButton
                active={isolateSubject}
                disabled={busy}
                title="Cut the subject out and place them on a white backdrop before queueing. First use downloads a small on-device model."
                onClick={() => {
                  const next = !isolateSubject;
                  if (!next && (referenceOriginalFilename || referenceOriginalUrl)) {
                    onUpdateToolSettings({
                      isolateSubject: false,
                      referenceIsolated: false,
                      referenceImageFilename: referenceOriginalFilename || referenceImageFilename,
                      referenceImageUrl: referenceOriginalUrl || referenceImageUrl,
                    });
                    if (referenceOriginalUrl || referenceImageUrl) {
                      onReferencePreviewUrlChange(
                        cacheBustIdentityMediaUrl(referenceOriginalUrl || referenceImageUrl)
                      );
                    }
                    onIsolateStatusChange(null);
                    return;
                  }
                  onUpdateToolSettings({ isolateSubject: next });
                  const originalUrl = referenceOriginalUrl || referenceImageUrl;
                  const originalFilename = referenceOriginalFilename || referenceImageFilename;
                  if (!originalUrl && !originalFilename) {
                    return;
                  }
                  void onApplyReference({
                    imageUrl: originalUrl || IDENTITY_MEDIA_URL,
                    filename: originalFilename || 'roleplay-ref.png',
                    isolate: next,
                  }).catch(err => {
                    onError(err instanceof Error ? err.message : 'Could not update the reference.');
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
                  void onApplyReference({ file }).catch(err => {
                    onError(err instanceof Error ? err.message : 'Could not upload that photo.');
                  });
                }}
              />
              <ButtonLink href={galleryPickPath('roleplay')} variant="secondary" size="sm">
                Choose from Gallery
              </ButtonLink>
              <VisionScanButton
                disabled={!hasReferenceImage || busy}
                scanning={scanning}
                onClick={() => void onScanWithVision()}
              />
              {lastStill ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    void onApplyReference({
                      imageUrl: lastStill.url,
                      filename: `roleplay-${lastStill.title}.png`,
                    }).catch(err => {
                      onError(err instanceof Error ? err.message : 'Could not use that still.');
                    });
                  }}
                >
                  Use last still
                </Button>
              ) : null}
              {hasReferenceImage ? (
                <Button variant="ghost" size="sm" disabled={busy} onClick={onClearReference}>
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
              onClick={() => onUpdateToolSettings({ tone: entry.id, content })}
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
              onClick={() => onUpdateToolSettings({ content: entry.id, tone })}
            >
              {entry.label}
            </ChipButton>
          ))}
        </div>
        {adultEnabled ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="type-caption w-12 shrink-0 text-[var(--text-muted)]">Adult</span>
            {ROLEPLAY_CONTENT.filter(entry => entry.group === 'adult').map(entry => (
              <ChipButton
                key={entry.id}
                active={content === entry.id}
                disabled={busy}
                title={entry.hint}
                onClick={() => onUpdateToolSettings({ content: entry.id, tone })}
              >
                {entry.label}
              </ChipButton>
            ))}
          </div>
        ) : null}
        <ChipButton
          active={toolSettings.allowGore === true}
          disabled={busy}
          title="Horror stills: blood, wounds, viscera. Stacks with any rating."
          onClick={() =>
            onUpdateToolSettings({
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
                onUpdateToolSettings({
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
            onChange={event => onUpdateToolSettings({ setting: event.target.value })}
            className={`min-w-0 flex-1 ${accentFocusClass(ACCENT)}`}
          />
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() =>
              onUpdateToolSettings({ setting: rollRoleplaySetting(toolSettings.setting) })
            }
          >
            Roll
          </Button>
          {(toolSettings.setting ?? '').trim() ? (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => onUpdateToolSettings({ setting: '' })}
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
          onChange={event => onUpdateToolSettings({ extraHints: event.target.value })}
          className={accentFocusClass(ACCENT)}
          rows={2}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          loading={bioLoading}
          loadingLabel={
            autoQueue
              ? beatOutput === 'clip'
                ? 'Writing bio and queueing clip'
                : 'Writing bio and queueing still'
              : 'Writing bio and still'
          }
          disabled={(busy && !bioLoading) || !photoReady}
          onClick={() => void onWriteBio()}
        >
          Write my bio
        </Button>
        <Button variant="secondary" disabled={busy} onClick={onSurpriseCast}>
          Surprise cast
        </Button>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => onOwnBibleOpenChange(open => !open)}
        >
          {bio ? 'Edit bible' : 'Use my own bible'}
        </Button>
        {bio ? (
          <Button variant="ghost" disabled={busy} onClick={() => onShelfAndStartNew()}>
            Clear bio
          </Button>
        ) : null}
        {story.length > 0 && storyPhase !== 'complete' ? (
          <Button variant="ghost" disabled={busy} onClick={onRestartStory}>
            Restart story
          </Button>
        ) : null}
      </div>
    </ToolSection>
  );
}
