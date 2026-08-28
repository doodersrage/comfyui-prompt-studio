'use client';

import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';

import { useCallback, useMemo, useState } from 'react';
import EnhancedPromptResult from '@/components/LazyEnhancedPromptResult';
import EditToolRecipeStrip from '@/components/EditToolRecipeStrip';
import { HistoryHintSeedPanel } from '@/components/scene-tool/HistoryHintSeedPanel';
import MobileStickyQueueBar from '@/components/MobileStickyQueueBar';
import SharedToolControls from '@/components/SharedToolControls';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import MediaScaffoldReadyPanel from '@/components/MediaScaffoldReadyPanel';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { useSeedToolDraft } from '@/hooks/useSeedToolDraft';
import { useGalleryHandoff } from '@/hooks/useGalleryHandoff';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import { getComfyModelDefinition } from '@/lib/comfy-models/client';
import type { WorkflowParamValues } from '@/lib/comfyui-config';
import { getReformatTargetLabel, getReformatTargetModel } from '@/lib/reformat-target';
import { continueEditResultProps } from '@/lib/continue-edit-result-props';
import { promptResultPreviewProps } from '@/lib/prompt-result-preview-props';
import {
  galleryPickPath,
  sharedPatchFromGalleryHandoff,
  type GalleryHandoffPayload,
} from '@/lib/gallery-handoff';
import { DEFAULT_CONTROLNET_TOOL_CACHE, type ControlNetSlotPreset } from '@/lib/settings-cache';
import { sharedLlmRequestBody } from '@/lib/llm-request-options';
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import { normalizeControlNetMode, type ControlNetMode } from '@/lib/controlnet-prompt';
import { normalizeHistorySeedScope, normalizeSceneHintSource } from '@/lib/scene-hint-source';

function normalizeSlotStrengths(raw: unknown): number[] {
  const fallback = [1, 1, 1, 1];
  if (!Array.isArray(raw)) {
    return fallback;
  }
  return fallback.map((_, index) => {
    const value = Number(raw[index]);
    if (!Number.isFinite(value)) {
      return 1;
    }
    return Math.min(2, Math.max(0, value));
  });
}

function normalizeSlotModes(raw: unknown, primary: ControlNetMode): ControlNetMode[] {
  const fallback: ControlNetMode[] = [primary, primary, primary, primary];
  if (!Array.isArray(raw)) {
    return fallback;
  }
  return fallback.map((_, index) =>
    normalizeControlNetMode(raw[index] ?? (index === 0 ? primary : 'depth'))
  );
}
import {
  ToolBadge,
  CollapsibleSection,
  ToolLayout,
  ToolSection,
  accentButtonClass,
  accentFocusClass,
} from '@/components/ui/ToolPageShell';
import TurboEditStrengthControls from '@/components/TurboEditStrengthControls';
import { FieldLabel } from '@/components/ui/Field';
import { normalizeTurboEditStrength } from '@/lib/turbo-edit-strength';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import { Button, ButtonLink, PrimaryButton } from '@/components/ui/Button';
import VisionScanButton from '@/components/VisionScanButton';
import { fileToDataUrl } from '@/lib/browser-file-data-url';
import { resolveLocalImageFile, scanStillWithVision } from '@/lib/vision-still-scan-client';

const ACCENT = 'cyan' as const;

const MODES: { id: ControlNetMode; label: string }[] = [
  { id: 'depth', label: 'Depth' },
  { id: 'pose', label: 'Pose' },
  { id: 'canny', label: 'Canny / edges' },
  { id: 'normal', label: 'Normal map' },
  { id: 'lineart', label: 'Lineart' },
];

import type { useControlNetToolOrchestration } from '@/hooks/useControlNetToolOrchestration';

type ViewModel = ReturnType<typeof useControlNetToolOrchestration>;
type Props = ViewModel & { description: string };

export default function ControlNetToolSections({ description, ...vm }: Props) {
  const {
    mounted,
    shared,
    toolSettings,
    updateShared,
    updateToolSettings,
    actions,
    mode,
    subject,
    scene,
    detailNotes,
    slotStrengths,
    slotModes,
    presets,
    presetNameDraft,
    setPresetNameDraft,
    setSlotStrengths,
    setSlotModes,
    setMode,
    saveSlotPreset,
    loadSlotPreset,
    deleteSlotPreset,
    setSubject,
    setScene,
    setDetailNotes,
    refFile,
    refPreview,
    scanning,
    extraRefFiles,
    extraRefPreviews,
    output,
    setOutput,
    rawPrompt,
    source,
    loading,
    error,
    setError,
    copied,
    handoffQueueParams,
    handoffParentGalleryEntryId,
    handoffSourceImageUrl,
    handoffControlImageUrls,
    selectedModel,
    hintText,
    activeSlotFlags,
    activeSlotCount,
    controlNetStrengths,
    controlNetModes,
    queueControlNetOptions,
    onRefChange,
    scanWithVision,
    onExtraRefChange,
    generate,
    copyOutput,
  } = vm;
  return (
    <ToolLayout
      accent={ACCENT}
      badge={<ToolBadge accent={ACCENT}>ControlNet</ToolBadge>}
      title="ControlNet"
      description={description}
      sidebar={
        <SharedToolControls
          toolId="controlnet"
          shared={shared}
          onModelChange={model => updateShared({ model })}
          onDetailChange={detailLevel => updateShared({ detail: detailLevel })}
          onWorkflowPresetChange={id => updateShared({ selectedWorkflowFileId: id })}
          autoFixRules={shared.autoFixRules !== false}
          onAutoFixRulesChange={value => updateShared({ autoFixRules: value })}
          recommendFromText={output || subject || scene}
        />
      }
    >
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.controlnet} />
      <EditToolRecipeStrip
        toolId="controlnet"
        shared={shared}
        onApplied={next => updateShared(next)}
      />
      <TurboEditStrengthControls
        model={shared.model}
        tool="controlnet"
        value={normalizeTurboEditStrength(shared.turboEditStrength)}
        onChange={turboEditStrength => updateShared({ turboEditStrength })}
      />
      <HistoryHintSeedPanel
        tool="controlnet"
        hintSource={normalizeSceneHintSource(toolSettings.hintSource)}
        historySeedScope={normalizeHistorySeedScope(toolSettings.historySeedScope)}
        hints={subject}
        randomTheme={toolSettings.randomTheme ?? ''}
        lastHistorySeedEntryId={toolSettings.lastHistorySeedEntryId}
        onHintSourceChange={source => updateToolSettings({ hintSource: source })}
        onHistorySeedScopeChange={scope => updateToolSettings({ historySeedScope: scope })}
        onHintsChange={setSubject}
        onRandomThemeChange={theme => updateToolSettings({ randomTheme: theme })}
        onHistorySeedApplied={result => {
          setSubject(result.hints);
          updateToolSettings({
            lastHistorySeedEntryId: result.entryId,
            hintSource: 'history',
          });
        }}
        accentFocusClassName={accentFocusClass(ACCENT)}
      />
      <div className="mb-4">
        <MediaScaffoldReadyPanel
          kind="controlnet"
          onImported={(_summary, result) => {
            if (result.sharedPatch) {
              updateShared(result.sharedPatch);
            }
            setError(null);
          }}
        />
      </div>
      <ToolSection title="Conditioning mode">
        <div className="flex flex-wrap gap-2">
          {MODES.map(entry => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setMode(entry.id)}
              className={`ui-chip ${mode === entry.id ? 'ui-chip-active' : ''} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]`}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <div className="mt-4 space-y-2">
          <FieldLabel htmlFor="controlnet-strength-0" hint="Primary ControlNetApply strength">
            Strength · slot 1 ({slotStrengths[0]!.toFixed(2)})
          </FieldLabel>
          <input
            id="controlnet-strength-0"
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={slotStrengths[0]}
            onChange={event =>
              setSlotStrengths(previous => {
                const next = [...previous];
                next[0] = Number(event.target.value);
                return next;
              })
            }
            className={`w-full accent-[var(--accent)] ${accentFocusClass()}`}
          />
        </div>
        <div className="mt-5 space-y-3 rounded-xl border border-[var(--border-subtle)]/80 bg-[color-mix(in_oklab,var(--surface)_86%,transparent)] p-3">
          <FieldLabel
            htmlFor="controlnet-preset-name"
            hint="Saves modes/strengths/text — not images"
          >
            Slot presets
          </FieldLabel>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="controlnet-preset-name"
              value={presetNameDraft}
              onChange={event => setPresetNameDraft(event.target.value)}
              placeholder="e.g. Soft depth stack"
              className={`ui-input min-w-[10rem] flex-1 px-3 py-2 text-sm ${accentFocusClass(ACCENT)}`}
            />
            <Button type="button" variant="secondary" size="sm" onClick={saveSlotPreset}>
              Save preset
            </Button>
          </div>
          {presets.length > 0 ? (
            <ul className="space-y-1.5">
              {presets.map(preset => (
                <li
                  key={preset.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border-subtle)]/70 px-2.5 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-secondary)]">
                    {preset.name}
                    <span className="ml-2 text-xs text-[var(--text-muted)]">
                      {normalizeControlNetMode(preset.mode ?? 'depth')}
                    </span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => loadSlotPreset(preset)}
                  >
                    Load
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteSlotPreset(preset.id)}
                  >
                    Delete
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-[var(--text-muted)]">
              Save the current slot modes and strengths for quick recall.
            </p>
          )}
        </div>
      </ToolSection>

      <ToolSection title="Reference image (optional)">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            accept="image/*"
            onChange={event => onRefChange(event.target.files?.[0] ?? null)}
            className="ui-file-input min-w-0 flex-1"
          />
          <ButtonLink href={galleryPickPath('controlnet')} variant="secondary" size="sm">
            Choose from Gallery
          </ButtonLink>
          <VisionScanButton
            disabled={!refFile && !refPreview && !handoffSourceImageUrl}
            scanning={scanning}
            onClick={() => void scanWithVision()}
          />
        </div>
        <p className="mt-2 type-caption text-[var(--text-muted)]">
          Scan with vision fills Subject structure from the still.
        </p>
        {refPreview ? (
          <div className="mt-3 flex flex-wrap items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={refPreview}
              alt="ControlNet reference"
              className="max-h-48 rounded-lg border border-[var(--border-subtle)] object-contain"
            />
            <Button variant="ghost" onClick={() => onRefChange(null)}>
              Remove image
            </Button>
          </div>
        ) : (
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            When uploaded, vision extracts structure and merges it with the selected ControlNet
            mode.
          </p>
        )}
        <CollapsibleSection
          title="Extra control images"
          summary="Optional stack for additional ControlNetApply chains."
          defaultOpen={false}
          persistKey="controlnet-extra-images"
        >
          <p className="type-caption text-[var(--text-muted)]">
            Second–fourth images append additional ControlNetApply chains at queue time.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {[0, 1, 2].map(index => {
              const slotIndex = index + 1;
              const hasImage = Boolean(extraRefFiles[index] || handoffControlImageUrls[slotIndex]);
              return (
                <div
                  key={index}
                  className="space-y-2 rounded-lg border border-[var(--border-subtle)]/70 p-2.5"
                >
                  <FieldLabel>Control {slotIndex + 1}</FieldLabel>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={event => onExtraRefChange(index, event.target.files?.[0] ?? null)}
                    className="ui-file-input w-full text-xs"
                  />
                  {extraRefPreviews[index] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={extraRefPreviews[index]!}
                      alt={`Control ${slotIndex + 1}`}
                      className="max-h-28 rounded-lg border border-[var(--border-subtle)] object-contain"
                    />
                  ) : null}
                  {hasImage ? (
                    <>
                      <select
                        value={slotModes[slotIndex]}
                        onChange={event =>
                          setSlotModes(previous => {
                            const next = [...previous];
                            next[slotIndex] = normalizeControlNetMode(event.target.value);
                            return next;
                          })
                        }
                        className={`ui-input w-full px-2 py-1.5 text-xs ${accentFocusClass(ACCENT)}`}
                      >
                        {MODES.map(entry => (
                          <option key={entry.id} value={entry.id}>
                            {entry.label}
                          </option>
                        ))}
                      </select>
                      <FieldLabel htmlFor={`controlnet-strength-${slotIndex}`}>
                        Strength ({slotStrengths[slotIndex]!.toFixed(2)})
                      </FieldLabel>
                      <input
                        id={`controlnet-strength-${slotIndex}`}
                        type="range"
                        min={0}
                        max={2}
                        step={0.05}
                        value={slotStrengths[slotIndex]}
                        onChange={event =>
                          setSlotStrengths(previous => {
                            const next = [...previous];
                            next[slotIndex] = Number(event.target.value);
                            return next;
                          })
                        }
                        className={`w-full accent-[var(--accent)] ${accentFocusClass()}`}
                      />
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
        </CollapsibleSection>
      </ToolSection>

      <ToolSection title="Structure description">
        <div className="space-y-4">
          <div>
            <FieldLabel htmlFor="controlnet-subject">Subject structure</FieldLabel>
            <textarea
              id="controlnet-subject"
              value={subject}
              onChange={event => setSubject(event.target.value)}
              rows={4}
              className={`ui-input w-full px-(--input-padding-x) py-(--input-padding-y) type-body ${accentFocusClass(ACCENT)}`}
              placeholder="e.g. woman standing, weight on left leg, arms crossed — or leave blank when using image"
            />
          </div>
          <div>
            <FieldLabel htmlFor="controlnet-scene">Scene context (optional)</FieldLabel>
            <input
              id="controlnet-scene"
              value={scene}
              onChange={event => setScene(event.target.value)}
              className="ui-input w-full px-(--input-padding-x) py-(--input-padding-y) type-body"
              placeholder="e.g. narrow alley, low camera angle"
            />
          </div>
          <div>
            <FieldLabel htmlFor="controlnet-detail">Extra constraints (optional)</FieldLabel>
            <input
              id="controlnet-detail"
              value={detailNotes}
              onChange={event => setDetailNotes(event.target.value)}
              className="ui-input w-full px-(--input-padding-x) py-(--input-padding-y) type-body"
            />
          </div>
          <PrimaryButton
            accentClassName={accentButtonClass(ACCENT)}
            data-action="primary-generate"
            loading={loading}
            disabled={!mounted || (!subject.trim() && !refFile)}
            onClick={() => void generate()}
            loadingLabel="Building ControlNet prompt"
          >
            Build ControlNet prompt
          </PrimaryButton>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
        </div>
      </ToolSection>

      {output ? (
        <>
          {source === 'vision' ? (
            <p className="text-xs text-[var(--accent-text)]">
              Generated from reference image + {mode} mode
            </p>
          ) : null}
          <EnhancedPromptResult
            output={output}
            provider={source === 'vision' ? 'llm' : 'rules'}
            comfyNode={selectedModel.comfyNode}
            readinessModel={shared.model}
            readinessDetail={shared.detail}
            readinessHints={hintText}
            copied={copied}
            onCopy={() => void copyOutput()}
            onOutputChange={setOutput}
            rawPrompt={rawPrompt}
            onSaveHistory={() => actions.saveHistory({ prompt: output, hints: hintText })}
            onSendComfyUi={() =>
              void actions.sendComfyUi(output, null, undefined, queueControlNetOptions)
            }
            onFixPrompt={() => void actions.fixPrompt(output, setOutput, hintText)}
            onCopyPair={() => void actions.copyPromptPair(output, null)}
            onCompact={() => void actions.compactPrompt(output, setOutput)}
            onReformat={() => void actions.reformatForModel(output, setOutput)}
            reformatTargetLabel={getReformatTargetLabel(shared.model)}
            onExportSidecar={() => actions.exportSidecar(output, { metadata: { hints: hintText } })}
            {...promptResultPreviewProps(actions, output, null)}
            {...continueEditResultProps(actions, output, {
              queueImageOptions: queueControlNetOptions,
            })}
            comfyUiStatus={actions.comfyUiStatus}
            comfyUiJob={actions.comfyUiJob}
            comfyUiPreviewUrl={actions.comfyUiPreviewUrl}
            historySaved={actions.historySaved}
            pairCopied={actions.pairCopied}
          />
        </>
      ) : null}
      {output ? (
        <MobileStickyQueueBar
          disabled={!output.trim()}
          label="Queue ControlNet"
          status={actions.comfyUiStatus}
          primaryGenerate
          onQueue={() => void actions.sendComfyUi(output, null, undefined, queueControlNetOptions)}
        />
      ) : null}
    </ToolLayout>
  );
}
