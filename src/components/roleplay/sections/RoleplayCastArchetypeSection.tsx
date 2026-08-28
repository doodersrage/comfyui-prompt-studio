'use client';

import RoleplayBibleEditor from '@/components/RoleplayBibleEditor';
import { ChipButton, TextArea, TextInput } from '@/components/ui/Field';
import { accentFocusClass } from '@/components/ui/ToolPageShell';
import {
  CUSTOM_ROLEPLAY_PERSONA_ID,
  ROLEPLAY_ARCHETYPES,
  applyRoleplayCharacterName,
  MAX_ROLEPLAY_CHARACTER_NAME,
} from '@/lib/roleplay';
import type { RoleplayCastSectionProps } from '@/components/roleplay/roleplay-cast-section-types';

const ACCENT = 'amber' as const;

export function RoleplayCastArchetypeSection({
  busy,
  bio,
  personaId,
  ownBibleOpen,
  toolSettings,
  onOwnBibleOpenChange,
  onShelfAndStartNew,
  onApplyOwnBible,
  onUpdateToolSettings,
}: Pick<
  RoleplayCastSectionProps,
  | 'busy'
  | 'bio'
  | 'personaId'
  | 'ownBibleOpen'
  | 'toolSettings'
  | 'onOwnBibleOpenChange'
  | 'onShelfAndStartNew'
  | 'onApplyOwnBible'
  | 'onUpdateToolSettings'
>) {
  return (
    <>
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
    </>
  );
}
