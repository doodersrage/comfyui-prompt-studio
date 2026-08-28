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

export function useControlNetToolOrchestration() {
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
  const [scanning, setScanning] = useState(false);
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

  async function scanWithVision() {
    const preview = refPreview || handoffSourceImageUrl || handoffControlImageUrls[0];
    if (!refFile && !preview) {
      setError('Upload a reference image first.');
      return;
    }
    setScanning(true);
    setError(null);
    try {
      const image = await resolveLocalImageFile(refFile, preview, 'controlnet-ref.png');
      const prompt = await scanStillWithVision({
        image,
        purpose: 'controlnet',
        model: shared.model,
        detail: shared.detail,
        extraHints: [subject, scene].filter(Boolean).join(' · ') || undefined,
        shared,
      });
      setSubject(prompt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Vision scan failed.');
    } finally {
      setScanning(false);
    }
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
    payload: GalleryHandoffPayload;
  }) {
    setOutput(handoff.prompt);
    setSubject(handoff.prompt.slice(0, 800));
    setHandoffQueueParams(handoff.queueParams);
    setHandoffParentGalleryEntryId(handoff.payload.galleryEntryId?.trim() || undefined);
    const sharedPatch = sharedPatchFromGalleryHandoff(handoff.payload);
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
      updateShared({ model: handoff.model as typeof shared.model, ...sharedPatch });
    } else if (Object.keys(sharedPatch).length > 0) {
      updateShared(sharedPatch);
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
        ...sharedLlmRequestBody(shared),
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

  return {
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
  };
}
