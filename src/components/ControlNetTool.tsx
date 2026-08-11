'use client';

import { TOOL_SETUP_LABELS } from '@/lib/tool-page-chrome';

import { useCallback, useMemo, useState } from 'react';
import EnhancedPromptResult from '@/components/LazyEnhancedPromptResult';
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
import { promptResultPreviewProps } from '@/lib/prompt-result-preview-props';
import { DEFAULT_CONTROLNET_TOOL_CACHE, type ControlNetSlotPreset } from '@/lib/settings-cache';
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import { normalizeControlNetMode, type ControlNetMode } from '@/lib/controlnet-prompt';

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
import { FieldLabel } from '@/components/ui/Field';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import { Button, PrimaryButton } from '@/components/ui/Button';

const ACCENT = 'cyan' as const;

const MODES: { id: ControlNetMode; label: string }[] = [
  { id: 'depth', label: 'Depth' },
  { id: 'pose', label: 'Pose' },
  { id: 'canny', label: 'Canny / edges' },
  { id: 'normal', label: 'Normal map' },
  { id: 'lineart', label: 'Lineart' },
];

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.readAsDataURL(file);
  });
}

export default function ControlNetTool() {
  const description = useToolPageDescription(
    'Structure-focused prompts for depth, pose, canny, and lineart conditioning.',
    'Guide structure with depth, pose, canny, or lineart — then generate.'
  );
  const { mounted, shared, toolSettings, updateShared, updateToolSettings } = useCachedSettings(
    'controlnet',
    DEFAULT_CONTROLNET_TOOL_CACHE
  );
  const actions = usePromptResultActions({
    tool: 'controlnet',
    model: shared.model,
    detail: shared.detail,
    hints: '',
    autoFixRules: shared.autoFixRules !== false,
    reformatTarget: getReformatTargetModel(shared.model),
  });

  const mode = normalizeControlNetMode(toolSettings.mode);
  const subject = toolSettings.subject ?? '';
  const scene = toolSettings.scene ?? '';
  const detailNotes = toolSettings.detailNotes ?? '';
  const slotStrengths = normalizeSlotStrengths(toolSettings.slotStrengths);
  const slotModes = normalizeSlotModes(toolSettings.slotModes, mode);
  const presets = useMemo(
    () => (Array.isArray(toolSettings.presets) ? toolSettings.presets : []),
    [toolSettings.presets]
  );
  const [presetNameDraft, setPresetNameDraft] = useState('');
  const setSlotStrengths = useCallback(
    (updater: number[] | ((previous: number[]) => number[])) => {
      const previous = normalizeSlotStrengths(toolSettings.slotStrengths);
      const next = typeof updater === 'function' ? updater(previous) : updater;
      updateToolSettings({ slotStrengths: normalizeSlotStrengths(next) });
    },
    [toolSettings.slotStrengths, updateToolSettings]
  );
  const setSlotModes = useCallback(
    (updater: ControlNetMode[] | ((previous: ControlNetMode[]) => ControlNetMode[])) => {
      const previous = normalizeSlotModes(toolSettings.slotModes, mode);
      const next = typeof updater === 'function' ? updater(previous) : updater;
      updateToolSettings({ slotModes: normalizeSlotModes(next, mode) });
    },
    [mode, toolSettings.slotModes, updateToolSettings]
  );
  const setMode = useCallback(
    (value: ControlNetMode) => {
      const nextModes = normalizeSlotModes(toolSettings.slotModes, value);
      nextModes[0] = value;
      updateToolSettings({ mode: value, slotModes: nextModes });
    },
    [toolSettings.slotModes, updateToolSettings]
  );
  const saveSlotPreset = useCallback(() => {
    const name = presetNameDraft.trim() || `Preset ${presets.length + 1}`;
    const preset: ControlNetSlotPreset = {
      id: crypto.randomUUID(),
      name,
      mode,
      subject,
      scene,
      detailNotes,
      slotStrengths,
      slotModes,
      updatedAt: Date.now(),
    };
    updateToolSettings({ presets: [preset, ...presets].slice(0, 24) });
    setPresetNameDraft('');
  }, [
    detailNotes,
    mode,
    presetNameDraft,
    presets,
    scene,
    slotModes,
    slotStrengths,
    subject,
    updateToolSettings,
  ]);
  const loadSlotPreset = useCallback(
    (preset: ControlNetSlotPreset) => {
      const nextMode = normalizeControlNetMode(preset.mode ?? mode);
      updateToolSettings({
        mode: nextMode,
        subject: preset.subject ?? '',
        scene: preset.scene ?? '',
        detailNotes: preset.detailNotes ?? '',
        slotStrengths: normalizeSlotStrengths(preset.slotStrengths),
        slotModes: normalizeSlotModes(preset.slotModes, nextMode),
      });
    },
    [mode, updateToolSettings]
  );
  const deleteSlotPreset = useCallback(
    (id: string) => {
      updateToolSettings({ presets: presets.filter(preset => preset.id !== id) });
    },
    [presets, updateToolSettings]
  );
  const setSubject = useCallback(
    (value: string) => {
      updateToolSettings({ subject: value });
      rememberDraftFields({
        toolKey: 'controlnet',
        label: 'ControlNet',
        href: '/controlnet',
        fields: [value, scene, detailNotes],
      });
    },
    [detailNotes, scene, updateToolSettings]
  );
  const setScene = useCallback(
    (value: string) => {
      updateToolSettings({ scene: value });
      rememberDraftFields({
        toolKey: 'controlnet',
        label: 'ControlNet',
        href: '/controlnet',
        fields: [subject, value, detailNotes],
      });
    },
    [detailNotes, subject, updateToolSettings]
  );
  const setDetailNotes = useCallback(
    (value: string) => {
      updateToolSettings({ detailNotes: value });
      rememberDraftFields({
        toolKey: 'controlnet',
        label: 'ControlNet',
        href: '/controlnet',
        fields: [subject, scene, value],
      });
    },
    [scene, subject, updateToolSettings]
  );
  useSeedToolDraft(mounted, {
    toolKey: 'controlnet',
    label: 'ControlNet',
    href: '/controlnet',
    fields: [subject, scene, detailNotes],
  });
  const [refFile, setRefFile] = useState<File | null>(null);
  const [refPreview, setRefPreview] = useState<string | null>(null);
  const [extraRefFiles, setExtraRefFiles] = useState<Array<File | null>>([null, null, null]);
  const [extraRefPreviews, setExtraRefPreviews] = useState<Array<string | null>>([
    null,
    null,
    null,
  ]);
  const [output, setOutput] = useState('');
  const [rawPrompt, setRawPrompt] = useState<string | undefined>();
  const [source, setSource] = useState<'text' | 'vision' | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [handoffQueueParams, setHandoffQueueParams] = useState<WorkflowParamValues | undefined>();
  const [handoffParentGalleryEntryId, setHandoffParentGalleryEntryId] = useState<
    string | undefined
  >();
  const [handoffSourceImageUrl, setHandoffSourceImageUrl] = useState<string | undefined>();
  const [handoffControlImageUrls, setHandoffControlImageUrls] = useState<Array<string | undefined>>(
    []
  );

  const selectedModel = getComfyModelDefinition(shared.model);
  const hintText = [subject, scene, detailNotes].filter(Boolean).join(' · ');
  const activeSlotFlags = [
    Boolean(refFile || handoffControlImageUrls[0] || handoffSourceImageUrl || refPreview),
    Boolean(extraRefFiles[0] || handoffControlImageUrls[1]),
    Boolean(extraRefFiles[1] || handoffControlImageUrls[2]),
    Boolean(extraRefFiles[2] || handoffControlImageUrls[3]),
  ];
  const activeSlotCount = Math.max(1, activeSlotFlags.filter(Boolean).length);
  const controlNetStrengths = slotStrengths.slice(0, activeSlotCount);
  const controlNetModes = slotModes.slice(0, activeSlotCount);

  const queueControlNetOptions = {
    controlImage: refFile,
    controlImages: [null, ...extraRefFiles] as Array<File | null>,
    controlImageUrl: !refFile ? handoffControlImageUrls[0] || handoffSourceImageUrl : undefined,
    controlImageUrls: [
      undefined,
      ...extraRefFiles.map((file, index) =>
        file ? undefined : handoffControlImageUrls[index + 1]
      ),
    ] as Array<string | undefined>,
    parentGalleryEntryId: handoffParentGalleryEntryId,
    derivedKind: handoffParentGalleryEntryId ? ('controlnet' as const) : undefined,
    sourceImageUrl: handoffSourceImageUrl || refPreview || undefined,
    queueParamsBase: {
      ...handoffQueueParams,
      controlNetMode: slotModes[0] || mode,
      controlNetModes,
      controlNetStrengths,
    },
  };

  function onRefChange(file: File | null) {
    if (refPreview?.startsWith('blob:')) {
      URL.revokeObjectURL(refPreview);
    }
    setRefFile(file);
    setRefPreview(file ? URL.createObjectURL(file) : null);
  }

  function onExtraRefChange(index: number, file: File | null) {
    setExtraRefPreviews(previous => {
      const next = [...previous];
      if (next[index]?.startsWith('blob:')) {
        URL.revokeObjectURL(next[index]!);
      }
      next[index] = file ? URL.createObjectURL(file) : null;
      return next;
    });
    setExtraRefFiles(previous => {
      const next = [...previous];
      next[index] = file;
      return next;
    });
  }

  function applyGalleryHandoff(handoff: {
    prompt: string;
    model?: string;
    queueParams?: WorkflowParamValues;
    controlImageUrls?: string[];
    file: File | null;
    previewUrl: string | null;
    payload: { galleryEntryId?: string; imageUrl?: string };
  }) {
    setOutput(handoff.prompt);
    setSubject(handoff.prompt.slice(0, 800));
    setHandoffQueueParams(handoff.queueParams);
    setHandoffParentGalleryEntryId(handoff.payload.galleryEntryId?.trim() || undefined);
    const restoredModes = (
      handoff.queueParams?.controlNetModes?.length
        ? handoff.queueParams.controlNetModes
        : [handoff.queueParams?.controlNetMode]
    )
      .map(value => normalizeControlNetMode(value))
      .filter(Boolean) as ControlNetMode[];
    if (restoredModes[0]) {
      setMode(restoredModes[0]);
    }
    setSlotModes(previous => {
      const next = [...previous];
      for (let i = 0; i < 4; i += 1) {
        next[i] = restoredModes[i] ?? restoredModes[0] ?? next[i]!;
      }
      return next;
    });
    const restoredStrengths = (handoff.queueParams?.controlNetStrengths ?? []).map(value => {
      const num = typeof value === 'number' ? value : Number(value);
      return Number.isFinite(num) ? Math.min(2, Math.max(0, num)) : 1;
    });
    if (restoredStrengths.length > 0) {
      setSlotStrengths(previous => {
        const next = [...previous];
        for (let i = 0; i < 4; i += 1) {
          next[i] = restoredStrengths[i] ?? restoredStrengths[0] ?? next[i]!;
        }
        return next;
      });
    }
    const controlUrls = (handoff.controlImageUrls ?? [])
      .map(url => url?.trim() || '')
      .filter(Boolean);
    setHandoffControlImageUrls(controlUrls);
    const primaryUrl =
      controlUrls[0] || handoff.previewUrl?.trim() || handoff.payload.imageUrl?.trim() || undefined;
    setHandoffSourceImageUrl(primaryUrl);
    if (handoff.model) {
      updateShared({ model: handoff.model as typeof shared.model });
    }
    if (handoff.file) {
      onRefChange(handoff.file);
    } else if (primaryUrl) {
      setRefPreview(primaryUrl);
    }
    const extras = controlUrls.slice(1, 4);
    if (extras.length > 0) {
      setExtraRefPreviews(previous => {
        const next = [...previous];
        for (let i = 0; i < 3; i += 1) {
          if (next[i]?.startsWith('blob:')) {
            URL.revokeObjectURL(next[i]!);
          }
          next[i] = extras[i] ?? null;
        }
        return next;
      });
    }
  }

  useGalleryHandoff('controlnet', applyGalleryHandoff);

  async function generate() {
    setLoading(true);
    setError(null);
    setCopied(false);
    actions.resetStatuses();

    try {
      const payload: Record<string, unknown> = {
        mode,
        subject,
        scene,
        detail: detailNotes,
        model: shared.model,
        detailLevel: shared.detail,
      };
      if (refFile) {
        payload.image = await fileToDataUrl(refFile);
        payload.mimeType = refFile.type || 'image/jpeg';
      }

      const response = await fetch('/api/controlnet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as {
        prompt?: string;
        error?: string;
        source?: 'text' | 'vision';
      };
      if (!response.ok) {
        throw new Error(data.error ?? 'ControlNet prompt failed.');
      }

      const serverPrompt = data.prompt ?? '';
      const prompt = await actions.finalizePrompt(serverPrompt, hintText);
      setRawPrompt(
        serverPrompt.trim() && serverPrompt.trim() !== prompt.trim()
          ? serverPrompt.trim()
          : undefined
      );
      setOutput(prompt);
      setSource(data.source ?? (refFile ? 'vision' : 'text'));
    } catch (err) {
      setOutput('');
      setRawPrompt(undefined);
      setError(err instanceof Error ? err.message : 'ControlNet prompt failed.');
    } finally {
      setLoading(false);
    }
  }

  async function copyOutput() {
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
  }

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
            className={`w-full accent-cyan-500 ${accentFocusClass()}`}
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
        <input
          type="file"
          accept="image/*"
          onChange={event => onRefChange(event.target.files?.[0] ?? null)}
          className="block w-full text-sm text-[var(--text-muted)] file:mr-4 file:rounded-lg file:border-0 file:bg-cyan-700 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
        />
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
                    className="block w-full text-xs text-[var(--text-muted)] file:mr-2 file:rounded-md file:border-0 file:bg-[var(--bg-muted)] file:px-2 file:py-1.5 file:text-xs file:text-[var(--text-primary)]"
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
                        className={`w-full accent-cyan-500 ${accentFocusClass()}`}
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
            <p className="text-xs text-cyan-300/80">Generated from reference image + {mode} mode</p>
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
          onQueue={() => void actions.sendComfyUi(output, null, undefined, queueControlNetOptions)}
        />
      ) : null}
    </ToolLayout>
  );
}
