'use client';

import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';

import { promptResultPreviewProps } from '@/lib/prompt-result-preview-props';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import EnhancedPromptResult from '@/components/LazyEnhancedPromptResult';
import EditToolRecipeStrip from '@/components/EditToolRecipeStrip';
import MobileStickyQueueBar from '@/components/MobileStickyQueueBar';
import InpaintMaskEditor from '@/components/InpaintMaskEditor';
import RegionalEditPanel, { regionalSlotsQueueExtras } from '@/components/RegionalEditPanel';
import SharedToolControls from '@/components/SharedToolControls';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import { HistoryHintSeedPanel } from '@/components/scene-tool/HistoryHintSeedPanel';
import { continueEditResultProps } from '@/lib/continue-edit-result-props';
import { normalizeHistorySeedScope, normalizeSceneHintSource } from '@/lib/scene-hint-source';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { useSeedToolDraft } from '@/hooks/useSeedToolDraft';
import { useGalleryHandoff } from '@/hooks/useGalleryHandoff';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import {
  ANATOMY_REPAIR_CHANGE_DESCRIPTION,
  ANATOMY_REPAIR_MASK_DESCRIPTION,
  isAnatomyRepairHandoff,
} from '@/lib/anatomy-repair-handoff';
import type { ComfyImageModel } from '@/lib/comfy-models/client';
import type { WorkflowParamValues } from '@/lib/comfyui-config';
import { getComfyModelDefinition } from '@/lib/comfy-models/client';
import { getReformatTargetLabel, getReformatTargetModel } from '@/lib/reformat-target';
import { buildInpaintInstruction } from '@/lib/regional-prompt-builder';
import { isInpaintModel } from '@/lib/model-denoise-defaults';
import { DEFAULT_INPAINT_TOOL_CACHE } from '@/lib/settings-cache';
import { createDefaultRegionalSlots } from '@/lib/regional-prompt-slots';
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import { galleryPickPath, sharedPatchFromGalleryHandoff } from '@/lib/gallery-handoff';
import {
  ToolBadge,
  ToolLayout,
  ToolSection,
  accentButtonClass,
  accentFocusClass,
} from '@/components/ui/ToolPageShell';
import TurboEditStrengthControls from '@/components/TurboEditStrengthControls';
import { FieldError, FieldLabel, TextArea } from '@/components/ui/Field';
import { normalizeTurboEditStrength } from '@/lib/turbo-edit-strength';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import { ButtonLink, PrimaryButton } from '@/components/ui/Button';

const ACCENT = 'amber' as const;
const DEFAULT_INPAINT_MODEL: ComfyImageModel = 'flux-inpaint';

export default function InpaintTool() {
  const description = useToolPageDescription(
    'Paint a mask and describe what belongs inside it. Queue regenerates only the masked region.',
    'Paint a mask, describe the change, and queue inpaint for the masked region.'
  );
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } = useCachedSettings(
    'inpaint',
    DEFAULT_INPAINT_TOOL_CACHE
  );
  const modelInitializedRef = useRef(false);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [maskFile, setMaskFile] = useState<File | null>(null);
  const [maskPreviewUrl, setMaskPreviewUrl] = useState<string | null>(null);
  const [handoffQueueParams, setHandoffQueueParams] = useState<WorkflowParamValues | undefined>();
  const [anatomyRepairMode, setAnatomyRepairMode] = useState(false);
  const maskDescription = toolSettings.maskDescription ?? '';
  const changeDescription = toolSettings.changeDescription ?? '';
  const directPrompt = toolSettings.directPrompt ?? '';
  const setMaskDescription = useCallback(
    (value: string) => {
      updateToolSettings({ maskDescription: value });
      rememberDraftFields({
        toolKey: 'inpaint',
        label: 'Inpaint',
        href: '/inpaint',
        fields: [value, changeDescription, directPrompt],
      });
    },
    [changeDescription, directPrompt, updateToolSettings]
  );
  const setChangeDescription = useCallback(
    (value: string) => {
      updateToolSettings({ changeDescription: value });
      rememberDraftFields({
        toolKey: 'inpaint',
        label: 'Inpaint',
        href: '/inpaint',
        fields: [maskDescription, value, directPrompt],
      });
    },
    [directPrompt, maskDescription, updateToolSettings]
  );
  const setDirectPrompt = useCallback(
    (value: string) => {
      updateToolSettings({ directPrompt: value });
      rememberDraftFields({
        toolKey: 'inpaint',
        label: 'Inpaint',
        href: '/inpaint',
        fields: [maskDescription, changeDescription, value],
      });
    },
    [changeDescription, maskDescription, updateToolSettings]
  );
  useSeedToolDraft(mounted, {
    toolKey: 'inpaint',
    label: 'Inpaint',
    href: '/inpaint',
    fields: [maskDescription, changeDescription, directPrompt],
  });
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const actions = usePromptResultActions({
    tool: 'inpaint',
    model: shared.model,
    detail: shared.detail,
    hints: maskDescription || changeDescription,
    autoFixRules: shared.autoFixRules !== false,
    reformatTarget: getReformatTargetModel(shared.model),
  });

  const selectedModel = getComfyModelDefinition(shared.model);
  const needsInpaintMask = isInpaintModel(shared.model);

  const output = useMemo(() => {
    if (directPrompt.trim()) {
      return directPrompt.trim();
    }
    if (maskDescription.trim() && changeDescription.trim()) {
      return buildInpaintInstruction(maskDescription, changeDescription);
    }
    return changeDescription.trim();
  }, [changeDescription, directPrompt, maskDescription]);

  const regionalSlots = toolSettings.regionalSlots ?? createDefaultRegionalSlots();
  const regionalQueue = useMemo(() => regionalSlotsQueueExtras(regionalSlots), [regionalSlots]);

  const queueImageOptions = {
    inputImage: file,
    inputImageUrl: !file ? (previewUrl ?? undefined) : undefined,
    maskImage: needsInpaintMask ? maskFile : undefined,
    maskImageUrl: needsInpaintMask && !maskFile ? (maskPreviewUrl ?? undefined) : undefined,
    queueParamsBase: handoffQueueParams,
    customTokens: regionalQueue.customTokens,
    regionalSlots: regionalQueue.regionalSlots,
  };

  useEffect(() => {
    if (!mounted || modelInitializedRef.current) {
      return;
    }
    modelInitializedRef.current = true;
    if (!isInpaintModel(shared.model)) {
      updateShared({ model: DEFAULT_INPAINT_MODEL });
    }
  }, [mounted, shared.model, updateShared]);

  const onMaskChange = useCallback((nextFile: File | null, nextPreviewUrl: string | null) => {
    setMaskFile(nextFile);
    setMaskPreviewUrl(current => {
      if (current && current !== nextPreviewUrl) {
        URL.revokeObjectURL(current);
      }
      return nextPreviewUrl;
    });
  }, []);

  const clearMaskState = useCallback(() => {
    setMaskFile(null);
    setMaskPreviewUrl(current => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return null;
    });
  }, []);

  const applyGalleryHandoff = useCallback(
    (handoff: {
      prompt: string;
      model?: string;
      queueParams?: WorkflowParamValues;
      file: File | null;
      previewUrl: string | null;
      payload: import('@/lib/gallery-handoff').GalleryHandoffPayload;
    }) => {
      const anatomy = isAnatomyRepairHandoff(handoff.payload);
      setAnatomyRepairMode(anatomy);
      if (anatomy) {
        setMaskDescription(ANATOMY_REPAIR_MASK_DESCRIPTION);
        setChangeDescription(ANATOMY_REPAIR_CHANGE_DESCRIPTION);
        setHandoffQueueParams(handoff.queueParams);
      } else {
        setChangeDescription(handoff.prompt);
        setHandoffQueueParams(handoff.queueParams);
      }
      if (handoff.file) {
        setFile(handoff.file);
        setPreviewUrl(handoff.previewUrl);
      } else if (handoff.previewUrl) {
        setPreviewUrl(handoff.previewUrl);
      }
      clearMaskState();
      const sharedPatch = sharedPatchFromGalleryHandoff(handoff.payload);
      const model = handoff.model ?? handoff.payload.model;
      if (model && isInpaintModel(model)) {
        updateShared({ model: model as ComfyImageModel, ...sharedPatch });
      } else if (anatomy) {
        updateShared({ model: DEFAULT_INPAINT_MODEL, ...sharedPatch });
      } else if (Object.keys(sharedPatch).length > 0) {
        updateShared(sharedPatch);
      }
    },
    [clearMaskState, setChangeDescription, setMaskDescription, updateShared]
  );

  useGalleryHandoff('inpaint', applyGalleryHandoff);

  const onFileChange = useCallback(
    (nextFile: File | null) => {
      setFile(nextFile);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(nextFile ? URL.createObjectURL(nextFile) : null);
      clearMaskState();
    },
    [clearMaskState, previewUrl]
  );

  const assertReadyToQueue = useCallback(() => {
    if (!previewUrl && !file) {
      setError('Upload a source image first.');
      return false;
    }
    if (!output.trim()) {
      setError('Describe what belongs in the masked region.');
      return false;
    }
    if (needsInpaintMask && !maskFile && !maskPreviewUrl) {
      setError('Draw or upload an inpaint mask before queueing.');
      return false;
    }
    setError(null);
    return true;
  }, [file, maskFile, maskPreviewUrl, needsInpaintMask, output, previewUrl]);

  const lintAndSetDirectPrompt = useCallback(async () => {
    if (!output.trim()) {
      return;
    }
    actions.resetStatuses();
    const finalized = await actions.finalizePrompt(output, maskDescription || changeDescription);
    setDirectPrompt(finalized);
  }, [actions, changeDescription, maskDescription, output]);

  const copyOutput = useCallback(async () => {
    if (!output) {
      return;
    }
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy to clipboard.');
    }
  }, [output]);

  if (!mounted) {
    return null;
  }

  return (
    <ToolLayout
      accent={ACCENT}
      badge={<ToolBadge accent={ACCENT}>Inpaint · {selectedModel.comfyNode}</ToolBadge>}
      title="Inpaint"
      description={description}
      sidebar={
        <SharedToolControls
          toolId="inpaint"
          shared={shared}
          onModelChange={model => updateShared({ model })}
          onDetailChange={detail => updateShared({ detail })}
          onWorkflowPresetChange={id => updateShared({ selectedWorkflowFileId: id })}
          recommendFromText={output || changeDescription || maskDescription}
        />
      }
    >
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.inpaint} />
      <EditToolRecipeStrip
        toolId="inpaint"
        shared={shared}
        onApplied={next => updateShared(next)}
      />
      <TurboEditStrengthControls
        model={shared.model}
        tool="inpaint"
        value={normalizeTurboEditStrength(shared.turboEditStrength)}
        onChange={turboEditStrength => updateShared({ turboEditStrength })}
      />
      <HistoryHintSeedPanel
        tool="inpaint"
        hintSource={normalizeSceneHintSource(toolSettings.hintSource)}
        historySeedScope={normalizeHistorySeedScope(toolSettings.historySeedScope)}
        hints={changeDescription || maskDescription}
        randomTheme={toolSettings.randomTheme ?? ''}
        lastHistorySeedEntryId={toolSettings.lastHistorySeedEntryId}
        onHintSourceChange={source => updateToolSettings({ hintSource: source })}
        onHistorySeedScopeChange={scope => updateToolSettings({ historySeedScope: scope })}
        onHintsChange={value => setChangeDescription(value)}
        onRandomThemeChange={theme => updateToolSettings({ randomTheme: theme })}
        onHistorySeedApplied={result =>
          updateToolSettings({
            changeDescription: result.hints,
            lastHistorySeedEntryId: result.entryId,
            hintSource: 'history',
          })
        }
        accentFocusClassName={accentFocusClass(ACCENT)}
      />
      <ToolSection>
        {anatomyRepairMode ? (
          <p className="mb-4 rounded-xl border border-[var(--tint-danger-border)] bg-[var(--tint-danger-bg)] px-3.5 py-3 text-sm leading-relaxed text-[var(--tint-danger-text)]">
            <span className="font-medium text-[var(--tint-danger-text)]">Anatomy repair</span> —
            mask only the bad limb or hand. Prompts are pre-filled; tweak if needed, then queue with
            FLUX Inpaint.
          </p>
        ) : null}
        <FieldLabel>Source image</FieldLabel>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            accept="image/*"
            onChange={event => onFileChange(event.target.files?.[0] ?? null)}
            className="ui-file-input min-w-0 flex-1"
          />
          <ButtonLink href={galleryPickPath('inpaint')} variant="secondary" size="sm">
            Choose from Gallery
          </ButtonLink>
        </div>
        {previewUrl ? (
          <InpaintMaskEditor
            key={previewUrl}
            sourceImageUrl={previewUrl}
            onMaskChange={onMaskChange}
          />
        ) : (
          <p className="rounded-xl border border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] px-3 py-2.5 text-xs text-[var(--tint-warning-text)]">
            Upload a source image to draw or upload the inpaint mask.
          </p>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-1.5">
            <FieldLabel hint="Optional — helps the LLM and instruction builder.">
              Mask region (words)
            </FieldLabel>
            <TextArea
              rows={2}
              value={maskDescription}
              onChange={event => setMaskDescription(event.target.value)}
              placeholder="e.g. sky above the horizon, subject's jacket"
              className={accentFocusClass(ACCENT)}
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>What belongs in the mask</FieldLabel>
            <TextArea
              rows={2}
              value={changeDescription}
              onChange={event => setChangeDescription(event.target.value)}
              placeholder="e.g. dramatic storm clouds with warm edge light"
              className={accentFocusClass(ACCENT)}
            />
          </div>
        </div>

        <FieldLabel hint="Overrides the composed instruction when filled.">
          Prompt override (optional)
        </FieldLabel>
        <TextArea
          rows={3}
          value={directPrompt}
          onChange={event => setDirectPrompt(event.target.value)}
          placeholder="Leave empty to use the composed inpaint instruction…"
          className={`font-mono ${accentFocusClass(ACCENT)}`}
        />

        {output ? (
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)]/80 p-3 text-xs text-[var(--text-secondary)]">
            {output}
          </pre>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <PrimaryButton
            accentClassName={accentButtonClass(ACCENT)}
            data-action="primary-generate"
            onClick={() => {
              if (!assertReadyToQueue()) {
                return;
              }
              void actions.sendComfyUi(output, undefined, undefined, queueImageOptions);
            }}
            disabled={!output.trim()}
          >
            Queue inpaint
          </PrimaryButton>
          <PrimaryButton
            accentClassName={accentButtonClass(ACCENT)}
            onClick={() => void lintAndSetDirectPrompt()}
            disabled={!output.trim()}
          >
            Lint &amp; fix prompt
          </PrimaryButton>
        </div>

        <FieldError>{error}</FieldError>
      </ToolSection>

      <RegionalEditPanel
        slots={regionalSlots}
        onSlotsChange={next => updateToolSettings({ regionalSlots: next })}
        sourceImageUrl={previewUrl}
        accentClassName={accentFocusClass(ACCENT)}
        persistKey="inpaint-regional-edit"
      />

      <EnhancedPromptResult
        output={output}
        onOutputChange={setDirectPrompt}
        provider={output ? 'template' : null}
        comfyNode={selectedModel.comfyNode}
        readinessModel={shared.model}
        readinessDetail={shared.detail}
        copied={copied}
        onCopy={() => void copyOutput()}
        diagnostics={actions.diagnostics}
        onSaveHistory={() =>
          actions.saveHistory({
            prompt: output,
            hints: maskDescription || changeDescription,
          })
        }
        onSendComfyUi={() => {
          if (!assertReadyToQueue()) {
            return;
          }
          void actions.sendComfyUi(output, undefined, undefined, queueImageOptions);
        }}
        {...promptResultPreviewProps(actions, output)}
        {...continueEditResultProps(actions, output, { queueImageOptions })}
        onFixPrompt={() => void actions.fixPrompt(output, setDirectPrompt, maskDescription)}
        onCopyPair={() => void actions.copyPromptPair(output)}
        onCompact={() => void actions.compactPrompt(output, setDirectPrompt)}
        onReformat={() => void actions.reformatForModel(output, setDirectPrompt)}
        reformatTargetLabel={getReformatTargetLabel(shared.model)}
        onRunPipeline={() => {
          if (!assertReadyToQueue()) {
            return;
          }
          void actions.runExportPipeline(output, setDirectPrompt, {
            queueComfyUi: true,
            ...queueImageOptions,
          });
        }}
        onExportSidecar={() =>
          void actions.exportSidecar(output, { comfyNode: selectedModel.comfyNode })
        }
        fixStatus={actions.fixStatus}
        compactStatus={actions.compactStatus}
        reformatStatus={actions.reformatStatus}
        pipelineStatus={actions.pipelineStatus}
        comfyUiStatus={actions.comfyUiStatus}
        comfyUiJob={actions.comfyUiJob}
        comfyUiPreviewUrl={actions.comfyUiPreviewUrl}
        historySaved={actions.historySaved}
        pairCopied={actions.pairCopied}
      />
      <MobileStickyQueueBar
        disabled={!output.trim()}
        label="Queue inpaint"
        status={actions.comfyUiStatus}
        primaryGenerate
        onQueue={() => {
          if (!assertReadyToQueue()) {
            return;
          }
          void actions.sendComfyUi(output, undefined, undefined, queueImageOptions);
        }}
      >
        <div className="mb-2">
          <EditToolRecipeStrip
            toolId="inpaint"
            shared={shared}
            onApplied={next => updateShared(next)}
            compact
          />
        </div>
      </MobileStickyQueueBar>
    </ToolLayout>
  );
}
