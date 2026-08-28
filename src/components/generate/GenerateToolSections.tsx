'use client';

import dynamic from 'next/dynamic';
import { applySceneStarterWorkflowHints } from '@/lib/scene-starter-workflow-hints';
import ScenePromptResultPanel from '@/components/scene-tool/ScenePromptResultPanel';
import BrandBars from '@/components/BrandBars';
import MobileStickyQueueBar from '@/components/MobileStickyQueueBar';
import { VariationSliderField } from '@/components/scene-tool/SceneToolSections';
import SceneSetupSection from '@/components/scene-tool/SceneSetupSection';
import ToolPrimarySection from '@/components/ui/ToolPrimarySection';
import { HistoryHintSeedPanel } from '@/components/scene-tool/HistoryHintSeedPanel';
import { modelUsesTagAssist } from '@/lib/tag-assist';
import { ratingDrivenWildnessLabel } from '@/lib/rating-driven-random';
import { engineDisplayName, isCloudEngine } from '@/lib/engine/capabilities';
import { getReformatTargetLabel } from '@/lib/reformat-target';
import { isSportStarterPreset } from '@/lib/sport-presets';
import { modelUsesNegativePrompt } from '@/lib/prompt-pair';
import {
  RANDOMIZE_INGREDIENTS_LABEL,
  SCENE_WILDNESS_LABEL,
  rollVariationLabel,
} from '@/lib/tool-ui-labels';
import {
  CollapsibleSection,
  CodeBlock,
  SegmentedControl,
  ToolBadge,
  ToolLayout,
  accentButtonClass,
  accentFocusClass,
  accentRingClass,
} from '@/components/ui/ToolPageShell';
import { ChipButton, FieldDivider, FieldError, FieldLabel, TextArea } from '@/components/ui/Field';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import CollabPresenceBar from '@/components/CollabPresenceBar';
import { resolveCollabFieldValue } from '@/lib/collab-presence';
import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';
import {
  EXAMPLE_INPUTS,
  type useGenerateToolOrchestration,
} from '@/hooks/useGenerateToolOrchestration';
import { Button, PrimaryButton } from '@/components/ui/Button';

const SceneStarterPresetChips = dynamic(() => import('@/components/SceneStarterPresetChips'), {
  loading: () => (
    <div className="h-24 animate-pulse rounded-xl bg-[var(--bg-muted)]/40" aria-hidden />
  ),
});
const TagAssistToolbar = dynamic(() => import('@/components/TagAssistToolbar'), {
  ssr: false,
  loading: () => (
    <div className="h-12 animate-pulse rounded-xl bg-[var(--bg-muted)]/40" aria-hidden />
  ),
});
const SharedToolControls = dynamic(() => import('@/components/SharedToolControls'), {
  ssr: false,
  loading: () => (
    <div className="h-40 animate-pulse rounded-2xl bg-[var(--surface-muted)]/50" aria-hidden />
  ),
});

const ACCENT = 'brand' as const;

type GenerateToolViewModel = ReturnType<typeof useGenerateToolOrchestration>;

type GenerateToolSectionsProps = GenerateToolViewModel & {
  description: string;
};

export default function GenerateToolSections({
  description,
  mounted,
  shared,
  toolSettings,
  updateShared,
  updateToolSettings,
  mode,
  output,
  setOutput,
  handoffNegative,
  setHandoffNegative,
  showHandoffNegative,
  provider,
  randomResult,
  randomSeed,
  loading,
  error,
  copied,
  resultMeta,
  input,
  setInput,
  hintSource,
  historySeedScope,
  genre,
  includePeople,
  wildness,
  queueModel,
  generateModel,
  detail,
  variationEnabled,
  variationStrength,
  distinctPeople,
  alwaysIncludeClothing,
  seedLlmWithIngredients,
  autoFixRules,
  actions,
  queueGenerate,
  variationSeed,
  setQueueModel,
  setDetail,
  setVariationEnabled,
  setVariationStrength,
  setDistinctPeople,
  setModeAndCache,
  selectedModel,
  setHintSource,
  submitDisabled,
  submitDisabledReason,
  generateRandom,
  generate,
  copyOutput,
}: GenerateToolSectionsProps) {
  return (
    <ToolLayout
      accent={ACCENT}
      badge={
        <ToolBadge accent={ACCENT}>
          {isCloudEngine(shared.inferenceEngine)
            ? engineDisplayName(shared.inferenceEngine)
            : `ComfyUI · ${selectedModel.comfyNode}`}
        </ToolBadge>
      }
      title="Generate"
      description={description}
      sidebar={
        <SharedToolControls
          toolId="generate"
          shared={shared}
          onSharedSettingsChange={updateShared}
          onModelChange={setQueueModel}
          onDetailChange={setDetail}
          onWorkflowPresetChange={id => updateShared({ selectedWorkflowFileId: id })}
          showWardrobeOption={mode === 'positive' && (hintSource !== 'random' || includePeople)}
          alwaysIncludeClothing={alwaysIncludeClothing}
          onAlwaysIncludeClothingChange={value => updateShared({ alwaysIncludeClothing: value })}
          seedLlmWithIngredients={seedLlmWithIngredients}
          onSeedLlmWithIngredientsChange={value => updateShared({ seedLlmWithIngredients: value })}
          lockedWardrobeId={shared.lockedWardrobeId}
          lockedLocation={shared.lockedLocation}
          lockedVariationSeed={shared.lockedVariationSeed}
          onClearLockedWardrobe={() => updateShared({ lockedWardrobeId: undefined })}
          onClearLockedLocation={() => updateShared({ lockedLocation: undefined })}
          onClearLockedVariationSeed={() => updateShared({ lockedVariationSeed: undefined })}
          autoFixRules={autoFixRules}
          onAutoFixRulesChange={value => updateShared({ autoFixRules: value })}
          recommendFromText={input || output}
        />
      }
    >
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.generate} />
      {!output.trim() ? (
        <p className="ui-brand-tagline type-caption flex flex-wrap items-center gap-2 text-[var(--text-tertiary)]">
          <BrandBars />
          <span>
            Prompt Studio
            <span className="mx-1.5 text-[var(--border-strong)]">·</span>
            scene → queue → gallery — Random surprise skips the blank page
          </span>
        </p>
      ) : null}
      <CollabPresenceBar
        tool="generate"
        draft={input}
        draftFields={{ hints: input }}
        onApplyRemoteDraft={payload => {
          const hints = resolveCollabFieldValue(payload, 'hints');
          if (hints) {
            updateToolSettings({ hints });
          }
        }}
      />
      <SceneSetupSection
        title="Prompt"
        description="Write a scene idea, or use Random surprise if you have nothing in mind — then queue."
      >
        <HistoryHintSeedPanel
          tool="generate"
          compact
          hintSource={hintSource}
          historySeedScope={historySeedScope}
          hints={input}
          randomTheme={genre}
          lastHistorySeedEntryId={toolSettings.lastHistorySeedEntryId}
          onHintSourceChange={setHintSource}
          onHistorySeedScopeChange={scope => updateToolSettings({ historySeedScope: scope })}
          onHintsChange={setInput}
          onRandomThemeChange={value => updateToolSettings({ genre: value })}
          onHistorySeedApplied={result => {
            setInput(result.hints);
            updateToolSettings({ lastHistorySeedEntryId: result.entryId });
          }}
          accentFocusClassName={accentFocusClass(ACCENT)}
        />

        {hintSource !== 'random' && mode === 'positive' ? (
          <>
            <FieldDivider />
            <label htmlFor="edit-input" className="text-sm font-medium text-[var(--text-primary)]">
              Scene idea or keywords
            </label>
            <TextArea
              id="edit-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  void generate();
                }
              }}
              placeholder="e.g. neon alley, rain, black cat — any topic or words to paint into a scene"
              rows={5}
              className={`text-base ${accentFocusClass(ACCENT)}`}
            />
            {modelUsesTagAssist(queueModel) ? (
              <TagAssistToolbar value={input} onChange={setInput} textareaId="edit-input" />
            ) : null}
          </>
        ) : null}

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
                    onKeyDown={e => {
                      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                        e.preventDefault();
                        void generate();
                      }
                    }}
                    placeholder="e.g. do not change face, skin tone, or pose"
                    rows={5}
                    className={`text-base ${accentFocusClass(ACCENT)}`}
                  />
                </>
              ) : (
                <p className="type-caption text-[var(--text-muted)]">
                  Use Negative when you need a preserve list for edit or img2img workflows instead
                  of a full scene description.
                </p>
              )}
            </>
          )}
        </CollapsibleSection>

        <div className="ui-cta-block">
          <div className="flex flex-wrap items-center gap-2">
            <PrimaryButton
              accentClassName={accentButtonClass(ACCENT)}
              type="button"
              data-action="primary-generate"
              onClick={() => void generate()}
              disabled={submitDisabled}
              loading={loading}
              loadingLabel={
                hintSource === 'random' ? 'Generating random scene' : 'Generating scene prompt'
              }
              title={submitDisabledReason ?? undefined}
              aria-disabled={submitDisabled}
            >
              {hintSource === 'random' ? 'Generate random scene' : 'Generate scene prompt'}
            </PrimaryButton>
            {hintSource !== 'random' ? (
              <Button
                type="button"
                variant="secondary"
                data-action="random-surprise"
                disabled={!mounted || loading}
                onClick={() => {
                  setHintSource('random');
                  void generateRandom();
                }}
              >
                Random surprise
              </Button>
            ) : null}
          </div>

          {submitDisabledReason && !loading && <FieldError>{submitDisabledReason}</FieldError>}

          {error && <FieldError>{error}</FieldError>}
        </div>
      </SceneSetupSection>

      {output && (hintSource === 'random' || mode === 'positive') && (
        <ScenePromptResultPanel
          compactActions
          output={output}
          onOutputChange={setOutput}
          result={randomResult ?? resultMeta}
          copied={copied}
          onCopy={() => void copyOutput()}
          actions={actions}
          shared={shared}
          selectedComfyNode={resultMeta?.comfyNode ?? selectedModel.comfyNode}
          queueLabel="Queue"
          includeStickyBar={false}
          hints={hintSource === 'random' ? genre : input}
          extraMeta={
            hintSource === 'random' && randomSeed
              ? `seed: ${randomSeed}`
              : resultMeta
                ? `${resultMeta.limits.minChars ? `${resultMeta.limits.minChars}–` : ''}${resultMeta.limits.maxChars} char limit · ${output.length} chars`
                : undefined
          }
          variationSeed={variationSeed}
          preDiagnostics={actions.preDiagnostics}
          reformatTargetLabel={getReformatTargetLabel(generateModel)}
          onSendComfyUi={queueGenerate}
          onLockSeed={() => {
            if (variationSeed) {
              updateShared({ lockedVariationSeed: variationSeed });
            }
          }}
        />
      )}

      {showHandoffNegative && modelUsesNegativePrompt(queueModel) ? (
        <ToolPrimarySection title="Negative (from still)">
          <FieldLabel hint="Queued with Prompt+ from the gallery still. Edit or clear before send.">
            Negative prompt
          </FieldLabel>
          <TextArea
            data-testid="generate-handoff-negative"
            value={handoffNegative}
            onChange={event => setHandoffNegative(event.target.value)}
            rows={3}
            className={`font-mono text-sm ${accentFocusClass(ACCENT)}`}
          />
        </ToolPrimarySection>
      ) : null}

      {output && mode === 'negative' && (
        <ToolPrimarySection title="Generated preserve / negative prompt">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {provider ? (
              <p className="type-caption">via {provider === 'llm' ? 'LLM' : 'template fallback'}</p>
            ) : (
              <span />
            )}
            <Button variant="secondary" size="sm" onClick={() => void copyOutput()}>
              {copied ? 'Copied!' : 'Copy for ComfyUI'}
            </Button>
          </div>
          <CodeBlock>{output}</CodeBlock>
        </ToolPrimarySection>
      )}

      {output && hintSource !== 'random' && mode === 'positive' && (
        <p className="-mt-4 text-xs text-[var(--text-muted)]">
          Paste into{' '}
          <code className="rounded bg-[var(--bg-muted)] px-1 text-[var(--accent-text)]">
            {resultMeta?.comfyNode ?? selectedModel.comfyNode}
          </code>
          . Press Ctrl+Enter to regenerate.
        </p>
      )}

      <CollapsibleSection
        title="How it works"
        summary="Model-specific prompt tips and variation controls."
        defaultOpen={false}
        persistKey="generate-how-it-works"
        className="text-sm text-[var(--text-muted)]"
      >
        <ul className="mt-1 list-inside list-disc space-y-2 leading-relaxed">
          <li>
            Pick your <strong className="font-medium text-[var(--text-muted)]">target model</strong>
            —SD1.5, SDXL, SD3, Flux, Qwen Image, Hunyuan, PixArt, and more—each uses a prompt style
            tuned for that architecture.
          </li>
          <li>
            <strong className="font-medium text-[var(--text-muted)]">Edit-2511</strong> favors
            explicit keep/change instructions and Figure 1 / Figure 2 references for multi-image
            workflows.
          </li>
          <li>
            <strong className="font-medium text-[var(--text-muted)]">FLUX.2 Klein</strong> wants
            subject-first photographic prose—materials, lighting, camera. Negative prompts are
            ignored; use positive phrasing instead.
          </li>
          <li>
            <strong className="font-medium text-[var(--text-muted)]">Image-2512</strong> favors
            concise factual prose with color, texture, and spatial relationships—quote visible text
            in double quotes.
          </li>
          <li>
            <strong className="font-medium text-[var(--text-muted)]">Image-2.0</strong> Rich detail
            targets at least ~1100 characters (max ~1400).
          </li>
          <li>
            Use <strong className="font-medium text-[var(--text-muted)]">Concise</strong> if Qwen
            output still looks jumbled; use{' '}
            <strong className="font-medium text-[var(--text-muted)]">Rich</strong> when scenes feel
            too thin.
          </li>
          <li>
            Separate ideas with commas, but keep the output focused—Qwen renders cleaner with 2–3
            short sentences, not dense prose.
          </li>
          <li>
            Use{' '}
            <strong className="font-medium text-[var(--text-muted)]">Distinct individuals</strong>{' '}
            when your input has two or more people—it breaks them into separate, fully described
            characters.
          </li>
          <li>
            Use the variation seed toggle to control randomness—off for consistent output, higher
            strength for more diverse scenes.
          </li>
          <li>
            Add &quot;keep face/pose&quot; if you want the subject preserved while the surroundings
            are repainted in words.
          </li>
        </ul>
      </CollapsibleSection>
      <MobileStickyQueueBar
        disabled={!output.trim()}
        label="Queue"
        status={actions.comfyUiStatus}
        primaryGenerate
        onQueue={queueGenerate}
      />
    </ToolLayout>
  );
}
