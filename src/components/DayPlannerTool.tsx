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
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import { useSeedToolDraft } from '@/hooks/useSeedToolDraft';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import { parseCharacterHints } from '@/lib/character-hints';
import { applyCharacterRecord, getCharacter } from '@/lib/character-os';
import { subjectGenderToClothingGender } from '@/lib/clothing-gender';
import {
  fetchClothingLabels,
  fetchClothingSelectOptions,
  getCachedClothingLabel,
} from '@/lib/clothing-catalog-client';
import { getComfyModelDefinition } from '@/lib/comfy-models/client';
import {
  buildDaySlotPrompt,
  normalizeDaySlots,
  type DaySlot,
  type DaySlotId,
} from '@/lib/day-planner';
import { resolveFittingPlateFromCharacter } from '@/lib/fitting-room';
import { getReformatTargetModel } from '@/lib/reformat-target';
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import { buildRoleplayQueueStillOptions } from '@/lib/roleplay-play-core';
import { ROLEPLAY_SETTING_PRESETS } from '@/lib/roleplay';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import {
  DEFAULT_DAY_TOOL_CACHE,
  loadSettingsCache,
  saveSharedSettings,
} from '@/lib/settings-cache';

const ACCENT = 'teal' as const;
const TOOL_ID = 'day' as const;

type ClothingOption = { value: string; label: string; group?: string };

export default function DayPlannerTool() {
  const router = useRouter();
  const description = useToolPageDescription(
    'Plan morning through night — wardrobe, setting, and beats per slot, then queue stills.',
    'Plan a character day — four slots → scene stills.'
  );
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } = useCachedSettings(
    'day',
    DEFAULT_DAY_TOOL_CACHE
  );

  const [output, setOutput] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeSlotId, setActiveSlotId] = useState<DaySlotId>('morning');
  const [wardrobeLabels, setWardrobeLabels] = useState<Record<string, string>>({});
  const deepLinkHandled = useRef(false);

  const slots = useMemo(() => normalizeDaySlots(toolSettings.slots), [toolSettings.slots]);
  const activeSlot = slots.find(slot => slot.id === activeSlotId) ?? slots[0]!;
  const character = getCharacter(shared.activeCharacterId);
  const selectedModel = getComfyModelDefinition(shared.model);
  const plate = useMemo(() => resolveFittingPlateFromCharacter(character), [character]);
  const hasPlate = Boolean(plate?.filename || plate?.imageUrl);

  const clothingGender = useMemo(
    () =>
      subjectGenderToClothingGender(
        parseCharacterHints(character?.hints || character?.descriptor).gender
      ),
    [character?.descriptor, character?.hints]
  );

  const [wardrobeOptions, setWardrobeOptions] = useState<ClothingOption[]>([
    { value: '', label: 'Default kit…' },
  ]);
  const [wardrobeLoadedKey, setWardrobeLoadedKey] = useState<string | null>(null);
  const wardrobeOptionsKey = `wardrobeCatalog:${clothingGender}`;
  const wardrobeReady = wardrobeLoadedKey === wardrobeOptionsKey;

  useSeedToolDraft(mounted, {
    toolKey: TOOL_ID,
    label: 'Day Planner',
    href: '/day',
    fields: [character?.name, activeSlot.sceneHints, toolSettings.notes],
  });

  const actions = usePromptResultActions({
    tool: TOOL_ID,
    model: shared.model,
    detail: shared.detail,
    hints: toolSettings.notes,
    autoFixRules: shared.autoFixRules !== false,
    reformatTarget: getReformatTargetModel(shared.model),
  });

  const updateSlot = useCallback(
    (slotId: DaySlotId, patch: Partial<DaySlot>) => {
      updateToolSettings({
        slots: slots.map(slot => (slot.id === slotId ? { ...slot, ...patch } : slot)),
      });
    },
    [slots, updateToolSettings]
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
    const ids = [
      ...new Set(slots.map(slot => slot.wardrobeId?.trim()).filter(Boolean)),
    ] as string[];
    if (ids.length === 0) {
      scheduleAfterCommit(() => setWardrobeLabels({}));
      return;
    }
    const cached: Record<string, string> = {};
    const pending: string[] = [];
    for (const id of ids) {
      const label = getCachedClothingLabel(id);
      if (label) {
        cached[id] = label;
      } else {
        pending.push(id);
      }
    }
    if (Object.keys(cached).length > 0) {
      scheduleAfterCommit(() => setWardrobeLabels(previous => ({ ...previous, ...cached })));
    }
    if (pending.length === 0) {
      return;
    }
    let cancelled = false;
    void fetchClothingLabels(pending).then(labels => {
      if (cancelled) {
        return;
      }
      const next: Record<string, string> = {};
      for (const id of pending) {
        next[id] = labels.get(id) ?? id;
      }
      setWardrobeLabels(previous => ({ ...previous, ...next }));
    });
    return () => {
      cancelled = true;
    };
  }, [slots]);

  const wardrobeLabelFor = useCallback(
    (wardrobeId?: string) => {
      const id = wardrobeId?.trim();
      if (!id) {
        return '';
      }
      return wardrobeLabels[id] ?? id;
    },
    [wardrobeLabels]
  );

  const buildSlotPrompt = useCallback(
    (slot: DaySlot) =>
      buildDaySlotPrompt({
        slot,
        wardrobeLabel: wardrobeLabelFor(slot.wardrobeId),
        characterName: character?.name,
        characterDescriptor: character?.descriptor || character?.hints,
        lockedLocation: shared.lockedLocation,
        notes: toolSettings.notes,
      }),
    [
      character?.descriptor,
      character?.hints,
      character?.name,
      shared.lockedLocation,
      toolSettings.notes,
      wardrobeLabelFor,
    ]
  );

  const queueSlot = useCallback(
    async (slot: DaySlot) => {
      setBusy(true);
      setError(null);
      setCopied(false);
      setActiveSlotId(slot.id);
      actions.resetStatuses();
      try {
        const prompt = buildSlotPrompt(slot);
        const finalized = await actions.finalizePrompt(prompt, character?.name || slot.label);
        setOutput(finalized);
        rememberDraftFields({
          toolKey: TOOL_ID,
          label: 'Day Planner',
          href: '/day',
          fields: [character?.name ?? '', slot.label, finalized],
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
        setError(err instanceof Error ? err.message : 'Could not queue that slot.');
      } finally {
        setBusy(false);
      }
    },
    [
      actions,
      buildSlotPrompt,
      character,
      hasPlate,
      plate,
      shared.activeCharacterId,
      shared.activeLookId,
      shared.identityKind,
      shared.ipAdapterStrength,
    ]
  );

  const queueAll = useCallback(async () => {
    for (const slot of slots) {
      await queueSlot(slot);
    }
  }, [queueSlot, slots]);

  const goRoleplay = useCallback(() => {
    if (character) {
      saveSharedSettings({
        ...loadSettingsCache().shared,
        ...applyCharacterRecord(character),
      });
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
        <ToolBadge accent={ACCENT}>Day Planner · {selectedModel?.comfyNode ?? 'model'}</ToolBadge>
      }
      title="Day Planner"
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
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.day} />

      <ToolSection
        title="Character"
        description="Same Character OS id as Cast, Fitting, and Roleplay."
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
        {hasPlate ? (
          <p className="type-caption mt-2 text-[var(--text-muted)]">
            Cast plate detected — queues use identity lock when available.
          </p>
        ) : (
          <p className="type-caption mt-2 text-[var(--text-muted)]">
            No Cast plate yet — stills queue as text scenes. Add a look in Cast or open Fitting
            Room.
          </p>
        )}
      </ToolSection>

      <ToolSection
        title="Day slots"
        description="Morning → night. Pick kit, setting, and beat per slot."
      >
        <div className="flex flex-wrap gap-2">
          {slots.map(slot => (
            <ChipButton
              key={slot.id}
              active={activeSlotId === slot.id}
              disabled={busy}
              onClick={() => setActiveSlotId(slot.id)}
            >
              {slot.label}
            </ChipButton>
          ))}
        </div>
        <FieldDivider />
        <label className="space-y-2">
          <FieldLabel>Outfit kit</FieldLabel>
          <SelectInput
            value={activeSlot.wardrobeId ?? ''}
            disabled={!wardrobeReady || busy}
            className={accentFocusClass(ACCENT)}
            onChange={event => {
              const value = event.target.value.trim();
              updateSlot(activeSlot.id, { wardrobeId: value || undefined });
            }}
          >
            {wardrobeOptions.map(option => (
              <option key={option.value || 'default'} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectInput>
        </label>
        <label className="mt-3 space-y-2">
          <FieldLabel>Setting</FieldLabel>
          <SelectInput
            value=""
            disabled={busy}
            className={accentFocusClass(ACCENT)}
            onChange={event => {
              const preset = ROLEPLAY_SETTING_PRESETS.find(
                entry => entry.id === event.target.value
              );
              if (preset) {
                updateSlot(activeSlot.id, { location: preset.setting });
              }
            }}
          >
            <option value="">Insert preset…</option>
            {ROLEPLAY_SETTING_PRESETS.map(preset => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </SelectInput>
          <TextArea
            rows={2}
            value={activeSlot.location ?? ''}
            className={accentFocusClass(ACCENT)}
            placeholder="e.g. sunlit café terrace, rainy commute, rooftop at dusk"
            onChange={event => updateSlot(activeSlot.id, { location: event.target.value })}
          />
        </label>
        <label className="mt-3 space-y-2">
          <FieldLabel>Beat</FieldLabel>
          <TextArea
            rows={3}
            value={activeSlot.sceneHints ?? ''}
            className={accentFocusClass(ACCENT)}
            placeholder="What happens in this part of the day?"
            onChange={event => updateSlot(activeSlot.id, { sceneHints: event.target.value })}
          />
        </label>
        <ToolActionRow>
          <Button
            size="sm"
            variant="primary"
            disabled={busy}
            onClick={() => void queueSlot(activeSlot)}
          >
            {busy ? 'Queueing…' : `Queue ${activeSlot.label.toLowerCase()}`}
          </Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void queueAll()}>
            Queue all slots
          </Button>
        </ToolActionRow>
      </ToolSection>

      <ToolSection title="Day notes" description="Optional notes layered onto every slot prompt.">
        <TextArea
          rows={2}
          value={toolSettings.notes ?? ''}
          className={accentFocusClass(ACCENT)}
          placeholder="e.g. cozy autumn day, light rain in the evening"
          onChange={event => updateToolSettings({ notes: event.target.value })}
        />
      </ToolSection>

      <ToolActionRow>
        {character ? (
          <>
            <ButtonLink
              href={`/fitting?character=${encodeURIComponent(character.id)}`}
              size="sm"
              variant="secondary"
            >
              Try on in Fitting
            </ButtonLink>
            <ButtonLink
              href={`/moodboard?character=${encodeURIComponent(character.id)}`}
              size="sm"
              variant="secondary"
            >
              Set look (Moodboard)
            </ButtonLink>
          </>
        ) : null}
        <Button size="sm" variant="secondary" disabled={busy} onClick={goRoleplay}>
          Continue in Roleplay
        </Button>
      </ToolActionRow>
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
        hints={toolSettings.notes}
        queueLabel="Queue slot"
        onSendComfyUi={() => void queueSlot(activeSlot)}
      />
    </ToolLayout>
  );
}
