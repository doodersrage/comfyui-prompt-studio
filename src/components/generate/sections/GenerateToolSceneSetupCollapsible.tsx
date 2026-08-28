'use client';

import dynamic from 'next/dynamic';
import { VariationSliderField } from '@/components/scene-tool/SceneToolSections';
import { ratingDrivenWildnessLabel } from '@/lib/rating-driven-random';
import { isSportStarterPreset } from '@/lib/sport-presets';
import {
  RANDOMIZE_INGREDIENTS_LABEL,
  SCENE_WILDNESS_LABEL,
  rollVariationLabel,
} from '@/lib/tool-ui-labels';
import {
  CollapsibleSection,
  SegmentedControl,
  accentFocusClass,
  accentRingClass,
} from '@/components/ui/ToolPageShell';
import { ChipButton, FieldDivider, FieldLabel, TextArea } from '@/components/ui/Field';
import { applySceneStarterWorkflowHints } from '@/lib/scene-starter-workflow-hints';
import {
  EXAMPLE_INPUTS,
  type useGenerateToolOrchestration,
} from '@/hooks/useGenerateToolOrchestration';

const ACCENT = 'brand' as const;

const SceneStarterPresetChips = dynamic(() => import('@/components/SceneStarterPresetChips'), {
  loading: () => (
    <div className="h-24 animate-pulse rounded-xl bg-[var(--bg-muted)]/40" aria-hidden />
  ),
});

type Props = Pick<
  ReturnType<typeof useGenerateToolOrchestration>,
  | 'toolSettings'
  | 'updateToolSettings'
  | 'updateShared'
  | 'mode'
  | 'input'
  | 'setInput'
  | 'hintSource'
  | 'includePeople'
  | 'wildness'
  | 'distinctPeople'
  | 'variationEnabled'
  | 'variationStrength'
  | 'setModeAndCache'
  | 'setDistinctPeople'
  | 'setVariationEnabled'
  | 'setVariationStrength'
>;

export function GenerateToolSceneSetupCollapsible(props: Props) {
  const {
    toolSettings,
    updateToolSettings,
    updateShared,
    mode,
    input,
    setInput,
    hintSource,
    includePeople,
    wildness,
    distinctPeople,
    variationEnabled,
    variationStrength,
    setModeAndCache,
    setDistinctPeople,
    setVariationEnabled,
    setVariationStrength,
  } = props;

  return (
    <CollapsibleSection
      title="Scene setup"
      summary="Presets, people handling, variation, and negative / preserve mode."
      defaultOpen={hintSource === 'random' || mode === 'negative'}
      persistKey="generate-scene-setup"
    >
      {hintSource === 'random' ? (
        <>
          <label className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={includePeople}
              onChange={e => updateToolSettings({ includePeople: e.target.checked })}
              className="ui-checkbox"
            />
            Include people in random ingredients
          </label>

          <FieldDivider />

          <VariationSliderField
            label={SCENE_WILDNESS_LABEL}
            value={wildness}
            onChange={value => updateToolSettings({ wildness: value })}
            valueLabel={ratingDrivenWildnessLabel(wildness)}
            minLabel="Safe"
            maxLabel="Wild"
            accentRingClassName={accentRingClass(ACCENT)}
          />
        </>
      ) : (
        <>
          {mode === 'positive' ? (
            <>
              <SceneStarterPresetChips
                mode="all"
                accent={ACCENT}
                currentHints={input}
                variationsTarget="generate"
                category={toolSettings.sceneStarterCategory ?? 'all'}
                onCategoryChange={category =>
                  updateToolSettings({ sceneStarterCategory: category })
                }
                filterState={{
                  category: toolSettings.sceneStarterCategory ?? 'all',
                  framing: toolSettings.sceneStarterFraming ?? 'all',
                  query: toolSettings.sceneStarterQuery ?? '',
                  tags: toolSettings.sceneStarterTags ?? [],
                }}
                onFilterChange={filter =>
                  updateToolSettings({
                    sceneStarterCategory: filter.category,
                    sceneStarterFraming: filter.framing,
                    sceneStarterQuery: filter.query,
                    sceneStarterTags: filter.tags,
                  })
                }
                selectedId={toolSettings.sceneStarterPresetId ?? toolSettings.sportPresetId}
                onSelect={preset => {
                  updateToolSettings({
                    sceneStarterPresetId: preset.id,
                    sportPresetId: isSportStarterPreset(preset.id) ? preset.id : undefined,
                    hintSource: 'manual',
                    generateSource: 'keywords',
                  });
                  setInput(preset.hints);
                  applySceneStarterWorkflowHints(preset, updateShared);
                }}
              />

              <FieldDivider />

              <div className="flex flex-wrap gap-2">
                {EXAMPLE_INPUTS.map(example => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setInput(example)}
                    className="ui-tag"
                  >
                    {example}
                  </button>
                ))}
              </div>

              <FieldDivider />

              <div className="space-y-3">
                <FieldLabel hint="Choose how multiple people are written into the prompt.">
                  People in scene
                </FieldLabel>
                <div className="flex flex-wrap gap-2">
                  <ChipButton active={distinctPeople} onClick={() => setDistinctPeople(true)}>
                    Distinct individuals
                  </ChipButton>
                  <ChipButton active={!distinctPeople} onClick={() => setDistinctPeople(false)}>
                    Grouped / couple
                  </ChipButton>
                </div>
                <p className="type-caption text-[var(--text-muted)]">
                  {distinctPeople
                    ? 'Splits two men / two women into separate left-right descriptions. Gender from your input is enforced.'
                    : 'Writes pairs as one unified couple or ensemble—not split into separate people.'}
                </p>
              </div>

              <FieldDivider />

              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <FieldLabel hint="Randomize people, lighting, framing, and palette each run.">
                    {RANDOMIZE_INGREDIENTS_LABEL}
                  </FieldLabel>
                  <label className="inline-flex cursor-pointer items-center gap-2">
                    <span className="type-caption text-[var(--text-tertiary)]">
                      {variationEnabled ? 'On' : 'Off'}
                    </span>
                    <input
                      type="checkbox"
                      checked={variationEnabled}
                      onChange={e => setVariationEnabled(e.target.checked)}
                      className="ui-checkbox"
                    />
                  </label>
                </div>

                {variationEnabled && (
                  <div className="space-y-3">
                    <VariationSliderField
                      showLabel={false}
                      value={variationStrength}
                      onChange={setVariationStrength}
                      valueLabel={`${rollVariationLabel(variationStrength)} (${variationStrength})`}
                      minLabel="Subtle"
                      maxLabel="Wild"
                      accentRingClassName={accentRingClass(ACCENT)}
                    />
                    <div className="flex flex-wrap gap-2">
                      {[
                        { label: 'Subtle', value: 20 },
                        { label: 'Light', value: 40 },
                        { label: 'Balanced', value: 65 },
                        { label: 'Wild', value: 95 },
                      ].map(preset => (
                        <ChipButton
                          key={preset.label}
                          active={variationStrength === preset.value}
                          onClick={() => setVariationStrength(preset.value)}
                        >
                          {preset.label}
                        </ChipButton>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <FieldDivider />
            </>
          ) : null}

          <SegmentedControl
            aria-label="Prompt mode"
            value={mode}
            onChange={setModeAndCache}
            options={[
              { value: 'positive', label: 'Positive' },
              { value: 'negative', label: 'Negative / Preserve', tone: 'danger' },
            ]}
          />

          {mode === 'negative' ? (
            <>
              <label
                htmlFor="edit-input-negative"
                className="mt-3 block text-sm font-medium text-[var(--text-primary)]"
              >
                Preserve / negative prompt
              </label>
              <TextArea
                id="edit-input-negative"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="e.g. do not change face, skin tone, or pose"
                rows={5}
                className={`text-base ${accentFocusClass(ACCENT)}`}
              />
            </>
          ) : (
            <p className="type-caption text-[var(--text-muted)]">
              Use Negative when you need a preserve list for edit or img2img workflows instead of a
              full scene description.
            </p>
          )}
        </>
      )}
    </CollapsibleSection>
  );
}
