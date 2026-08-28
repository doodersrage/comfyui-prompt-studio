'use client';

import BatchLintGatePanel from '@/components/BatchLintGatePanel';
import BatchReadinessPanel, {
  applyReadinessFilterToPrompts,
} from '@/components/BatchReadinessPanel';
import BatchQueueProgress from '@/components/BatchQueueProgress';
import MobileStickyQueueBar from '@/components/MobileStickyQueueBar';
import SharedToolControls from '@/components/SharedToolControls';
import SportPresetChips from '@/components/SportPresetChips';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import SidecarImportButton from '@/components/SidecarImportButton';
import VirtualizedVariationResults, {
  shouldVirtualizeVariationResults,
} from '@/components/VirtualizedVariationResults';
import { HistoryHintSeedPanel } from '@/components/scene-tool/HistoryHintSeedPanel';
import ToolPrimarySection from '@/components/ui/ToolPrimarySection';
import type { useVariationGridOrchestration } from '@/hooks/useVariationGridOrchestration';
import { batchFixPrompts, filterBatchByLintIndexes } from '@/lib/batch-lint-gate';
import { downloadMatrixCsv } from '@/lib/matrix-export-formats';
import type { MatrixAxisKind } from '@/lib/variation-matrix';
import type { PromptSidecar } from '@/lib/prompt-sidecar';
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';
import { SHOT_SCALE_LABEL, rollVariationLabel } from '@/lib/tool-ui-labels';
import type { VariationTarget } from '@/lib/variation-request-body';
import {
  ToolBadge,
  ToolLayout,
  accentButtonClass,
  accentFocusClass,
  accentRingClass,
} from '@/components/ui/ToolPageShell';
import { FieldError, FieldLabel, TextArea } from '@/components/ui/Field';
import { Button, PrimaryButton } from '@/components/ui/Button';

const ACCENT = 'brand' as const;

type VariationGridViewModel = ReturnType<typeof useVariationGridOrchestration>;

type VariationGridToolSectionsProps = VariationGridViewModel & {
  description: string;
};

export default function VariationGridToolSections({
  description,
  isSimple,
  shared,
  toolSettings,
  updateShared,
  updateToolSettings,
  results,
  setResults,
  loading,
  queueLoading,
  error,
  status,
  comfyStatus,
  importStatus,
  setImportStatus,
  lintSummary,
  setLintSummary,
  lintLoading,
  readyOnly,
  setReadyOnly,
  queueProgress,
  rollProgress,
  target,
  hintSource,
  historySeedScope,
  historyTool,
  historyCandidateCount,
  gridMode,
  count,
  matrixRowCount,
  matrixColCount,
  matrixAxisRow,
  matrixAxisCol,
  readinessByIndex,
  rollGrid,
  rollMatrix,
  executeQueue,
  queueGrid,
}: VariationGridToolSectionsProps) {
  return (
    <ToolLayout
      accent={ACCENT}
      width="wide"
      badge={<ToolBadge accent={ACCENT}>Variation grid</ToolBadge>}
      title="Variations"
      description={description}
      sidebar={
        <SharedToolControls
          toolId="variations"
          shared={shared}
          onModelChange={model => updateShared({ model })}
          onDetailChange={detail => updateShared({ detail })}
          onWorkflowPresetChange={id => updateShared({ selectedWorkflowFileId: id })}
          seedLlmWithIngredients={shared.seedLlmWithIngredients !== false}
          onSeedLlmWithIngredientsChange={value => updateShared({ seedLlmWithIngredients: value })}
          lockedWardrobeId={shared.lockedWardrobeId}
          lockedLocation={shared.lockedLocation}
          lockedVariationSeed={shared.lockedVariationSeed}
          onClearLockedWardrobe={() => updateShared({ lockedWardrobeId: undefined })}
          onClearLockedLocation={() => updateShared({ lockedLocation: undefined })}
          onClearLockedVariationSeed={() => updateShared({ lockedVariationSeed: undefined })}
          recommendFromText={toolSettings.hints ?? ''}
        />
      }
    >
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.variations} />
      <ToolPrimarySection
        title="Variation setup"
        description="Pick a generator, set count and hints, then roll or queue a batch."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1">
            <FieldLabel>Generator</FieldLabel>
            <select
              value={target}
              onChange={event =>
                updateToolSettings({
                  target: event.target.value as VariationTarget,
                })
              }
              className="ui-input w-full px-3 py-2 text-sm"
            >
              <option value="generate">Generate (keywords)</option>
              <option value="character">Character</option>
              <option value="duo">Duo</option>
              <option value="pet">Pet</option>
              <option value="fantasy">Fantasy</option>
              <option value="background">Background</option>
            </select>
          </div>

          <div className="space-y-1">
            <FieldLabel>Grid mode</FieldLabel>
            <select
              value={gridMode}
              onChange={event =>
                updateToolSettings({
                  gridMode: event.target.value as 'roll' | 'matrix' | 'imported',
                })
              }
              className="ui-input w-full px-3 py-2 text-sm"
            >
              <option value="roll">Roll variations</option>
              {!isSimple ? (
                <>
                  <option value="matrix">Variation matrix</option>
                  <option value="imported">Imported batch (Topics)</option>
                </>
              ) : null}
            </select>
          </div>

          {gridMode === 'roll' ? (
            <div className="space-y-1">
              <FieldLabel>Count ({count})</FieldLabel>
              <input
                type="range"
                min={2}
                max={12}
                value={count}
                onChange={event => updateToolSettings({ count: Number(event.target.value) })}
                className={`w-full ${accentRingClass(ACCENT)}`}
              />
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <FieldLabel>Row axis</FieldLabel>
                <select
                  value={matrixAxisRow}
                  onChange={event =>
                    updateToolSettings({
                      matrixAxisRow: event.target.value as MatrixAxisKind,
                    })
                  }
                  className="ui-input w-full px-3 py-2 text-sm"
                >
                  <option value="variation">Variation strength</option>
                  <option value="sportPreset">Sport preset</option>
                  <option value="location">Location</option>
                </select>
              </div>

              <div className="space-y-1">
                <FieldLabel>Column axis</FieldLabel>
                <select
                  value={matrixAxisCol}
                  onChange={event =>
                    updateToolSettings({
                      matrixAxisCol: event.target.value as MatrixAxisKind,
                    })
                  }
                  className="ui-input w-full px-3 py-2 text-sm"
                >
                  <option value="variation">Variation strength</option>
                  <option value="sportPreset">Sport preset</option>
                  <option value="location">Location</option>
                </select>
              </div>

              <div className="space-y-1">
                <FieldLabel>Rows ({matrixRowCount})</FieldLabel>
                <input
                  type="range"
                  min={2}
                  max={6}
                  value={matrixRowCount}
                  onChange={event =>
                    updateToolSettings({ matrixRowCount: Number(event.target.value) })
                  }
                  className={`w-full ${accentRingClass(ACCENT)}`}
                />
              </div>

              <div className="space-y-1">
                <FieldLabel>Columns ({matrixColCount})</FieldLabel>
                <input
                  type="range"
                  min={2}
                  max={6}
                  value={matrixColCount}
                  onChange={event =>
                    updateToolSettings({ matrixColCount: Number(event.target.value) })
                  }
                  className={`w-full ${accentRingClass(ACCENT)}`}
                />
              </div>
            </>
          )}
        </div>

        {(target === 'character' ||
          target === 'duo' ||
          target === 'pet' ||
          target === 'fantasy') && (
          <div className="space-y-1">
            <FieldLabel>{SHOT_SCALE_LABEL}</FieldLabel>
            <select
              value={toolSettings.portraitStyle ?? 'action'}
              onChange={event =>
                updateToolSettings({
                  portraitStyle: event.target.value as 'portrait' | 'full-body' | 'action',
                })
              }
              className="ui-input w-full px-3 py-2 text-sm"
            >
              <option value="portrait">Portrait</option>
              <option value="full-body">Full body</option>
              <option value="action">Action</option>
            </select>
          </div>
        )}

        {target === 'duo' && (
          <SportPresetChips
            selectedId={toolSettings.sportPresetId ?? ''}
            mode="duo"
            onSelect={preset => updateToolSettings({ sportPresetId: preset.id })}
          />
        )}

        <div className="space-y-1">
          <FieldLabel>
            Variation strength ({rollVariationLabel(toolSettings.variationStrength ?? 65)})
          </FieldLabel>
          <input
            type="range"
            min={0}
            max={100}
            value={toolSettings.variationStrength ?? 65}
            onChange={event =>
              updateToolSettings({ variationStrength: Number(event.target.value) })
            }
            className={`w-full ${accentRingClass(ACCENT)}`}
          />
        </div>

        <HistoryHintSeedPanel
          tool={historyTool}
          hintSource={hintSource}
          historySeedScope={historySeedScope}
          hints={toolSettings.hints ?? ''}
          randomTheme={toolSettings.randomTheme ?? ''}
          lastHistorySeedEntryId={toolSettings.lastHistorySeedEntryId}
          onHintSourceChange={source => updateToolSettings({ hintSource: source })}
          onHistorySeedScopeChange={scope => updateToolSettings({ historySeedScope: scope })}
          onHintsChange={value => {
            updateToolSettings({ hints: value });
            rememberDraftFields({
              toolKey: 'variations',
              label: 'Variations',
              href: '/variations',
              fields: [value],
            });
          }}
          onRandomThemeChange={value => updateToolSettings({ randomTheme: value })}
          onHistorySeedApplied={result => {
            updateToolSettings({
              hints: result.hints,
              lastHistorySeedEntryId: result.entryId,
            });
          }}
          accentFocusClassName={accentFocusClass(ACCENT)}
        />

        <FieldLabel>Hints / base input</FieldLabel>
        <TextArea
          value={toolSettings.hints ?? ''}
          onChange={event => {
            const value = event.target.value;
            updateToolSettings({ hints: value });
            rememberDraftFields({
              toolKey: 'variations',
              label: 'Variations',
              href: '/variations',
              fields: [value],
            });
          }}
          rows={4}
          placeholder="neon alley, rain, black cat"
          className={accentFocusClass(ACCENT)}
          disabled={hintSource !== 'manual'}
        />

        <div className="flex flex-wrap gap-2">
          <PrimaryButton
            accentClassName={accentButtonClass(ACCENT)}
            loading={loading}
            loadingLabel={gridMode === 'matrix' ? 'Rolling matrix' : 'Rolling variations'}
            disabled={
              gridMode === 'imported' ||
              (hintSource === 'history' && historyCandidateCount === 0) ||
              (hintSource === 'manual' && !toolSettings.hints?.trim())
            }
            onClick={() => void (gridMode === 'matrix' ? rollMatrix() : rollGrid())}
            data-action="primary-generate"
          >
            {gridMode === 'matrix'
              ? `Roll matrix (${matrixRowCount}×${matrixColCount})`
              : `Roll ${count} variations`}
          </PrimaryButton>
          <Button
            variant="accent-outline"
            loading={queueLoading || lintLoading}
            loadingLabel={lintLoading ? 'Linting batch' : 'Queueing variations'}
            disabled={results.every(entry => !entry.prompt)}
            onClick={() => void queueGrid()}
          >
            Queue grid to ComfyUI
          </Button>
          <SidecarImportButton
            label="Import sidecar hints"
            className="cursor-pointer rounded-lg border border-[var(--border-default)] px-4 py-2 text-sm text-[var(--text-primary)] hover:border-[var(--border-default)]"
            onImport={(sidecar: PromptSidecar) => {
              updateToolSettings({
                hints: sidecar.hints?.trim() || sidecar.positive.slice(0, 400),
              });
              if (sidecar.variationSeed) {
                updateShared({ lockedVariationSeed: sidecar.variationSeed });
              }
              setImportStatus(`Loaded sidecar · ${sidecar.tool ?? 'unknown'} · ${sidecar.model}`);
            }}
            onError={setImportStatus}
          />
        </div>

        {importStatus && <p className="text-sm text-[var(--text-muted)]">{importStatus}</p>}
        {status && <p className="text-sm text-[var(--text-muted)]">{status}</p>}
        <BatchLintGatePanel
          summary={lintSummary}
          loading={lintLoading}
          onFixAll={() => {
            const prompts = results.map(entry => entry.prompt);
            void batchFixPrompts(prompts, toolSettings.hints).then(fixed => {
              setResults(previous =>
                previous.map((entry, index) => ({
                  ...entry,
                  prompt: fixed[index] ?? entry.prompt,
                }))
              );
              setLintSummary(null);
            });
          }}
          onContinue={() => {
            let prompts = results.map(entry => entry.prompt.trim()).filter(Boolean);
            if (lintSummary && lintSummary.blockedIndexes.length > 0) {
              prompts = filterBatchByLintIndexes(prompts, lintSummary.blockedIndexes);
            }
            prompts = applyReadinessFilterToPrompts(
              prompts,
              results.map(entry => ({
                prompt: entry.prompt,
                label: entry.rowLabel,
                hints: toolSettings.hints,
              })),
              shared.model,
              shared.detail,
              readyOnly
            );
            void executeQueue(prompts);
          }}
          onCancel={() => setLintSummary(null)}
        />
        <BatchReadinessPanel
          rows={results.map(entry => ({
            prompt: entry.prompt,
            label:
              entry.rowLabel && entry.colLabel
                ? `${entry.rowLabel} × ${entry.colLabel}`
                : entry.rowLabel,
            hints: toolSettings.hints,
          }))}
          model={shared.model}
          detail={shared.detail}
          onFilterReadyOnlyChange={setReadyOnly}
        />
        <BatchQueueProgress progress={rollProgress} />
        <BatchQueueProgress progress={queueProgress} />
        {comfyStatus && <p className="text-sm text-[var(--accent-text)]/90">{comfyStatus}</p>}
        <FieldError>{error}</FieldError>
      </ToolPrimarySection>

      {results.length > 0 && (
        <ToolPrimarySection title="Rolled prompts">
          {gridMode === 'matrix' ? (
            <div className="mb-3">
              <Button
                variant="secondary"
                onClick={() =>
                  downloadMatrixCsv(
                    results.map(entry => ({
                      rowLabel: entry.rowLabel,
                      colLabel: entry.colLabel,
                      prompt: entry.prompt,
                      seed: entry.seed,
                      error: entry.error,
                    }))
                  )
                }
              >
                Export matrix CSV
              </Button>
            </div>
          ) : null}
          {shouldVirtualizeVariationResults(results.length) ? (
            <VirtualizedVariationResults
              items={results}
              getKey={(entry, index) => `${index}-${entry.prompt.slice(0, 24)}`}
              renderItem={(entry, index) => (
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)]/50 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                    {entry.rowLabel && entry.colLabel
                      ? `${entry.rowLabel} × ${entry.colLabel}`
                      : `Variation ${index + 1}`}
                    {entry.seed ? ` · seed ${entry.seed.slice(0, 48)}` : ''}
                    {readinessByIndex.get(index)
                      ? ` · readiness ${readinessByIndex.get(index)!.score}/100`
                      : ''}
                  </p>
                  {entry.error ? (
                    <p className="mt-2 text-sm ui-status-danger">{entry.error}</p>
                  ) : (
                    <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                      {entry.prompt}
                    </p>
                  )}
                </div>
              )}
            />
          ) : (
            <ol className="space-y-3">
              {results.map((entry, index) => (
                <li
                  key={`${index}-${entry.prompt.slice(0, 24)}`}
                  className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)]/50 p-4"
                >
                  <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                    {entry.rowLabel && entry.colLabel
                      ? `${entry.rowLabel} × ${entry.colLabel}`
                      : `Variation ${index + 1}`}
                    {entry.seed ? ` · seed ${entry.seed.slice(0, 48)}` : ''}
                    {readinessByIndex.get(index)
                      ? ` · readiness ${readinessByIndex.get(index)!.score}/100`
                      : ''}
                  </p>
                  {entry.error ? (
                    <p className="mt-2 text-sm ui-status-danger">{entry.error}</p>
                  ) : (
                    <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                      {entry.prompt}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </ToolPrimarySection>
      )}
      <MobileStickyQueueBar
        disabled={results.every(entry => !entry.prompt) || queueLoading || lintLoading}
        label="Queue grid"
        status={queueProgress?.message ?? status}
        primaryGenerate
        onQueue={() => void queueGrid()}
      />
    </ToolLayout>
  );
}
