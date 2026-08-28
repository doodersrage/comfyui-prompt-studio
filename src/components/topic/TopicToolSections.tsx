'use client';

import Link from 'next/link';
import BatchLintGatePanel from '@/components/BatchLintGatePanel';
import BatchReadinessPanel, {
  applyReadinessFilterToPrompts,
} from '@/components/BatchReadinessPanel';
import BatchQueueProgress from '@/components/BatchQueueProgress';
import MobileStickyQueueBar from '@/components/MobileStickyQueueBar';
import SharedToolControls from '@/components/SharedToolControls';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';
import {
  ToolBadge,
  CollapsibleSection,
  ToolBlockGroup,
  ToolContentPanel,
  ToolLayout,
  ToolMetaPanel,
  ToolSection,
  accentButtonClass,
  accentFocusClass,
  accentRingClass,
} from '@/components/ui/ToolPageShell';
import { FieldDivider, FieldError, FieldLabel, TextArea } from '@/components/ui/Field';
import { Button, PrimaryButton } from '@/components/ui/Button';
import { HistoryHintSeedPanel } from '@/components/scene-tool/HistoryHintSeedPanel';
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import { batchFixPrompts, filterBatchByLintIndexes, runBatchLintGate } from '@/lib/batch-lint-gate';
import { topicVarietyLabel } from '@/lib/tool-ui-labels';
const ACCENT = 'brand' as const;

import type { useTopicToolOrchestration } from '@/hooks/useTopicToolOrchestration';

type ViewModel = ReturnType<typeof useTopicToolOrchestration>;
type Props = ViewModel & { description: string };

export default function TopicToolSections({ description, ...vm }: Props) {
  const {
    mounted,
    shared,
    toolSettings,
    updateShared,
    updateToolSettings,
    topics,
    setTopics,
    batchResults,
    setBatchResults,
    provider,
    loading,
    batchLoading,
    error,
    setError,
    batchStatus,
    comfyBatchStatus,
    lintSummary,
    setLintSummary,
    lintLoading,
    pendingQueuePrompts,
    setPendingQueuePrompts,
    copiedIndex,
    setCopiedIndex,
    readyOnly,
    setReadyOnly,
    queueProgress,
    setQueueProgress,
    batchTarget,
    hintSource,
    historySeedScope,
    historyCandidateCount,
    effectiveSeedTopic,
    batchReadiness,
    readinessByIndex,
    generate,
    batchGenerate,
    executeComfyQueue,
    queueBatchComfyUi,
    sendToVariations,
    copyTopics,
  } = vm;
  return (
    <ToolLayout
      accent={ACCENT}
      badge={<ToolBadge accent={ACCENT}>{TOOL_SETUP_LABELS.topics}</ToolBadge>}
      title="Topics"
      description={description}
      sidebar={
        <SharedToolControls
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
          recommendFromText={effectiveSeedTopic}
        />
      }
    >
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.topics} />
      <ToolSection>
        <HistoryHintSeedPanel
          tool="generate"
          hintSource={hintSource}
          historySeedScope={historySeedScope}
          hints={toolSettings.seedTopic ?? ''}
          randomTheme={toolSettings.randomTheme ?? ''}
          lastHistorySeedEntryId={toolSettings.lastHistorySeedEntryId}
          onHintSourceChange={source => updateToolSettings({ hintSource: source })}
          onHistorySeedScopeChange={scope => updateToolSettings({ historySeedScope: scope })}
          onHintsChange={value => {
            updateToolSettings({ seedTopic: value });
            rememberDraftFields({
              toolKey: 'topics',
              label: 'Topics',
              href: '/topics',
              fields: [value],
            });
          }}
          onRandomThemeChange={value => updateToolSettings({ randomTheme: value })}
          onHistorySeedApplied={result => {
            updateToolSettings({
              seedTopic: result.hints,
              lastHistorySeedEntryId: result.entryId,
            });
            rememberDraftFields({
              toolKey: 'topics',
              label: 'Topics',
              href: '/topics',
              fields: [result.hints],
            });
          }}
          accentFocusClassName={accentFocusClass(ACCENT)}
        />

        <FieldDivider />

        <FieldLabel>Starting theme</FieldLabel>
        <TextArea
          value={toolSettings.seedTopic ?? ''}
          onChange={e => {
            const value = e.target.value;
            updateToolSettings({ seedTopic: value });
            rememberDraftFields({
              toolKey: 'topics',
              label: 'Topics',
              href: '/topics',
              fields: [value],
            });
          }}
          placeholder="e.g. solarpunk, lonely robots, underwater cities — or leave blank"
          rows={2}
          className={accentFocusClass(ACCENT)}
          disabled={hintSource !== 'manual'}
        />

        <FieldDivider />

        <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
          <span>Fewer topics</span>
          <span className="font-medium text-[var(--accent-text)]">
            {toolSettings.count ?? 10} topics
          </span>
          <span>More</span>
        </div>
        <input
          type="range"
          min={3}
          max={24}
          step={1}
          value={toolSettings.count ?? 10}
          onChange={e => updateToolSettings({ count: Number(e.target.value) })}
          className={`h-2 w-full ${accentRingClass(ACCENT)}`}
        />

        <FieldDivider />

        <FieldLabel>Topic variety</FieldLabel>
        <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
          <span>Focused</span>
          <span className="font-medium text-[var(--accent-text)]">
            {topicVarietyLabel(toolSettings.variety ?? 50)} ({toolSettings.variety ?? 50})
          </span>
          <span>Exploratory</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={toolSettings.variety ?? 50}
          onChange={e => updateToolSettings({ variety: Number(e.target.value) })}
          className={`h-2 w-full ${accentRingClass(ACCENT)}`}
        />

        <PrimaryButton
          accentClassName={accentButtonClass(ACCENT)}
          onClick={() => void generate()}
          loading={loading}
          loadingLabel="Generating topics"
          disabled={hintSource === 'history' && historyCandidateCount === 0}
          data-action="primary-generate"
        >
          Generate topics
        </PrimaryButton>

        <FieldError>{error}</FieldError>
      </ToolSection>

      {topics.length > 0 && (
        <ToolSection title="Topics">
          <ToolMetaPanel>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              {provider ? (
                <p className="type-caption">
                  {topics.length} ideas via {provider === 'llm' ? 'LLM' : 'template'}
                </p>
              ) : (
                <span />
              )}
              <div className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap lg:w-auto lg:justify-end">
                <select
                  value={batchTarget}
                  onChange={event =>
                    updateToolSettings({
                      batchTarget: event.target.value as
                        'generate' | 'duo' | 'character' | 'pet' | 'fantasy' | 'background',
                    })
                  }
                  className="ui-input min-h-11 w-full px-3 py-(--input-padding-y) type-body sm:min-w-240 sm:flex-1 lg:w-auto lg:flex-none"
                >
                  <option value="generate">Batch → Generate prompts</option>
                  <option value="duo">Batch → Character (duo) prompts</option>
                  <option value="character">Batch → Character prompts</option>
                  <option value="pet">Batch → Pet prompts</option>
                  <option value="fantasy">Batch → Fantasy prompts</option>
                  <option value="background">Batch → Background prompts</option>
                </select>
                <Button
                  variant="secondary"
                  className="w-full sm:w-auto"
                  loading={batchLoading}
                  loadingLabel="Building batch prompts"
                  onClick={() => void batchGenerate()}
                >
                  Batch build prompts
                </Button>
                <Button
                  variant="secondary"
                  className="w-full sm:w-auto"
                  onClick={() => void copyTopics(topics.join('\n'), 'all')}
                >
                  {copiedIndex === 'all' ? 'Copied!' : 'Copy all topics'}
                </Button>
              </div>
            </div>

            {batchStatus && (
              <p className="type-caption text-[var(--tint-success-text)]">{batchStatus}</p>
            )}
            {comfyBatchStatus && (
              <p className="type-caption text-[var(--accent-text)]">{comfyBatchStatus}</p>
            )}
          </ToolMetaPanel>

          <ToolBlockGroup className="mt-[var(--block-gap)]">
            {topics.map((topic, index) => (
              <TopicCard
                key={`${index}-${topic}`}
                index={index}
                topic={topic}
                copied={copiedIndex === index}
                batchPrompt={batchResults[index]?.prompt}
                readiness={readinessByIndex.get(index)}
                onCopy={() => void copyTopics(topic, index)}
              />
            ))}
          </ToolBlockGroup>

          {batchResults.length > 0 && (
            <CollapsibleSection
              title="Batch queue options"
              summary="Lint gate, readiness filter, and queue controls."
              defaultOpen={false}
              persistKey="topics-batch-queue"
              className="mt-[var(--group-gap)]"
            >
              <div className="space-y-3">
                <BatchLintGatePanel
                  summary={lintSummary}
                  loading={lintLoading}
                  onFixAll={() => {
                    void batchFixPrompts(pendingQueuePrompts, toolSettings.seedTopic).then(
                      fixed => {
                        setPendingQueuePrompts(fixed);
                        setBatchResults(previous =>
                          previous.map((entry, index) => ({
                            ...entry,
                            prompt: fixed[index] ?? entry.prompt,
                          }))
                        );
                        setLintSummary(null);
                        void runBatchLintGate(
                          fixed.map((prompt, index) => ({
                            prompt,
                            topic: batchResults[index]?.topic,
                          })),
                          toolSettings.seedTopic
                        ).then(setLintSummary);
                      }
                    );
                  }}
                  onContinue={() => {
                    let prompts =
                      lintSummary && lintSummary.blockedIndexes.length > 0
                        ? filterBatchByLintIndexes(pendingQueuePrompts, lintSummary.blockedIndexes)
                        : pendingQueuePrompts;
                    prompts = applyReadinessFilterToPrompts(
                      prompts,
                      batchResults.map(entry => ({
                        prompt: entry.prompt,
                        label: entry.topic,
                        hints: toolSettings.seedTopic,
                      })),
                      shared.model,
                      shared.detail,
                      readyOnly
                    );
                    void executeComfyQueue(prompts);
                  }}
                  onCancel={() => {
                    setLintSummary(null);
                    setPendingQueuePrompts([]);
                  }}
                />
                <BatchReadinessPanel
                  rows={batchResults.map(entry => ({
                    prompt: entry.prompt,
                    label: entry.topic,
                    hints: toolSettings.seedTopic,
                  }))}
                  model={shared.model}
                  detail={shared.detail}
                  onFilterReadyOnlyChange={setReadyOnly}
                />
                <BatchQueueProgress progress={queueProgress} />
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <Button
                    variant="secondary"
                    className="w-full sm:w-auto"
                    onClick={() =>
                      void copyTopics(
                        batchResults.map(entry => entry.prompt).join('\n\n---\n\n'),
                        'batch'
                      )
                    }
                  >
                    {copiedIndex === 'batch' ? 'Copied prompts!' : 'Copy all prompts'}
                  </Button>
                  <Button
                    variant="secondary"
                    className="w-full sm:w-auto"
                    onClick={sendToVariations}
                  >
                    Send to Variations
                  </Button>
                  <Button
                    variant="accent-outline"
                    className="w-full sm:w-auto"
                    onClick={() => void queueBatchComfyUi()}
                    disabled={lintLoading}
                  >
                    {lintLoading ? 'Linting batch…' : 'Queue batch to ComfyUI'}
                  </Button>
                  {comfyBatchStatus ? (
                    <p className="w-full text-xs text-[var(--accent-text)]/90">
                      {comfyBatchStatus}
                    </p>
                  ) : null}
                </div>
              </div>
            </CollapsibleSection>
          )}
        </ToolSection>
      )}
      {batchResults.length > 0 ? (
        <MobileStickyQueueBar
          disabled={lintLoading}
          label="Queue batch"
          status={comfyBatchStatus ?? (lintLoading ? 'Linting batch…' : null)}
          primaryGenerate
          onQueue={() => void queueBatchComfyUi()}
        />
      ) : null}
    </ToolLayout>
  );
}

function TopicCard({
  index,
  topic,
  copied,
  batchPrompt,
  readiness,
  onCopy,
}: {
  index: number;
  topic: string;
  copied: boolean;
  batchPrompt?: string;
  readiness?: { score: number; grade: string; queueAllowed: boolean };
  onCopy: () => void;
}) {
  return (
    <ToolContentPanel className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="type-overline text-[var(--text-muted)]">
          Topic {String(index + 1).padStart(2, '0')}
        </p>
        <Button variant="ghost" className="!min-h-9 px-3 type-caption" onClick={onCopy}>
          {copied ? 'Copied!' : 'Copy topic'}
        </Button>
      </div>

      <p className="type-body-lg leading-relaxed text-[var(--text-primary)]">{topic}</p>

      <div className="flex flex-wrap gap-2 border-t border-[var(--border-subtle)] pt-4">
        <Link
          href={`/?input=${encodeURIComponent(topic)}`}
          className="ui-btn-ghost !min-h-9 px-4 type-caption"
        >
          Generate
        </Link>
        <Link
          href={`/character?mode=duo&hints=${encodeURIComponent(topic)}`}
          className="ui-btn-ghost !min-h-9 px-4 type-caption"
        >
          Character (duo)
        </Link>
        <Link
          href={`/character?hints=${encodeURIComponent(topic)}`}
          className="ui-btn-ghost !min-h-9 px-4 type-caption"
        >
          Character
        </Link>
      </div>

      {batchPrompt ? (
        <>
          {readiness ? (
            <p className="type-caption text-[var(--text-muted)]">
              Readiness {readiness.score}/100 ({readiness.grade})
              {!readiness.queueAllowed ? ' · below queue threshold' : ''}
            </p>
          ) : null}
          <pre className="type-code max-h-48 overflow-auto whitespace-pre-wrap rounded-[var(--radius-md)] border border-[var(--tint-success-border)] bg-[var(--tint-success-bg)] p-4 !text-[var(--tint-success-text)]">
            {batchPrompt}
          </pre>
        </>
      ) : null}
    </ToolContentPanel>
  );
}
