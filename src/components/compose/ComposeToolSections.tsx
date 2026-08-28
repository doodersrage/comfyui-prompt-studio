'use client';

import { promptResultPreviewProps } from '@/lib/prompt-result-preview-props';
import EnhancedPromptResult from '@/components/LazyEnhancedPromptResult';
import { resolveCollabFieldValue } from '@/lib/collab-presence';
import CollabPresenceBar from '@/components/CollabPresenceBar';
import MobileStickyQueueBar from '@/components/MobileStickyQueueBar';
import InpaintMaskEditor from '@/components/InpaintMaskEditor';
import RegionalEditPanel from '@/components/RegionalEditPanel';
import SharedToolControls from '@/components/SharedToolControls';
import ToolSetupBanner from '@/components/ToolSetupBanner';
import EditToolRecipeStrip from '@/components/EditToolRecipeStrip';
import { HistoryHintSeedPanel } from '@/components/scene-tool/HistoryHintSeedPanel';
import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';
import { continueEditResultProps } from '@/lib/continue-edit-result-props';
import { isBooguEditModel, isFluxKleinModel, isZImageModel } from '@/lib/model-denoise-defaults';
import { normalizeTurboEditStrength } from '@/lib/turbo-edit-strength';
import TurboEditStrengthControls from '@/components/TurboEditStrengthControls';
import { getReformatTargetLabel } from '@/lib/reformat-target';
import { Z_IMAGE_COMPOSE_PROMPT_ONLY_WARNING } from '@/lib/compose-prompt';
import {
  normalizeComposeIdentityKind,
  normalizeComposeIdentityLockStrength,
  type ComposeIdentityKind,
} from '@/lib/compose-identity-lock';
import { galleryPickPath } from '@/lib/gallery-handoff';
import { CLOUD_COMPOSE_SINGLE_REF_WARNING } from '@/lib/cloud-compose-refs';
import { isCloudEngine } from '@/lib/engine/capabilities';
import { normalizeHistorySeedScope, normalizeSceneHintSource } from '@/lib/scene-hint-source';
import {
  ToolBadge,
  ToolLayout,
  ToolSection,
  CollapsibleSection,
  accentButtonClass,
  accentFocusClass,
} from '@/components/ui/ToolPageShell';
import { ChipButton, FieldError, FieldLabel, TextArea } from '@/components/ui/Field';
import { ButtonLink, PrimaryButton } from '@/components/ui/Button';
import VisionScanButton from '@/components/VisionScanButton';
import type { useComposeToolOrchestration } from '@/hooks/useComposeToolOrchestration';

const ACCENT = 'cyan' as const;

type ComposeToolViewModel = ReturnType<typeof useComposeToolOrchestration>;

type ComposeToolSectionsProps = ComposeToolViewModel & {
  description: string;
};

export default function ComposeToolSections({
  description,
  shared,
  toolSettings,
  updateShared,
  updateToolSettings,
  slots,
  maskPreviewUrl,
  showMaskEditor,
  setShowMaskEditor,
  output,
  setOutput,
  error,
  copied,
  isolating,
  scanning,
  isolateStatus,
  instruction,
  setInstruction,
  mode,
  setMode,
  isolateSubject,
  scanWithVision,
  actions,
  selectedModel,
  filledCount,
  cloudComposeSingleRef,
  onMaskChange,
  assignFigure,
  identityLock,
  identityLockStrength,
  identityKind,
  identityLockHint,
  regionalSlots,
  queueImageOptions,
  assertReadyToQueue,
  applyTemplate,
  copyOutput,
  templateGroups,
  fig1Preview,
  templateMinFigures,
  booguEditModel,
  zImageModel,
  showPoseUnlockHint,
}: ComposeToolSectionsProps) {
  return (
    <ToolLayout
      accent={ACCENT}
      badge={<ToolBadge accent={ACCENT}>Compose · {selectedModel.comfyNode}</ToolBadge>}
      title="Compose"
      description={description}
      sidebar={
        <SharedToolControls
          toolId="compose"
          shared={shared}
          onModelChange={model => updateShared({ model })}
          onDetailChange={detail => updateShared({ detail })}
          onWorkflowPresetChange={id => updateShared({ selectedWorkflowFileId: id })}
          recommendFromText={output || instruction}
          onSharedSettingsChange={updateShared}
        />
      }
    >
      <ToolSetupBanner toolLabel={TOOL_SETUP_LABELS.compose} />
      <EditToolRecipeStrip
        toolId="compose"
        shared={shared}
        onApplied={next => updateShared(next)}
      />
      <HistoryHintSeedPanel
        tool="compose"
        hintSource={normalizeSceneHintSource(toolSettings.hintSource)}
        historySeedScope={normalizeHistorySeedScope(toolSettings.historySeedScope)}
        hints={instruction}
        randomTheme={toolSettings.randomTheme ?? ''}
        lastHistorySeedEntryId={toolSettings.lastHistorySeedEntryId}
        onHintSourceChange={source => updateToolSettings({ hintSource: source })}
        onHistorySeedScopeChange={scope => updateToolSettings({ historySeedScope: scope })}
        onHintsChange={setInstruction}
        onRandomThemeChange={theme => updateToolSettings({ randomTheme: theme })}
        onHistorySeedApplied={result =>
          updateToolSettings({
            instruction: result.hints,
            lastHistorySeedEntryId: result.entryId,
            hintSource: 'history',
          })
        }
        accentFocusClassName={accentFocusClass(ACCENT)}
      />
      <CollabPresenceBar
        tool="compose"
        draft={instruction}
        draftFields={{ instruction }}
        onApplyRemoteDraft={payload => {
          const next = resolveCollabFieldValue(payload, 'instruction');
          if (next) {
            setInstruction(next);
          }
        }}
      />
      <ToolSection>
        <FieldLabel>Mode</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {(
            [
              { id: 'transfer' as const, label: 'Transfer', hint: '≥2 images' },
              { id: 'modify' as const, label: 'Modify', hint: 'Image 1 only' },
            ] as const
          ).map(entry => {
            const active = mode === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => setMode(entry.id)}
                className={[
                  'rounded-xl border px-3.5 py-2 text-sm transition',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]',
                  active
                    ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-text)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-muted)] text-[var(--text-secondary)] hover:border-[var(--border-default)] hover:bg-[var(--bg-muted)]/60 hover:text-[var(--text-primary)]',
                ].join(' ')}
              >
                <span className="font-medium">{entry.label}</span>
                <span className="ml-2 text-xs opacity-70">{entry.hint}</span>
              </button>
            );
          })}
        </div>

        {showPoseUnlockHint ? (
          <div className="rounded-xl border border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] px-3.5 py-3 text-xs leading-relaxed text-[var(--tint-warning-text)]">
            <p className="font-medium text-[var(--tint-warning-text)]/95">
              {booguEditModel ? 'Boogu Edit' : 'Qwen Edit'} locks Image 1 pose
            </p>
            <p className="mt-1.5 text-[var(--tint-warning-text)]/80">
              ReferenceLatent + vision encoding anchor Image 1&apos;s body pose and framing —
              denoise 1 is correct and won&apos;t unlock a sitting subject by itself.
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-[var(--tint-warning-text)]/75">
              <li>
                <strong className="font-medium text-[var(--tint-warning-text)]/90">
                  Pose changes:
                </strong>{' '}
                use <strong className="font-medium">Transfer</strong> — Image 1 = face, Image 2 =
                standing/action reference photo.
              </li>
              <li>
                <strong className="font-medium text-[var(--tint-warning-text)]/90">Modify</strong>{' '}
                works best for relight, wardrobe, and background swaps on the existing pose.
              </li>
              {identityLock ? (
                <li>
                  Turn off <strong className="font-medium">identity lock</strong> if enabled — it
                  adds extra appearance anchoring.
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}

        <FieldLabel hint="Image 1 is the base canvas. Isolate on white cuts Image 1 so the original background cannot leak. Images 2–4 stay intact as pose and scene donors.">
          Images
        </FieldLabel>
        <div className="flex flex-wrap items-center gap-2">
          <ChipButton
            active={isolateSubject}
            disabled={isolating}
            title="Cut Image 1 out and place them on a white backdrop before queueing. First use downloads a small on-device model. Continue-edit gallery handoffs skip this so the full canvas stays."
            onClick={() => {
              const next = !isolateSubject;
              updateToolSettings({ isolateSubject: next });
              const slot0 = slots[0];
              const original = slot0?.originalFile ?? slot0?.file;
              if (!original && !slot0?.originalPreviewUrl && !slot0?.previewUrl) {
                return;
              }
              if (!next) {
                void assignFigure(0, original, {
                  skipIsolate: true,
                  previewUrl: original ? undefined : slot0?.originalPreviewUrl || slot0?.previewUrl,
                });
                return;
              }
              void assignFigure(0, original, {
                isolate: true,
                previewUrl: original ? undefined : slot0?.originalPreviewUrl || slot0?.previewUrl,
              });
            }}
          >
            Isolate on white
          </ChipButton>
          {isolateStatus ? (
            <span className="text-xs text-[var(--text-muted)]">{isolateStatus}</span>
          ) : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {slots.map((slot, index) => {
            const required = index === 0 || (mode === 'transfer' && index === 1);
            const disabled = (mode === 'modify' && index > 0) || (index === 0 && isolating);
            return (
              <div
                key={`figure-${index + 1}`}
                className={[
                  'rounded-2xl border p-3 transition',
                  disabled && !(index === 0 && isolating)
                    ? 'border-[var(--border-subtle)]/80 bg-[var(--bg-muted)]/20 opacity-45'
                    : 'border-[var(--border-subtle)] bg-gradient-to-b from-[var(--bg-muted)]/50 to-[var(--bg-base)]/40',
                ].join(' ')}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    Image {index + 1}
                    {required ? (
                      <span className="ml-1.5 text-xs font-normal text-[var(--accent-text)]">
                        required
                      </span>
                    ) : null}
                    {index === 0 && slot.isolated ? (
                      <span className="ml-1.5 text-xs font-normal text-[var(--text-muted)]">
                        on white
                      </span>
                    ) : null}
                  </p>
                  {slot.previewUrl ? (
                    <button
                      type="button"
                      disabled={mode === 'modify' && index > 0}
                      onClick={() => void assignFigure(index, null)}
                      className="rounded-lg px-2 py-1 text-xs text-[var(--text-muted)] transition hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] disabled:pointer-events-none"
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <input
                    type="file"
                    accept="image/*"
                    disabled={disabled}
                    onChange={event => {
                      const file = event.target.files?.[0] ?? null;
                      event.target.value = '';
                      void assignFigure(index, file);
                    }}
                    className="ui-file-input w-full disabled:opacity-50"
                  />
                  {index === 0 ? (
                    <>
                      <ButtonLink
                        href={galleryPickPath('compose')}
                        variant="secondary"
                        size="sm"
                        className="w-full justify-center"
                      >
                        Choose from Gallery
                      </ButtonLink>
                      <VisionScanButton
                        disabled={!slot.file && !slot.previewUrl}
                        scanning={scanning}
                        onClick={() => void scanWithVision()}
                      />
                    </>
                  ) : null}
                </div>
                {slot.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={slot.previewUrl}
                    alt={`Image ${index + 1} preview`}
                    className={[
                      'mt-3 max-h-40 w-full rounded-xl border border-[var(--border-subtle)] object-contain',
                      index === 0 && slot.isolated ? 'bg-white' : '',
                    ].join(' ')}
                  />
                ) : (
                  <p className="mt-3 text-xs text-[var(--text-muted)]">
                    {index === 0 ? 'Base / canvas image' : `Optional donor for transfer`}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        {isFluxKleinModel(shared.model) ? (
          <p className="text-xs leading-relaxed text-[var(--text-muted)]">
            Klein: instruction edit via ReferenceLatent (denoise 1). Write a short command — e.g.
            “Replace the background with a rainy neon alley. Keep the subject’s pose and framing.”
            Distilled is 4-step CFG 1 — use Gentle / Balanced / Strong so it does not rewrite the
            frame.
          </p>
        ) : zImageModel ? (
          <p className="mb-4 text-xs leading-relaxed text-[var(--text-muted)]">
            {Z_IMAGE_COMPOSE_PROMPT_ONLY_WARNING} Figure 1 is VAEEncode img2img. Turbo uses Gentle /
            Balanced / Strong so identity holds. There is no vision-encode node for extras — do not
            expect Image 2–4 to be sampled.
          </p>
        ) : isBooguEditModel(shared.model) ? (
          <p className="text-xs leading-relaxed text-[var(--text-muted)]">
            Boogu Edit: TextEncodeBooguEdit vision-encodes Image 1–4. Write a short instruction and
            name Image 1, Image 2, etc. Denoise stays 1 — Turbo strength wraps the prompt instead.
          </p>
        ) : null}
        <TurboEditStrengthControls
          model={shared.model}
          tool="compose"
          value={normalizeTurboEditStrength(shared.turboEditStrength)}
          onChange={turboEditStrength => updateShared({ turboEditStrength })}
        />
        {cloudComposeSingleRef ? (
          <p className="mb-4 text-xs leading-relaxed text-[var(--text-muted)]">
            {CLOUD_COMPOSE_SINGLE_REF_WARNING} Use Fal Kontext multi as the image-to-image model to
            attach Image 2–4, or queue on local Comfy.
          </p>
        ) : null}

        {isCloudEngine(shared.inferenceEngine) ? (
          <p className="mb-4 text-xs leading-relaxed text-[var(--text-muted)]">
            Identity lock (IP-Adapter / InstantID / PuLID) is local Comfy only. Cloud img2img sends
            Image 1 to the API.
          </p>
        ) : !zImageModel ? (
          <div className="ui-recipe-shell space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={identityLock}
                  onChange={event => updateToolSettings({ identityLock: event.target.checked })}
                  className="ui-checkbox mt-1 accent-[var(--accent)]"
                />
                <span className="min-w-0 space-y-1">
                  <span className="block text-sm font-medium text-[var(--accent-text)]">
                    Lock identity from Image 1
                  </span>
                  <span className="block text-xs leading-relaxed text-[var(--text-muted)]">
                    {identityLockHint}
                  </span>
                </span>
              </label>
              <label className="shrink-0 space-y-1">
                <span className="type-caption text-[var(--accent-text)]">Kind</span>
                <select
                  value={identityKind}
                  disabled={!identityLock}
                  onChange={event =>
                    updateToolSettings({
                      identityKind: normalizeComposeIdentityKind(event.target.value),
                    })
                  }
                  className="block rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-muted)]/70 px-2.5 py-1.5 text-sm text-[var(--text-primary)] transition hover:border-[var(--border-default)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {(
                    [
                      { id: 'ipadapter' as const, label: 'IP-Adapter' },
                      { id: 'instantid' as const, label: 'InstantID' },
                      { id: 'pulid' as const, label: 'PuLID' },
                      { id: 'auto' as const, label: 'Auto' },
                    ] satisfies Array<{ id: ComposeIdentityKind; label: string }>
                  ).map(entry => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {identityLock ? (
              <label className="block space-y-1.5 pl-7">
                <span className="type-caption text-[var(--accent-text)]">
                  {identityKind === 'ipadapter'
                    ? 'IP-Adapter'
                    : identityKind === 'instantid'
                      ? 'InstantID'
                      : identityKind === 'pulid'
                        ? 'PuLID'
                        : 'Identity'}{' '}
                  strength — {identityLockStrength.toFixed(2)}
                </span>
                <input
                  type="range"
                  min={0.15}
                  max={0.85}
                  step={0.05}
                  value={identityLockStrength}
                  onChange={event =>
                    updateToolSettings({
                      identityLockStrength: normalizeComposeIdentityLockStrength(
                        event.target.value
                      ),
                    })
                  }
                  className="w-full accent-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                />
              </label>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setShowMaskEditor(value => !value)}
            disabled={!fig1Preview}
            className={[
              'rounded-xl border px-3 py-2 text-sm transition',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]',
              'disabled:cursor-not-allowed disabled:opacity-40',
              showMaskEditor
                ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] text-[var(--accent-text)]'
                : 'border-[var(--border-subtle)] bg-[var(--bg-muted)] text-[var(--text-secondary)] hover:border-[var(--border-default)] hover:text-[var(--text-primary)]',
            ].join(' ')}
          >
            {showMaskEditor ? 'Hide optional mask' : 'Optional mask on Image 1'}
          </button>
          {maskPreviewUrl ? (
            <span className="text-xs text-[var(--text-muted)]">Mask ready</span>
          ) : null}
        </div>

        {showMaskEditor && fig1Preview ? (
          <InpaintMaskEditor
            key={fig1Preview}
            sourceImageUrl={fig1Preview}
            onMaskChange={onMaskChange}
          />
        ) : null}

        <RegionalEditPanel
          slots={regionalSlots}
          onSlotsChange={next => updateToolSettings({ regionalSlots: next })}
          sourceImageUrl={fig1Preview}
          accentClassName={accentFocusClass(ACCENT)}
          persistKey="compose-regional-edit"
        />

        <CollapsibleSection
          title="Starter templates"
          summary={`${templateGroups.reduce((n, g) => n + g.templates.length, 0)} presets — click to expand`}
          defaultOpen={false}
          persistKey={`compose-templates-${mode}`}
          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-muted)] p-4"
        >
          <div className="space-y-4">
            {templateGroups.map(group => (
              <div key={group.id} className="space-y-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
                  {group.label}
                </p>
                <div className="flex flex-wrap gap-2">
                  {group.templates.map(template => {
                    const minFigures = templateMinFigures(template);
                    const disabled = filledCount < minFigures;
                    return (
                      <button
                        key={template.id}
                        type="button"
                        disabled={disabled}
                        title={
                          disabled
                            ? `Needs at least ${minFigures} image${minFigures === 1 ? '' : 's'} uploaded`
                            : template.instruction
                        }
                        onClick={() => applyTemplate(template.instruction)}
                        className={[
                          'rounded-xl border px-3 py-1.5 text-xs transition',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]',
                          disabled
                            ? 'cursor-not-allowed border-[var(--border-subtle)]/60 bg-[var(--bg-muted)]/30 text-[var(--text-muted)]'
                            : 'border-[var(--border-subtle)] bg-[var(--bg-muted)]/45 text-[var(--text-secondary)] hover:border-[var(--accent-border)] hover:bg-[var(--accent-muted)] hover:text-[var(--accent-text)]',
                        ].join(' ')}
                      >
                        {template.label}
                        {minFigures > 1 ? (
                          <span className="ml-1 text-[10px] text-[var(--text-muted)]">
                            · {minFigures}img
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </CollapsibleSection>

        <FieldLabel>
          {mode === 'transfer' ? 'Transfer instruction' : 'Modify instruction'}
        </FieldLabel>
        <TextArea
          rows={5}
          value={instruction}
          onChange={event => setInstruction(event.target.value)}
          placeholder={
            mode === 'transfer'
              ? 'Take the jacket from Image 2 and apply it to the person in Image 1…'
              : 'keep: subject face and pose\nreplace: background with misty forest…'
          }
          className={`font-mono ${accentFocusClass(ACCENT)}`}
        />

        <PrimaryButton
          accentClassName={accentButtonClass(ACCENT)}
          data-action="primary-generate"
          onClick={() => {
            if (!assertReadyToQueue()) {
              return;
            }
            void actions.finalizePrompt(output, instruction).then(finalized => {
              setOutput(finalized);
            });
          }}
          disabled={!instruction.trim()}
        >
          Prepare instruction
        </PrimaryButton>

        <FieldError>{error}</FieldError>
      </ToolSection>

      <EnhancedPromptResult
        output={output}
        onOutputChange={setOutput}
        provider={output ? 'llm' : null}
        comfyNode={selectedModel.comfyNode}
        readinessModel={shared.model}
        readinessDetail={shared.detail}
        copied={copied}
        onCopy={() => void copyOutput()}
        diagnostics={actions.diagnostics}
        onSaveHistory={() =>
          actions.saveHistory({
            prompt: output,
            hints: instruction,
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
        onFixPrompt={() => void actions.fixPrompt(output, setOutput, instruction)}
        onCopyPair={() => void actions.copyPromptPair(output)}
        onCompact={() => void actions.compactPrompt(output, setOutput)}
        onReformat={() => void actions.reformatForModel(output, setOutput)}
        reformatTargetLabel={getReformatTargetLabel(shared.model)}
        onRunPipeline={() => {
          if (!assertReadyToQueue()) {
            return;
          }
          void actions.runExportPipeline(output, setOutput, {
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
        label="Queue Compose"
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
            toolId="compose"
            shared={shared}
            onApplied={next => updateShared(next)}
            compact
          />
        </div>
      </MobileStickyQueueBar>
    </ToolLayout>
  );
}
