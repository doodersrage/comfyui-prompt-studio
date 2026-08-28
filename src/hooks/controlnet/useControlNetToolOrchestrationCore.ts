'use client';

import { useCallback, useMemo, useState } from 'react';
import { useCachedSettings } from '@/hooks/useCachedSettings';
import { useSeedToolDraft } from '@/hooks/useSeedToolDraft';
import { usePromptResultActions } from '@/hooks/usePromptResultActions';
import { getComfyModelDefinition } from '@/lib/comfy-models/client';
import type { WorkflowParamValues } from '@/lib/comfyui-config';
import { getReformatTargetModel } from '@/lib/reformat-target';
import { DEFAULT_CONTROLNET_TOOL_CACHE, type ControlNetSlotPreset } from '@/lib/settings-cache';
import { rememberDraftFields } from '@/lib/remember-draft-fields';
import { normalizeControlNetMode, type ControlNetMode } from '@/lib/controlnet-prompt';
import {
  normalizeSlotModes,
  normalizeSlotStrengths,
} from '@/hooks/controlnet/controlnet-tool-orchestration-utils';

export function useControlNetToolOrchestrationCore() {
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
    setRefFile,
    refPreview,
    setRefPreview,
    scanning,
    setScanning,
    extraRefFiles,
    setExtraRefFiles,
    extraRefPreviews,
    setExtraRefPreviews,
    output,
    setOutput,
    rawPrompt,
    setRawPrompt,
    source,
    setSource,
    loading,
    setLoading,
    error,
    setError,
    copied,
    setCopied,
    handoffQueueParams,
    setHandoffQueueParams,
    handoffParentGalleryEntryId,
    setHandoffParentGalleryEntryId,
    handoffSourceImageUrl,
    setHandoffSourceImageUrl,
    handoffControlImageUrls,
    setHandoffControlImageUrls,
    selectedModel,
    hintText,
    activeSlotFlags,
    activeSlotCount,
    controlNetStrengths,
    controlNetModes,
    queueControlNetOptions,
  };
}

export type ControlNetToolOrchestrationCore = ReturnType<typeof useControlNetToolOrchestrationCore>;
