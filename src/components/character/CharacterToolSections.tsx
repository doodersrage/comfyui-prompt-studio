'use client';

import dynamic from 'next/dynamic';
import BackgroundPresetControls from '@/components/BackgroundPresetControls';
import RegionalPromptBuilderPanel from '@/components/RegionalPromptBuilderPanel';
import type { BatchPromptItemActions } from '@/components/EnhancedPromptResult';
import ScenePromptResultPanel from '@/components/scene-tool/ScenePromptResultPanel';
import MobileStickyQueueBar from '@/components/MobileStickyQueueBar';
import { applySceneStarterWorkflowHints } from '@/lib/scene-starter-workflow-hints';
import { SubjectShotScaleControl } from '@/components/ShotScaleControl';
import {
  SceneGenerateFooter,
  SceneHintsField,
  SceneQuickTags,
  VariationSliderField,
} from '@/components/scene-tool/SceneToolSections';
import SceneSetupSection from '@/components/scene-tool/SceneSetupSection';
import { HistoryHintSeedPanel } from '@/components/scene-tool/HistoryHintSeedPanel';
import { regionalPromptCustomTokens } from '@/lib/regional-prompt-builder';
import { readVariationSeedFromMetadata } from '@/lib/variation-seed-metadata';
import { ROLL_VARIATION_LABEL, rollVariationLabel } from '@/lib/tool-ui-labels';
import { getSportPreset, isSportStarterPreset } from '@/lib/sport-presets';
import { accentFocusClass, accentRingClass } from '@/lib/tool-theme';
import { ToolBadge, CollapsibleSection, ToolLayout } from '@/components/ui/ToolPageShell';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import CollabPresenceBar from '@/components/CollabPresenceBar';
import SceneFamilySwitcher from '@/components/SceneFamilySwitcher';
import { ChipButton, FieldDivider, FieldLabel } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';
import {
  CHARACTER_SCENE_MODE_OPTIONS,
  accentForSceneMode,
  presetVariantForSceneMode,
  type useCharacterToolOrchestration,
} from '@/hooks/useCharacterToolOrchestration';
import type { RegionalPromptSegment } from '@/lib/regional-prompt-builder';
import type { CharacterSceneMode } from '@/lib/settings-cache';

const SharedToolControls = dynamic(() => import('@/components/SharedToolControls'), {
  ssr: false,
  loading: () => (
    <div className="h-40 animate-pulse rounded-2xl bg-[var(--surface-muted)]/50" aria-hidden />
  ),
});
const SceneStarterPresetChips = dynamic(() => import('@/components/SceneStarterPresetChips'), {
  loading: () => (
    <div className="h-24 animate-pulse rounded-xl bg-[var(--bg-muted)]/40" aria-hidden />
  ),
});
const CharacterPresetControls = dynamic(() => import('@/components/CharacterPresetControls'), {
  loading: () => (
    <div className="h-48 animate-pulse rounded-xl bg-[var(--bg-muted)]/40" aria-hidden />
  ),
});

function defaultPortraitStyle(mode: CharacterSceneMode): 'portrait' | 'full-body' | 'action' {
  return mode === 'solo' ? 'portrait' : 'action';
}

type CharacterToolViewModel = ReturnType<typeof useCharacterToolOrchestration>;

type CharacterToolSectionsProps = CharacterToolViewModel & {
  description: string;
};

export default function CharacterToolSections({ description, ...vm }: CharacterToolSectionsProps) {
  const {
    mounted,
    shared,
    toolSettings,
    updateShared,
    updateToolSettings,
    output,
    setOutput,
    batchResults,
    setBatchResults,
    result,
    loading,
    error,
    copied,
    lockedWardrobeLabel,
    sceneMode,
    accent,
    historySeedTool,
    hintSource,
    historySeedScope,
    generateDisabledReason,
    portraitStyle,
    actions,
    selectedModel,
    inferredSport,
    variationSeed,
    generate,
    exportBatch,
    batchPrompts,
    copyOutput,
    rememberHints,
    applyCollabDraft,
    soloBatchCount,
  } = vm;

  return (
    <ToolLayout
      accent={accent}
      badge={<ToolBadge accent={accent}>Character · {selectedModel.comfyNode}</ToolBadge>}
      title="Character"
      description={description}
      sidebar={
        <SharedToolControls
          toolId="character"
          shared={shared}
          onModelChange={model => updateShared({ model })}
          onDetailChange={detail => updateShared({ detail })}
          onWorkflowPresetChange={id => updateShared({ selectedWorkflowFileId: id })}
          onSharedSettingsChange={updateShared}
          detailHelp={
            sceneMode === 'duo'
              ? 'Action mode works best with Rich detail for sport scenes.'
              : 'Rich detail recommended for character sheets and portraits.'
          }
          showWardrobeOption
          alwaysIncludeClothing={shared.alwaysIncludeClothing !== false}
          onAlwaysIncludeClothingChange={value => updateShared({ alwaysIncludeClothing: value })}
          seedLlmWithIngredients={shared.seedLlmWithIngredients !== false}
          onSeedLlmWithIngredientsChange={value => updateShared({ seedLlmWithIngredients: value })}
          lockedWardrobeId={shared.lockedWardrobeId}
          lockedWardrobeLabel={
            shared.lockedWardrobeId ? (lockedWardrobeLabel ?? shared.lockedWardrobeId) : undefined
          }
          onClearLockedWardrobe={() => updateShared({ lockedWardrobeId: undefined })}
          lockedLocation={shared.lockedLocation}
          onClearLockedLocation={() => updateShared({ lockedLocation: undefined })}
          lockedVariationSeed={shared.lockedVariationSeed}
          onClearLockedVariationSeed={() => updateShared({ lockedVariationSeed: undefined })}
          autoFixRules={shared.autoFixRules !== false}
          onAutoFixRulesChange={value => updateShared({ autoFixRules: value })}
          activeCharacterDescriptor={shared.activeCharacterDescriptor}
          onActiveCharacterDescriptorChange={value =>
            updateShared({ activeCharacterDescriptor: value || undefined })
          }
          recommendFromText={output || toolSettings.hints || ''}
        />
      }
    >
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.character} />
      <CollabPresenceBar
        tool="character"
        draft={toolSettings.hints ?? ''}
        draftFields={{ hints: toolSettings.hints ?? '' }}
        onApplyRemoteDraft={applyCollabDraft}
      />
      <SceneSetupSection description="Pick a mode, add hints, then generate.">
        <FieldLabel>Scene family</FieldLabel>
        <SceneFamilySwitcher />
        <FieldLabel>Scene mode</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {CHARACTER_SCENE_MODE_OPTIONS.map(option => (
            <ChipButton
              key={option.value}
              active={sceneMode === option.value}
              onClick={() =>
                updateToolSettings({
                  sceneMode: option.value,
                  portraitStyle: defaultPortraitStyle(option.value),
                })
              }
            >
              {option.label}
            </ChipButton>
          ))}
        </div>

        <FieldDivider />

        <CollapsibleSection
          title="Presets & options"
          summary="Scene starters, character options, environment, and framing."
          defaultOpen={false}
          persistKey="character-presets"
        >
          {sceneMode === 'solo' ? (
            <SceneStarterPresetChips
              mode="solo"
              accent={accent}
              currentHints={toolSettings.hints ?? ''}
              variationsTarget="character"
              category={toolSettings.sceneStarterCategory ?? 'all'}
              onCategoryChange={category => updateToolSettings({ sceneStarterCategory: category })}
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
              selectedId={toolSettings.sceneStarterPresetId}
              onSelect={preset => {
                updateToolSettings({
                  sceneStarterPresetId: preset.id,
                  hints: preset.hints,
                  portraitStyle: preset.portraitStyle ?? 'portrait',
                  sportPresetId: undefined,
                  hintSource: 'manual',
                });
                applySceneStarterWorkflowHints(preset, updateShared);
              }}
            />
          ) : null}

          {sceneMode === 'duo' ? (
            <SceneStarterPresetChips
              mode="duo"
              accent={accent}
              currentHints={toolSettings.hints ?? ''}
              variationsTarget="duo"
              category={toolSettings.sceneStarterCategory ?? 'all'}
              onCategoryChange={category => updateToolSettings({ sceneStarterCategory: category })}
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
                  hints: preset.hints,
                  portraitStyle: preset.portraitStyle ?? 'action',
                  teamKit: preset.teamKit ?? false,
                  hintSource: 'manual',
                });
                applySceneStarterWorkflowHints(preset, updateShared);
              }}
            />
          ) : null}

          {sceneMode === 'compose' ? (
            <>
              <FieldLabel>Subject in scene</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { label: 'Solo character', value: 'character' },
                    { label: 'Duo / sport', value: 'duo' },
                  ] as const
                ).map(option => (
                  <ChipButton
                    key={option.value}
                    active={(toolSettings.composeSubjectMode ?? 'duo') === option.value}
                    onClick={() => updateToolSettings({ composeSubjectMode: option.value })}
                  >
                    {option.label}
                  </ChipButton>
                ))}
              </div>

              <FieldDivider />

              <SceneQuickTags
                settingType={toolSettings.settingType ?? ''}
                timeOfDay={toolSettings.timeOfDay ?? ''}
                mood={toolSettings.mood ?? ''}
                onSettingTypeChange={value => updateToolSettings({ settingType: value })}
                onTimeOfDayChange={value => updateToolSettings({ timeOfDay: value })}
                onMoodChange={value => updateToolSettings({ mood: value })}
                inputClassName={accentFocusClass(accent)}
              />

              <BackgroundPresetControls
                mounted={mounted}
                settings={toolSettings}
                onChange={patch => updateToolSettings(patch as Partial<typeof toolSettings>)}
              />

              <FieldDivider />
            </>
          ) : null}

          {(sceneMode === 'solo' || sceneMode === 'duo') && <FieldDivider />}

          <CharacterPresetControls
            mounted={mounted}
            settings={toolSettings}
            onChange={updateToolSettings}
            variant={presetVariantForSceneMode(sceneMode)}
          />
        </CollapsibleSection>

        <FieldDivider />

        <HistoryHintSeedPanel
          tool={historySeedTool}
          hintSource={hintSource}
          historySeedScope={historySeedScope}
          hints={toolSettings.hints ?? ''}
          randomTheme={toolSettings.randomTheme ?? ''}
          lastHistorySeedEntryId={toolSettings.lastHistorySeedEntryId}
          onHintSourceChange={source => updateToolSettings({ hintSource: source })}
          onHistorySeedScopeChange={scope => updateToolSettings({ historySeedScope: scope })}
          onHintsChange={value => {
            updateToolSettings({ hints: value });
            rememberHints(value);
          }}
          onRandomThemeChange={value => updateToolSettings({ randomTheme: value })}
          onHistorySeedApplied={result =>
            updateToolSettings({
              hints: result.hints,
              lastHistorySeedEntryId: result.entryId,
            })
          }
          accentFocusClassName={accentFocusClass(accent)}
        />

        {hintSource !== 'random' ? (
          <>
            <FieldDivider />
            <SceneHintsField
              value={toolSettings.hints ?? ''}
              onChange={value => {
                updateToolSettings({ hints: value });
                rememberHints(value);
              }}
              placeholder={
                sceneMode === 'duo'
                  ? 'two female gravel cyclists in a fierce competition on a muddy doubletrack'
                  : sceneMode === 'compose'
                    ? 'two female gravel cyclists in fierce competition'
                    : 'e.g. young woman in her twenties, long dark hair; on a Tokyo rooftop at night'
              }
              rows={sceneMode === 'duo' ? 4 : 3}
              className={accentFocusClass(accent)}
            />
          </>
        ) : null}

        {hintSource !== 'random' ? (
          <CollapsibleSection
            title="Advanced scene options"
            summary="Regional prompts, duo batch, shot scale, and merge style."
            defaultOpen={false}
            persistKey="character-advanced"
          >
            <RegionalPromptBuilderPanel
              accentClassName={accentFocusClass(accent)}
              segments={toolSettings.regionalSegments}
              onSegmentsChange={(segments: RegionalPromptSegment[]) =>
                updateToolSettings({ regionalSegments: segments })
              }
              onApply={prompt =>
                updateToolSettings({
                  hints: toolSettings.hints?.trim()
                    ? `${toolSettings.hints.trim()}. ${prompt}`
                    : prompt,
                })
              }
            />

            {sceneMode === 'duo' || sceneMode === 'compose' ? (
              <>
                <FieldDivider />
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--border-subtle)] p-3">
                    <input
                      type="checkbox"
                      checked={toolSettings.teamKit === true}
                      onChange={event => updateToolSettings({ teamKit: event.target.checked })}
                      className={`mt-1 h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-base)] ${accentRingClass(accent)}`}
                    />
                    <span className="space-y-1">
                      <span className="text-sm font-medium text-[var(--text-primary)]">
                        Team kit
                      </span>
                      <span className="block text-xs text-[var(--text-muted)]">
                        Identical kits for both athletes. Off = rival accent colors.
                      </span>
                    </span>
                  </label>

                  {sceneMode === 'duo' ? (
                    <div className="space-y-2">
                      <FieldLabel htmlFor="batch-count">Batch count</FieldLabel>
                      <input
                        id="batch-count"
                        type="number"
                        min={1}
                        max={12}
                        value={toolSettings.batchCount ?? 3}
                        onChange={event =>
                          updateToolSettings({
                            batchCount: Math.min(12, Math.max(1, Number(event.target.value) || 3)),
                          })
                        }
                        className="ui-input w-full px-4 py-2 text-sm"
                      />
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}

            <FieldDivider />

            <SubjectShotScaleControl
              value={portraitStyle}
              onChange={value => updateToolSettings({ portraitStyle: value })}
            />

            {sceneMode === 'compose' ? (
              <>
                <FieldDivider />
                <FieldLabel>Merge style</FieldLabel>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      { label: 'Layered sections', value: 'layered' },
                      { label: 'Inline prose', value: 'inline' },
                    ] as const
                  ).map(option => (
                    <ChipButton
                      key={option.value}
                      active={(toolSettings.composeStyle ?? 'layered') === option.value}
                      onClick={() => updateToolSettings({ composeStyle: option.value })}
                    >
                      {option.label}
                    </ChipButton>
                  ))}
                </div>
              </>
            ) : null}
          </CollapsibleSection>
        ) : null}

        <FieldDivider />

        <VariationSliderField
          label={ROLL_VARIATION_LABEL}
          value={toolSettings.variationStrength ?? 50}
          onChange={value => updateToolSettings({ variationStrength: value })}
          valueLabel={`${rollVariationLabel(toolSettings.variationStrength ?? 50)} (${toolSettings.variationStrength ?? 50})`}
          accentRingClassName={accentRingClass(accent)}
        />

        <SceneGenerateFooter
          accent={accent}
          label={
            sceneMode === 'compose'
              ? 'Compose scene prompt'
              : sceneMode === 'duo'
                ? 'Generate duo'
                : 'Generate character prompt'
          }
          onClick={() => void generate(false)}
          disabled={!mounted || Boolean(generateDisabledReason)}
          loading={loading}
          loadingLabel="Generating character prompt"
          error={error ?? generateDisabledReason}
        >
          {sceneMode !== 'compose' ? (
            <Button
              variant="secondary"
              disabled={!mounted || Boolean(generateDisabledReason)}
              loading={loading}
              loadingLabel="Rolling batch variations"
              onClick={() => void generate(true)}
            >
              Batch {sceneMode === 'duo' ? (toolSettings.batchCount ?? 3) : soloBatchCount}
            </Button>
          ) : null}
        </SceneGenerateFooter>
      </SceneSetupSection>

      <ScenePromptResultPanel
        output={output}
        onOutputChange={setOutput}
        result={result}
        copied={copied}
        onCopy={() => void copyOutput()}
        actions={actions}
        shared={shared}
        selectedComfyNode={result?.comfyNode ?? selectedModel.comfyNode}
        queueLabel="Queue character"
        hints={toolSettings.hints}
        includeStickyBar={false}
        extraMeta={
          sceneMode === 'duo' && toolSettings.sportPresetId
            ? getSportPreset(toolSettings.sportPresetId)?.label
            : undefined
        }
        preDiagnostics={actions.preDiagnostics}
        previewSport={inferredSport}
        variationSeed={variationSeed}
        onLockSeed={() => {
          if (variationSeed) {
            updateShared({ lockedVariationSeed: variationSeed });
          }
        }}
        onSendComfyUi={() =>
          void actions.sendComfyUi(output, inferredSport, undefined, {
            customTokens: regionalPromptCustomTokens(toolSettings.regionalSegments ?? []),
          })
        }
        onCopyPair={() => void actions.copyPromptPair(output, inferredSport)}
        resultExtras={{
          onExportBatch: batchResults.length > 1 ? exportBatch : undefined,
          onQueueBatchComfyUi:
            batchResults.length > 1
              ? () => void actions.sendBatchComfyUi(batchPrompts, inferredSport)
              : undefined,
          batchItems:
            batchResults.length > 1
              ? batchResults.map(entry => ({
                  prompt: entry.prompt,
                  metadata: entry.metadata,
                }))
              : undefined,
          onBatchPromptChange:
            batchResults.length > 1
              ? (index: number, value: string) => {
                  setBatchResults(previous =>
                    previous.map((entry, entryIndex) =>
                      entryIndex === index ? { ...entry, prompt: value } : entry
                    )
                  );
                }
              : undefined,
          batchCrossLinks: {
            hintsForDuo: toolSettings.hints,
            hintsForCharacter: toolSettings.hints,
          },
          batchPromptActions: {
            onQueueComfyUi: prompt =>
              void actions.sendComfyUi(prompt, inferredSport, undefined, {
                customTokens: regionalPromptCustomTokens(toolSettings.regionalSegments ?? []),
              }),
            onSaveHistory: ({ prompt, metadata }) =>
              actions.saveHistory({
                prompt,
                hints: toolSettings.hints,
                metadata,
              }),
            onCopyPair: prompt => void actions.copyPromptPair(prompt, inferredSport),
            onExportSidecar: (prompt, _index, metadata) =>
              void actions.exportSidecar(prompt, {
                comfyNode: result?.comfyNode ?? selectedModel.comfyNode,
                metadata,
                variationSeed:
                  readVariationSeedFromMetadata(metadata) ?? shared.lockedVariationSeed,
              }),
          } satisfies BatchPromptItemActions,
        }}
      />
      <MobileStickyQueueBar
        disabled={!output.trim()}
        label="Queue character"
        status={actions.comfyUiStatus}
        primaryGenerate
        onQueue={() =>
          void actions.sendComfyUi(output, inferredSport, undefined, {
            customTokens: regionalPromptCustomTokens(toolSettings.regionalSegments ?? []),
          })
        }
      />
    </ToolLayout>
  );
}
